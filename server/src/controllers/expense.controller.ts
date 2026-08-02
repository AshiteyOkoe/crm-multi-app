import { z } from 'zod';
import { ExpenseCategory } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, ok, created, notFound, badRequest, forbidden, getPagination, assertBranchAllowed, branchScope } from '../utils/helpers';
import { writeAuditLog } from '../utils/audit';
import type { AuthRequest } from '../middleware/auth';

const expenseSchema = z.object({
  branchId: z.string().optional(),
  category: z.nativeEnum(ExpenseCategory).optional(),
  description: z.string().min(1).max(300),
  amount: z.number().positive(),
  expenseDate: z.string().optional(),
});

export const listExpenses = asyncHandler(async (req: AuthRequest, res) => {
  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 20 });
  const branchId = req.query.branchId as string | undefined;
  const category = req.query.category as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const where: any = { ...branchScope(req.user!) };
  if (branchId) {
    assertBranchAllowed(req.user!, branchId);
    where.branchId = branchId;
  }
  if (category) where.category = category;
  if (from || to) {
    where.expenseDate = {};
    if (from) where.expenseDate.gte = new Date(from);
    if (to) where.expenseDate.lte = new Date(to);
  }

  const [items, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { expenseDate: 'desc' },
      include: { branch: { select: { id: true, name: true, code: true } }, createdBy: { select: { name: true } } },
    }),
    prisma.expense.count({ where }),
  ]);

  const agg = await prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true });

  return ok(res, { items, total, page, pageSize, pages: Math.ceil(total / pageSize), totalAmount: agg._sum.amount ?? 0, count: agg._count });
});

export const createExpense = asyncHandler(async (req: AuthRequest, res) => {
  if (req.user!.role === 'SALES_STAFF') forbidden('Only managers and admins can record expenses');
  const data = expenseSchema.parse(req.body);
  const branchId = data.branchId ?? req.user!.branchId;
  if (!branchId) badRequest('Please select a branch for this expense');
  assertBranchAllowed(req.user!, branchId);

  const expense = await prisma.expense.create({
    data: {
      branchId,
      category: data.category ?? 'OTHER',
      description: data.description,
      amount: data.amount,
      expenseDate: data.expenseDate ? new Date(data.expenseDate) : undefined,
      createdById: req.user!.id,
    },
    include: { branch: { select: { id: true, name: true, code: true } } },
  });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'EXPENSE_CREATED', entityType: 'Expense', entityId: expense.id, branchId, details: { amount: data.amount, category: data.category } });
  return created(res, expense);
});

export const updateExpense = asyncHandler(async (req: AuthRequest, res) => {
  if (req.user!.role === 'SALES_STAFF') forbidden('Only managers and admins can edit expenses');
  const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
  if (!existing) notFound('Expense not found');
  assertBranchAllowed(req.user!, existing.branchId);

  const data = expenseSchema.partial().parse(req.body);
  const expense = await prisma.expense.update({
    where: { id: req.params.id },
    data: { ...data, expenseDate: data.expenseDate ? new Date(data.expenseDate) : undefined },
  });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'EXPENSE_UPDATED', entityType: 'Expense', entityId: expense.id, branchId: existing.branchId });
  return ok(res, expense);
});

export const deleteExpense = asyncHandler(async (req: AuthRequest, res) => {
  if (req.user!.role === 'SALES_STAFF') forbidden('Only managers and admins can delete expenses');
  const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
  if (!existing) notFound('Expense not found');
  assertBranchAllowed(req.user!, existing.branchId);
  await prisma.expense.delete({ where: { id: req.params.id } });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'EXPENSE_DELETED', entityType: 'Expense', entityId: req.params.id, branchId: existing.branchId });
  return ok(res, { deleted: true });
});

export const expenseSummary = asyncHandler(async (req: AuthRequest, res) => {
  const branchId = req.query.branchId as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  const where: any = { ...branchScope(req.user!) };
  if (branchId) {
    assertBranchAllowed(req.user!, branchId);
    where.branchId = branchId;
  }
  if (from || to) {
    where.expenseDate = {};
    if (from) where.expenseDate.gte = new Date(from);
    if (to) where.expenseDate.lte = new Date(to);
  }

  const [byCategory, byBranch, total] = await Promise.all([
    prisma.expense.groupBy({ by: ['category'], where, _sum: { amount: true }, _count: true }),
    prisma.expense.groupBy({ by: ['branchId'], where, _sum: { amount: true }, _count: true }),
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
  ]);

  const branchNames = await prisma.branch.findMany({ select: { id: true, name: true, code: true } });
  const branchMap = new Map(branchNames.map((b) => [b.id, b]));

  return ok(res, {
    totalAmount: total._sum.amount ?? 0,
    byCategory: byCategory.map((c) => ({ category: c.category, amount: c._sum.amount ?? 0, count: c._count })),
    byBranch: byBranch.map((b) => ({ branchId: b.branchId, name: `${branchMap.get(b.branchId)?.code ?? ''} — ${branchMap.get(b.branchId)?.name ?? ''}`, amount: b._sum.amount ?? 0, count: b._count })),
  });
});
