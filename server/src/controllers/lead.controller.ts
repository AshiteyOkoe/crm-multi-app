import { z } from 'zod';
import { LeadStatus, LeadSource } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, ok, created, notFound, badRequest, getPagination, branchScope, assertBranchAllowed } from '../utils/helpers';
import { writeAuditLog, notify } from '../utils/audit';
import type { AuthRequest } from '../middleware/auth';

const leadSchema = z.object({
  name: z.string().min(1).max(150),
  company: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  source: z.nativeEnum(LeadSource).optional(),
  status: z.nativeEnum(LeadStatus).optional(),
  value: z.number().min(0).optional(),
  notes: z.string().optional().or(z.literal('')),
  assignedToId: z.string().optional().nullable(),
  branchId: z.string().optional().nullable(),
});

export const listLeads = asyncHandler(async (req: AuthRequest, res) => {
  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 20 });
  const status = req.query.status as string | undefined;
  const source = req.query.source as string | undefined;
  const assignedToId = req.query.assignedToId as string | undefined;
  const branchId = req.query.branchId as string | undefined;
  const search = (req.query.search as string) ?? '';

  const scope = branchScope(req.user!);
  const where: any = { ...scope };
  if (status) where.status = status;
  if (source) where.source = source;
  if (assignedToId) where.assignedToId = assignedToId;
  if (branchId) {
    assertBranchAllowed(req.user!, branchId);
    where.branchId = branchId;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { company: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        assignedTo: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
        opportunities: { select: { id: true, value: true, stage: true } },
        _count: { select: { followUps: true } },
      },
    }),
    prisma.lead.count({ where }),
  ]);
  return ok(res, { items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

export const getLead = asyncHandler(async (req: AuthRequest, res) => {
  const lead = await prisma.lead.findUnique({
    where: { id: req.params.id },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      branch: { select: { id: true, name: true, code: true } },
      interactions: { orderBy: { date: 'desc' }, take: 30, include: { user: { select: { name: true } } } },
      followUps: { orderBy: { scheduledAt: 'desc' }, take: 15, include: { assignee: { select: { name: true } } } },
      opportunities: { orderBy: { updatedAt: 'desc' } },
    },
  });
  if (!lead) notFound('Lead not found');
  return ok(res, lead);
});

export const createLead = asyncHandler(async (req: AuthRequest, res) => {
  const data = leadSchema.parse(req.body);
  if (data.branchId) assertBranchAllowed(req.user!, data.branchId);

  if (data.phone || data.email) {
    const dup = await prisma.lead.findFirst({
      where: data.phone
        ? { phone: data.phone }
        : { email: data.email },
    });
    if (dup) badRequest('A lead with this contact already exists', { field: data.phone ? 'phone' : 'email', duplicateId: dup.id });
  }

  const lead = await prisma.lead.create({
    data: {
      name: data.name,
      company: data.company || null,
      email: data.email || null,
      phone: data.phone || null,
      source: data.source,
      status: data.status,
      value: data.value ?? 0,
      notes: data.notes || null,
      assignedToId: data.assignedToId ?? req.user!.id,
      branchId: data.branchId ?? req.user!.branchId ?? null,
      createdById: req.user!.id,
    },
  });

  await prisma.opportunity.create({
    data: { name: data.name, stage: data.status ?? 'NEW', value: data.value ?? 0, leadId: lead.id, ownerId: data.assignedToId ?? req.user!.id },
  });

  if (data.assignedToId && data.assignedToId !== req.user!.id) {
    await notify({
      userId: data.assignedToId,
      type: 'LEAD_ASSIGNED',
      title: 'New lead assigned',
      message: `Lead "${data.name}" has been assigned to you.`,
      link: `/leads`,
    });
  }

  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'LEAD_CREATED', entityType: 'Lead', entityId: lead.id, branchId: lead.branchId });
  return created(res, lead);
});

export const updateLead = asyncHandler(async (req: AuthRequest, res) => {
  const existing = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!existing) notFound('Lead not found');

  const data = leadSchema.partial().parse(req.body);
  const oldStatus = existing.status;
  const statusChanged = data.status && data.status !== oldStatus;
  const assigneeChanged = data.assignedToId && data.assignedToId !== existing.assignedToId;

  const patch: any = {
    ...data,
    company: data.company === '' ? null : data.company,
    email: data.email === '' ? null : data.email,
    phone: data.phone === '' ? null : data.phone,
    notes: data.notes === '' ? null : data.notes,
  };
  if (statusChanged) {
    patch.wonAt = data.status === 'WON' ? new Date() : null;
    patch.lostAt = data.status === 'LOST' ? new Date() : null;
  }

  const lead = await prisma.lead.update({ where: { id: req.params.id }, data: patch });

  if (statusChanged) {
    await prisma.opportunity.updateMany({ where: { leadId: lead.id }, data: { stage: data.status, wonAt: data.status === 'WON' ? new Date() : null, lostAt: data.status === 'LOST' ? new Date() : null } });
  }
  if (assigneeChanged && lead.assignedToId) {
    await notify({ userId: lead.assignedToId, type: 'LEAD_ASSIGNED', title: 'Lead assigned', message: `Lead "${lead.name}" was assigned to you.`, link: `/leads` });
  }
  if (statusChanged && lead.assignedToId && lead.assignedToId !== req.user!.id) {
    await notify({ userId: lead.assignedToId, type: 'DEAL_STATUS', title: 'Deal status changed', message: `Lead "${lead.name}" moved to ${data.status}.`, link: `/leads` });
  }

  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'LEAD_UPDATED', entityType: 'Lead', entityId: lead.id, details: { oldStatus }, branchId: lead.branchId });
  return ok(res, lead);
});

export const deleteLead = asyncHandler(async (req: AuthRequest, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) notFound('Lead not found');
  await prisma.opportunity.deleteMany({ where: { leadId: lead.id } });
  await prisma.lead.delete({ where: { id: req.params.id } });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'LEAD_DELETED', entityType: 'Lead', entityId: req.params.id });
  return ok(res, { deleted: true });
});

// Convert a WON lead into a customer
export const convertLead = asyncHandler(async (req: AuthRequest, res) => {
  const lead = await prisma.lead.findUnique({ where: { id: req.params.id } });
  if (!lead) notFound('Lead not found');
  if (lead.status !== 'WON') badRequest('Only won leads can be converted to customers');

  const customer = lead.convertedCustomerId
    ? await prisma.customer.findUnique({ where: { id: lead.convertedCustomerId } })
    : null;

  const createdCustomer = customer ?? (await prisma.customer.create({
    data: {
      name: lead.name,
      company: lead.company,
      email: lead.email,
      phone: lead.phone,
      notes: lead.notes,
      preferredBranchId: lead.branchId,
      createdById: req.user!.id,
      segment: 'VIP',
    },
  }));

  await prisma.lead.update({ where: { id: lead.id }, data: { convertedCustomerId: createdCustomer.id } });
  await prisma.opportunity.updateMany({ where: { leadId: lead.id }, data: { customerId: createdCustomer.id } });
  await prisma.interaction.create({
    data: { type: 'MEETING', subject: 'Lead converted', notes: `Lead "${lead.name}" was converted into a customer.`, customerId: createdCustomer.id, leadId: lead.id, userId: req.user!.id },
  });

  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'LEAD_CONVERTED', entityType: 'Lead', entityId: lead.id, details: { customerId: createdCustomer.id } });
  return ok(res, { customer: createdCustomer });
});

// ======================= OPPORTUNITIES =======================

export const listOpportunities = asyncHandler(async (req: AuthRequest, res) => {
  const stage = req.query.stage as string | undefined;
  const where: any = { ...branchScope(req.user!, 'ownerId') };
  if (stage) where.stage = stage;
  const items = await prisma.opportunity.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: { owner: { select: { name: true } }, customer: { select: { name: true } }, lead: { select: { name: true, phone: true } } },
  });
  return ok(res, items);
});

export const updateOpportunityStage = asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({ stage: z.nativeEnum(LeadStatus), value: z.number().min(0).optional(), expectedCloseDate: z.string().optional().nullable(), probability: z.number().min(0).max(100).optional() });
  const data = schema.parse(req.body);
  const opp = await prisma.opportunity.findUnique({ where: { id: req.params.id } });
  if (!opp) notFound('Opportunity not found');

  const updated = await prisma.opportunity.update({
    where: { id: req.params.id },
    data: {
      stage: data.stage,
      value: data.value,
      probability: data.probability,
      expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
      wonAt: data.stage === 'WON' ? new Date() : null,
      lostAt: data.stage === 'LOST' ? new Date() : null,
    },
  });

  if (opp.leadId) {
    await prisma.lead.update({ where: { id: opp.leadId }, data: { status: data.stage } });
  }
  if (opp.ownerId && opp.ownerId !== req.user!.id) {
    await notify({ userId: opp.ownerId, type: 'DEAL_STATUS', title: 'Deal status changed', message: `Opportunity "${opp.name}" moved to ${data.stage}.`, link: `/leads` });
  }
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'OPPORTUNITY_UPDATED', entityType: 'Opportunity', entityId: updated.id });
  return ok(res, updated);
});
