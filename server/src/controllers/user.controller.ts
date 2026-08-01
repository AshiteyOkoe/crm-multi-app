import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { asyncHandler, ok, created, notFound, badRequest, forbidden, getPagination } from '../utils/helpers';
import { writeAuditLog } from '../utils/audit';
import { env } from '../config/env';
import type { AuthRequest } from '../middleware/auth';

// ======================= BRANCHES =======================

export const listBranches = asyncHandler(async (_req, res) => {
  const branches = await prisma.branch.findMany({
    orderBy: { code: 'asc' },
    include: { _count: { select: { users: true, sales: true } } },
  });
  return ok(res, branches);
});

export const createBranch = asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({ name: z.string().min(2), code: z.string().min(1).max(10), address: z.string().optional(), phone: z.string().optional() });
  const data = schema.parse(req.body);
  const branch = await prisma.branch.create({ data });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'BRANCH_CREATED', entityType: 'Branch', entityId: branch.id, branchId: branch.id });
  return created(res, branch);
});

export const updateBranch = asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({ name: z.string().min(2).optional(), address: z.string().optional(), phone: z.string().optional(), isActive: z.boolean().optional() });
  const data = schema.parse(req.body);
  const branch = await prisma.branch.update({ where: { id: req.params.id }, data });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'BRANCH_UPDATED', entityType: 'Branch', entityId: branch.id, branchId: branch.id });
  return ok(res, branch);
});

// ======================= USERS =======================

export const listUsers = asyncHandler(async (req: AuthRequest, res) => {
  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 50 });
  const role = req.query.role as string | undefined;
  const search = (req.query.search as string) ?? '';

  const where: any = {};
  if (role) where.role = role;
  if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }];
  if (req.user!.role !== 'ADMIN') where.branchId = req.user!.branchId ?? '__none__';

  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' }, include: { branch: { select: { id: true, name: true, code: true } } } }),
    prisma.user.count({ where }),
  ]);

  const sanitized = users.map(({ passwordHash, ...u }) => u);
  return ok(res, { items: sanitized, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

export const createUser = asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    phone: z.string().optional(),
    role: z.enum(['ADMIN', 'BRANCH_MANAGER', 'SALES_STAFF']),
    branchId: z.string().optional(),
  });
  const data = schema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (existing) badRequest('An account with this email already exists');

  if (data.role !== 'ADMIN' && !data.branchId) badRequest('A branch is required for manager and staff accounts');

  const passwordHash = await bcrypt.hash(data.password, env.bcryptSaltRounds);
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email.toLowerCase(), passwordHash, phone: data.phone, role: data.role, branchId: data.branchId ?? null },
  });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'USER_CREATED', entityType: 'User', entityId: user.id, branchId: user.branchId });
  return created(res, { id: user.id, name: user.name, email: user.email, role: user.role, branchId: user.branchId });
});

export const updateUser = asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({
    name: z.string().min(2).optional(),
    phone: z.string().optional(),
    role: z.enum(['ADMIN', 'BRANCH_MANAGER', 'SALES_STAFF']).optional(),
    branchId: z.string().nullable().optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).optional(),
  });
  const data = schema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) notFound('User not found');
  if (req.user!.role !== 'ADMIN' && req.user!.id !== user!.id) forbidden();

  const patch: any = { ...data };
  if (data.password) patch.passwordHash = await bcrypt.hash(data.password, env.bcryptSaltRounds);
  delete patch.password;

  const updated = await prisma.user.update({ where: { id: req.params.id }, data: patch });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'USER_UPDATED', entityType: 'User', entityId: updated.id, branchId: updated.branchId });
  return ok(res, { id: updated.id, name: updated.name, email: updated.email, role: updated.role, branchId: updated.branchId, isActive: updated.isActive });
});

// ======================= NOTIFICATIONS =======================

export const listNotifications = asyncHandler(async (req: AuthRequest, res) => {
  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 20 });
  const [items, total] = await Promise.all([
    prisma.notification.findMany({ where: { userId: req.user!.id }, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.notification.count({ where: { userId: req.user!.id } }),
  ]);
  return ok(res, { items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

export const markNotificationsRead = asyncHandler(async (req: AuthRequest, res) => {
  const ids = (req.body?.ids as string[]) ?? [];
  if (req.body?.all) {
    await prisma.notification.updateMany({ where: { userId: req.user!.id, isRead: false }, data: { isRead: true } });
  } else if (ids.length) {
    await prisma.notification.updateMany({ where: { id: { in: ids }, userId: req.user!.id }, data: { isRead: true } });
  }
  return ok(res, { marked: true });
});

// ======================= AUDIT LOGS =======================

export const listAuditLogs = asyncHandler(async (req: AuthRequest, res) => {
  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 25 });
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.auditLog.count(),
  ]);
  return ok(res, { items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

// ======================= RETURNS (manager/owner approval) =======================

export const listReturns = asyncHandler(async (req: AuthRequest, res) => {
  const status = req.query.status as string | undefined;
  const branchId = req.query.branchId as string | undefined;
  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 20 });

  const where: any = {};
  if (status) where.status = status;
  if (branchId) {
    if (req.user!.role !== 'ADMIN' && branchId !== req.user!.branchId) forbidden();
    where.branchId = branchId;
  } else if (req.user!.role !== 'ADMIN') {
    where.branchId = req.user!.branchId;
  }

  const [items, total] = await Promise.all([
    prisma.return.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' }, include: { sale: { include: { items: { select: { productName: true, quantity: true, unitPrice: true } } } }, branch: { select: { name: true, code: true } }, user: { select: { name: true } }, approvedBy: { select: { name: true } } } }),
    prisma.return.count({ where }),
  ]);
  return ok(res, { items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

export const approveReturn = asyncHandler(async (req: AuthRequest, res) => {
  const r = await prisma.return.findUnique({ where: { id: req.params.id } });
  if (!r) notFound('Return not found');
  if (req.user!.role !== 'ADMIN' && r.branchId !== req.user!.branchId) forbidden();

  const action = req.body?.action ?? 'APPROVED';
  const status = action === 'REJECTED' ? 'REJECTED' : 'APPROVED';
  if (r.status !== 'PENDING') badRequest('This return has already been processed');

  const updated = await prisma.return.update({ where: { id: r.id }, data: { status, approvedById: req.user!.id } });

  if (status === 'APPROVED') {
    // restore stock to the branch + mark the sale refunded
    const items = await prisma.saleItem.findMany({ where: { saleId: r.saleId } });
    for (const item of items) {
      const bp = await prisma.branchProduct.upsert({
        where: { branchId_productId: { branchId: r.branchId, productId: item.productId } },
        update: { quantity: { increment: item.quantity } },
        create: { branchId: r.branchId, productId: item.productId, quantity: item.quantity },
      });
      void bp;
    }
    await prisma.sale.update({ where: { id: r.saleId }, data: { status: 'REFUNDED' } });
  }

  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: `RETURN_${status}`, entityType: 'Return', entityId: r.id, branchId: r.branchId });
  return ok(res, updated);
});

// ======================= SETTINGS =======================

export const getSettings = asyncHandler(async (_req, res) => {
  const rows = await prisma.appSetting.findMany();
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return ok(res, settings);
});

export const updateSettings = asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({
    businessName: z.string().optional(),
    currency: z.string().max(10).optional(),
    lowStockAlertEnabled: z.string().optional(),
    receiptFooter: z.string().optional(),
  });
  const data = schema.parse(req.body);
  const entries = Object.entries(data);
  for (const [key, value] of entries) {
    await prisma.appSetting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } });
  }
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'SETTINGS_UPDATED', details: data });
  return ok(res, { updated: true });
});
