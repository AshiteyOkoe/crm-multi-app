import { z } from 'zod';
import { CustomerSegment } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, ok, created, notFound, getPagination, branchScope, assertBranchAllowed } from '../utils/helpers';
import { writeAuditLog } from '../utils/audit';
import type { AuthRequest } from '../middleware/auth';

const customerSchema = z.object({
  name: z.string().min(1).max(150),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  company: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  segment: z.nativeEnum(CustomerSegment).optional(),
  birthday: z.string().optional().nullable(),
  anniversary: z.string().optional().nullable(),
  preferredBranchId: z.string().optional().nullable(),
});

function parseDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export const listCustomers = asyncHandler(async (req: AuthRequest, res) => {
  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 20 });
  const search = (req.query.search as string) ?? '';
  const segment = req.query.segment as string | undefined;
  const branchId = req.query.branchId as string | undefined;

  const scope = branchScope(req.user!, "preferredBranchId");
  const where: any = { ...scope };

  if (branchId) {
    assertBranchAllowed(req.user!, branchId);
    where.preferredBranchId = branchId;
  }
  if (segment) where.segment = segment;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        preferredBranch: { select: { id: true, name: true, code: true } },
        _count: { select: { sales: true } },
        sales: { select: { total: true } },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  const enriched = items.map((c: any) => ({
    ...c,
    lifetimeValue: c.sales.reduce((s: number, x: any) => s + x.total, 0),
    purchaseCount: c._count.sales,
  }));

  return ok(res, { items: enriched, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

export const getCustomer = asyncHandler(async (req: AuthRequest, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      preferredBranch: { select: { id: true, name: true, code: true } },
      interactions: { orderBy: { date: 'desc' }, take: 20, include: { user: { select: { name: true } } } },
      followUps: { orderBy: { scheduledAt: 'desc' }, take: 10, include: { assignee: { select: { name: true } } } },
      opportunities: { orderBy: { updatedAt: 'desc' }, take: 20 },
      sales: { orderBy: { createdAt: 'desc' }, take: 50, include: { branch: { select: { name: true, code: true } }, items: true } },
    },
  });
  if (!customer) notFound('Customer not found');
  const lifetimeValue = (customer!.sales as any[]).reduce((s, x) => s + x.total, 0);
  return ok(res, { ...customer, lifetimeValue });
});

export const createCustomer = asyncHandler(async (req: AuthRequest, res) => {
  const data = customerSchema.parse(req.body);
  if (data.preferredBranchId) assertBranchAllowed(req.user!, data.preferredBranchId);

  // duplicate detection by phone or email
  if (data.phone) {
    const dup = await prisma.customer.findFirst({ where: { phone: data.phone } });
    if (dup) return ok(res, { duplicate: true, existing: dup.id, message: 'A customer with this phone already exists. Consider updating instead of creating a duplicate.' });
  }

  const customer = await prisma.customer.create({
    data: {
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      company: data.company || null,
      address: data.address || null,
      notes: data.notes || null,
      segment: data.segment,
      birthday: parseDate(data.birthday),
      anniversary: parseDate(data.anniversary),
      preferredBranchId: data.preferredBranchId ?? null,
      createdById: req.user!.id,
    },
  });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'CUSTOMER_CREATED', entityType: 'Customer', entityId: customer.id, branchId: data.preferredBranchId });
  return created(res, customer);
});

export const updateCustomer = asyncHandler(async (req: AuthRequest, res) => {
  const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!existing) notFound('Customer not found');

  const data = customerSchema.partial().parse(req.body);
  if (data.preferredBranchId) assertBranchAllowed(req.user!, data.preferredBranchId);

  const customer = await prisma.customer.update({
    where: { id: req.params.id },
    data: {
      ...data,
      email: data.email === '' ? null : data.email,
      phone: data.phone === '' ? null : data.phone,
      birthday: data.birthday !== undefined ? parseDate(data.birthday) : undefined,
      anniversary: data.anniversary !== undefined ? parseDate(data.anniversary) : undefined,
    },
  });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'CUSTOMER_UPDATED', entityType: 'Customer', entityId: customer.id });
  return ok(res, customer);
});

export const deleteCustomer = asyncHandler(async (req: AuthRequest, res) => {
  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) notFound('Customer not found');
  await prisma.customer.delete({ where: { id: req.params.id } });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'CUSTOMER_DELETED', entityType: 'Customer', entityId: req.params.id });
  return ok(res, { deleted: true });
});

// ======================= INTERACTIONS =======================

export const addInteraction = asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({
    type: z.enum(['CALL', 'EMAIL', 'MEETING', 'NOTE', 'WHATSAPP']),
    subject: z.string().optional(),
    notes: z.string().min(1),
    customerId: z.string().optional(),
    leadId: z.string().optional(),
  });
  const data = schema.parse(req.body);
  if (!data.customerId && !data.leadId) {
    // use route param if present
    if (req.params.id) data.customerId = req.params.id;
  }
  const interaction = await prisma.interaction.create({
    data: { type: data.type, subject: data.subject, notes: data.notes, customerId: data.customerId, leadId: data.leadId, userId: req.user!.id },
    include: { user: { select: { name: true } } },
  });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'INTERACTION_ADDED', entityType: 'Interaction', entityId: interaction.id });
  return created(res, interaction);
});
