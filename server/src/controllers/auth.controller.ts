import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signToken, type AuthRequest } from '../middleware/auth';
import { ok, created, badRequest, unauthorized, asyncHandler, notFound } from '../utils/helpers';
import { writeAuditLog } from '../utils/audit';
import { sendMessage } from '../utils/mailer';
import { env } from '../config/env';

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  phone: z.string().optional(),
  role: z.enum(['ADMIN', 'BRANCH_MANAGER', 'SALES_STAFF', 'AUDITOR']).optional(),
  branchId: z.string().optional(),
});

export const register = asyncHandler(async (req, res) => {
  // Public registration is limited to SALES_STAFF unless an admin is creating users.
  const data = registerSchema.parse(req.body);
  const requestingAdmin = req.user?.role === 'ADMIN';

  const role = data.role ?? 'SALES_STAFF';
  if (role !== 'SALES_STAFF' && !requestingAdmin) {
    badRequest('Only an admin can create manager or admin accounts');
  }
  if (role !== 'ADMIN' && !data.branchId) {
    badRequest('A branch is required for manager and staff accounts');
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) badRequest('An account with this email already exists', { field: 'email' });

  const passwordHash = await bcrypt.hash(data.password, env.bcryptSaltRounds);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      passwordHash,
      phone: data.phone,
      role,
      branchId: data.branchId ?? null,
    },
  });

  await writeAuditLog({
    userId: req.user?.id ?? user.id,
    userEmail: req.user?.email ?? user.email,
    action: 'USER_REGISTERED',
    entityType: 'User',
    entityId: user.id,
    branchId: user.branchId,
  });

  const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId });
  return created(res, { token, user: { id: user.id, name: user.name, email: user.email, role: user.role, branchId: user.branchId, phone: user.phone } });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const login = asyncHandler(async (req, res) => {
  const data = loginSchema.parse(req.body);
  const user = await prisma.user.findUnique({
    where: { email: data.email.toLowerCase() },
    include: { branch: { select: { id: true, name: true, code: true } } },
  });
  if (!user || !user.isActive) throw unauthorized('Invalid email or password');

  const valid = await bcrypt.compare(data.password, user.passwordHash);
  if (!valid) throw unauthorized('Invalid email or password');

  await writeAuditLog({ userId: user.id, userEmail: user.email, action: 'USER_LOGIN', entityType: 'User', entityId: user.id });
  await prisma.user.update({ where: { id: user.id }, data: {} });

  const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId });
  return ok(res, {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
      phone: user.phone,
      branch: user.branch
        ? { id: user.branch.id, name: user.branch.name, code: user.branch.code }
        : null,
    },
  });
});

export const me = asyncHandler(async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { branch: { select: { id: true, name: true, code: true } } },
  });
  if (!user) throw unauthorized('Account no longer exists');
  return ok(res, {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    branchId: user.branchId,
    branch: user.branch,
    createdAt: user.createdAt,
    emailVerified: user.emailVerified,
  });
});

// ======================= EMAIL VERIFICATION =======================

export const sendVerificationEmail = asyncHandler(async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw unauthorized();
  if (user.emailVerified) return ok(res, { message: 'Email is already verified' });

  const verifyToken = crypto.randomBytes(24).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: { verifyToken, verifyTokenExpires: new Date(Date.now() + 24 * 3600 * 1000) },
  });

  const link = `${env.clientUrl}/verify-email?token=${verifyToken}`;
  await sendMessage({ to: user.email, channel: 'EMAIL', subject: 'Verify your email', body: `Hi ${user.name},\n\nPlease verify your email address:\n${link}\n\nThis link expires in 24 hours.` });
  await writeAuditLog({ userId: user.id, userEmail: user.email, action: 'VERIFICATION_EMAIL_SENT' });
  return ok(res, { message: env.nodeEnv === 'production' ? 'Verification email sent' : `Verification link (dev): ${link}` });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const token = String(req.query.token ?? req.body?.token ?? '');
  if (!token) badRequest('Verification token is required');
  const user = await prisma.user.findFirst({ where: { verifyToken: token, verifyTokenExpires: { gt: new Date() } } });
  if (!user) badRequest('Invalid or expired verification token');
  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true, verifyToken: null, verifyTokenExpires: null } });
  await writeAuditLog({ userId: user.id, userEmail: user.email, action: 'EMAIL_VERIFIED' });
  return ok(res, { verified: true, email: user.email });
});

// ======================= PASSWORD RESET =======================

export const forgotPassword = asyncHandler(async (req, res) => {
  const schema = z.object({ email: z.string().email() });
  const data = schema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (!user) return ok(res, { message: 'If an account with that email exists, a reset link has been sent.' });

  const resetToken = crypto.randomBytes(24).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpires: new Date(Date.now() + 2 * 3600 * 1000) },
  });

  const link = `${env.clientUrl}/reset-password?token=${resetToken}`;
  await sendMessage({ to: user.email, channel: 'EMAIL', subject: 'Reset your password', body: `Hi ${user.name},\n\nReset your password here (expires in 2 hours):\n${link}\n\nIf you did not request this, you can safely ignore this email.` });
  await writeAuditLog({ userId: user.id, userEmail: user.email, action: 'PASSWORD_RESET_REQUESTED' });
  return ok(res, { message: env.nodeEnv === 'production' ? 'If an account with that email exists, a reset link has been sent.' : `Reset link (dev): ${link}` });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const schema = z.object({ token: z.string().min(1), password: z.string().min(8).max(100) });
  const data = schema.parse(req.body);
  const user = await prisma.user.findFirst({ where: { resetToken: data.token, resetTokenExpires: { gt: new Date() } } });
  if (!user) badRequest('Invalid or expired reset token');

  const passwordHash = await bcrypt.hash(data.password, env.bcryptSaltRounds);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, resetToken: null, resetTokenExpires: null } });
  await writeAuditLog({ userId: user.id, userEmail: user.email, action: 'PASSWORD_RESET' });
  return ok(res, { reset: true });
});
