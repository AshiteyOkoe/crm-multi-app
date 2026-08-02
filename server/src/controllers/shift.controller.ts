import { z } from 'zod';
import { ShiftStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, ok, created, notFound, badRequest, forbidden, getPagination, branchScope, assertBranchAllowed } from '../utils/helpers';
import { writeAuditLog, notifyAdmins } from '../utils/audit';
import type { AuthRequest } from '../middleware/auth';

const openShiftSchema = z.object({
  branchId: z.string().optional(),
  openingCash: z.number().min(0).optional(),
  notes: z.string().optional().or(z.literal('')),
});

export const openShift = asyncHandler(async (req: AuthRequest, res) => {
  const data = openShiftSchema.parse(req.body);
  const branchId = data.branchId ?? req.user!.branchId;
  if (!branchId) badRequest('Please select a branch to start your shift');
  assertBranchAllowed(req.user!, branchId);

  const active = await prisma.shift.findFirst({ where: { userId: req.user!.id, status: 'OPEN' } });
  if (active) badRequest('You already have an open shift. Close it first.');

  const shift = await prisma.shift.create({
    data: {
      userId: req.user!.id,
      branchId,
      openingCash: data.openingCash ?? 0,
      notes: data.notes || null,
      status: ShiftStatus.OPEN,
    },
    include: { branch: { select: { id: true, name: true, code: true } }, user: { select: { name: true } } },
  });
  return created(res, shift);
});

export const closeShift = asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({ closingCash: z.number().min(0), notes: z.string().optional().or(z.literal('')) });
  const data = schema.parse(req.body);

  const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
  if (!shift) notFound('Shift not found');
  if (shift.userId !== req.user!.id && req.user!.role !== 'ADMIN') forbidden();
  if (shift.status !== 'OPEN') badRequest('This shift is already closed');

  // expected cash = opening + today's cash sales while the shift was open
  const cashSales = await prisma.sale.aggregate({
    where: { branchId: shift.branchId, paymentMethod: 'CASH', status: 'COMPLETED', userId: shift.userId, createdAt: { gte: shift.clockIn } },
    _sum: { total: true },
  });
  const expectedCash = Math.round((shift.openingCash + (cashSales._sum.total ?? 0)) * 100) / 100;
  const variance = Math.round((data.closingCash - expectedCash) * 100) / 100;

  const updated = await prisma.shift.update({
    where: { id: shift.id },
    data: { clockOut: new Date(), closingCash: data.closingCash, expectedCash, variance, notes: data.notes ?? shift.notes, status: ShiftStatus.CLOSED },
    include: { branch: { select: { name: true, code: true } }, user: { select: { name: true } } },
  });

  if (Math.abs(variance) > 0.01) {
    await notifyAdmins({ type: 'RETURN', title: 'Shift variance', message: `${updated.user.name} (${updated.branch.name}) closed with variance of ${variance}.`, link: '/shifts' });
  }

  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'SHIFT_CLOSED', entityType: 'Shift', entityId: shift.id, branchId: shift.branchId, details: { expectedCash, closingCash: data.closingCash, variance } });
  return ok(res, updated);
});

export const myActiveShift = asyncHandler(async (req: AuthRequest, res) => {
  const shift = await prisma.shift.findFirst({
    where: { userId: req.user!.id, status: 'OPEN' },
    include: { branch: { select: { id: true, name: true, code: true } } },
  });
  return ok(res, shift);
});

export const listShifts = asyncHandler(async (req: AuthRequest, res) => {
  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 20 });
  const status = req.query.status as string | undefined;
  const userId = req.query.userId as string | undefined;

  const where: any = { ...branchScope(req.user!) };
  if (status) where.status = status;
  if (userId) {
    if (req.user!.role !== 'ADMIN' && userId !== req.user!.id) forbidden();
    where.userId = userId;
  }

  const [items, total] = await Promise.all([
    prisma.shift.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { clockIn: 'desc' },
      include: { branch: { select: { id: true, name: true, code: true } }, user: { select: { id: true, name: true } } },
    }),
    prisma.shift.count({ where }),
  ]);
  return ok(res, { items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

export const shiftSummary = asyncHandler(async (req: AuthRequest, res) => {
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const where: any = { ...branchScope(req.user!), status: 'CLOSED' };
  if (from || to) {
    where.clockIn = {};
    if (from) where.clockIn.gte = new Date(from);
    if (to) where.clockIn.lte = new Date(to);
  }

  const shifts = await prisma.shift.findMany({ where, include: { user: { select: { name: true } }, branch: { select: { code: true, name: true } } } });
  const totalCash = shifts.reduce((s, x) => s + (x.closingCash ?? 0), 0);
  const totalVariance = shifts.reduce((s, x) => s + (x.variance ?? 0), 0);
  return ok(res, { totalShifts: shifts.length, totalCash, totalVariance, shifts });
});
