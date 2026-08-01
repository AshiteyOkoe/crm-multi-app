import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signToken, type AuthRequest } from '../middleware/auth';
import { ok, created, badRequest, unauthorized, asyncHandler } from '../utils/helpers';
import { writeAuditLog } from '../utils/audit';
import { env } from '../config/env';

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  phone: z.string().optional(),
  role: z.enum(['ADMIN', 'BRANCH_MANAGER', 'SALES_STAFF']).optional(),
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
  });
});
