import { z } from 'zod';
import { CustomerSegment, PaymentMethod } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, ok, created, notFound, badRequest, getPagination, branchScope, assertBranchAllowed, forbidden } from '../utils/helpers';
import { tierFor } from '../utils/loyalty';
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
  creditLimit: z.number().min(0).optional(),
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
    tier: tierFor(c.totalPointsEarned ?? 0),
    creditAvailable: Math.max((c.creditLimit ?? 0) - (c.creditBalance ?? 0), 0),
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
  return ok(res, { ...customer, lifetimeValue, tier: tierFor(customer!.totalPointsEarned ?? 0) });
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

// ======================= CSV IMPORT =======================

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  const src = text.replace(/\r\n/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur); cur = '';
    } else if (ch === '\n') {
      row.push(cur); rows.push(row); row = []; cur = '';
    } else {
      cur += ch;
    }
  }
  row.push(cur); rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

// Bulk-create customers. Expected columns:
// name, email, phone, company, address, segment, birthday, anniversary, branchCode
export const importCustomers = asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({ csv: z.string().min(1) });
  const data = schema.parse(req.body);

  const rows = parseCsv(data.csv);
  if (rows.length < 2) badRequest('CSV must contain a header row and at least one data row');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  const branchByCode = new Map<string, string>();
  const branches = await prisma.branch.findMany({ select: { id: true, code: true } });
  for (const b of branches) branchByCode.set(b.code.toUpperCase(), b.id);

  const createdItems: any[] = [];
  let errors = 0;
  const segmentValues = ['VIP', 'REGULAR', 'INACTIVE', 'NEW'];

  for (const row of rows.slice(1)) {
    const name = row[idx('name')]?.trim();
    if (!name) { errors++; continue; }
    const email = row[idx('email')]?.trim() || null;
    const phone = row[idx('phone')]?.trim() || null;
    if (phone) {
      const dup = await prisma.customer.findFirst({ where: { phone } });
      if (dup) { errors++; continue; }
    }
    if (email) {
      const dup = await prisma.customer.findFirst({ where: { email } });
      if (dup) { errors++; continue; }
    }
    const rawSegment = (row[idx('segment')]?.trim() ?? 'REGULAR').toUpperCase();
    const segment = (segmentValues.includes(rawSegment) ? rawSegment : 'REGULAR') as any;
    const branchCode = row[idx('branchcode')]?.trim().toUpperCase();
    let preferredBranchId: string | null = null;
    if (branchCode && branchByCode.has(branchCode)) {
      preferredBranchId = branchByCode.get(branchCode)!;
      assertBranchAllowed(req.user!, preferredBranchId);
    }

    const customer = await prisma.customer.create({
      data: {
        name,
        email,
        phone,
        company: row[idx('company')]?.trim() || null,
        address: row[idx('address')]?.trim() || null,
        segment,
        birthday: parseDate(row[idx('birthday')]),
        anniversary: parseDate(row[idx('anniversary')]),
        preferredBranchId,
        createdById: req.user!.id,
      },
    });
    createdItems.push({ id: customer.id, name: customer.name, phone: customer.phone, email: customer.email });
  }

  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'CUSTOMERS_IMPORTED', details: { created: createdItems.length, errors } });
  return created(res, { created: createdItems.length, errors, customers: createdItems });
});

// ======================= CREDIT PAYMENTS =======================

export const listCustomerPayments = asyncHandler(async (req: AuthRequest, res) => {
  const customerId = req.params.id ?? (req.query.customerId as string | undefined);
  if (!customerId) notFound('Customer not found');
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) notFound('Customer not found');

  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 25 });
  const [items, total] = await Promise.all([
    prisma.customerPayment.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: { branch: { select: { id: true, name: true, code: true } }, createdBy: { select: { name: true } } },
    }),
    prisma.customerPayment.count({ where: { customerId } }),
  ]);
  return ok(res, { items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

// Record a payment toward the customer's outstanding credit balance
export const addCustomerPayment = asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({
    amount: z.number().positive(),
    method: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
    note: z.string().optional().or(z.literal('')),
  });
  const data = schema.parse(req.body);

  const customer = await prisma.customer.findUnique({ where: { id: req.params.id } });
  if (!customer) notFound('Customer not found');

  if (data.amount > customer.creditBalance) {
    badRequest(`Amount exceeds the outstanding balance of ${customer.creditBalance.toFixed(2)}`, { balance: customer.creditBalance });
  }

  const branchId = req.user!.role === 'ADMIN' ? customer.preferredBranchId ?? req.user!.branchId : req.user!.branchId;
  if (!branchId) badRequest('Please select a branch for this payment');

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.customerPayment.create({
      data: {
        customerId: customer.id,
        branchId,
        amount: data.amount,
        method: data.method,
        note: data.note || null,
        createdById: req.user!.id,
      },
      include: { branch: { select: { name: true, code: true } }, createdBy: { select: { name: true } } },
    });
    await tx.customer.update({ where: { id: customer.id }, data: { creditBalance: { decrement: data.amount } } });
    return p;
  });

  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'CREDIT_PAYMENT', entityType: 'CustomerPayment', entityId: payment.id, branchId, details: { amount: data.amount, method: data.method } });
  return created(res, payment);
});
