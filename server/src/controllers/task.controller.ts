import { z } from 'zod';
import { TaskStatus, FollowUpStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, ok, created, notFound, getPagination, todayRange } from '../utils/helpers';
import { writeAuditLog, notify } from '../utils/audit';
import type { AuthRequest } from '../middleware/auth';

// ======================= TASKS =======================

const taskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().or(z.literal('')),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  dueDate: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  relatedType: z.string().optional().nullable(),
  relatedId: z.string().optional().nullable(),
});

export const listTasks = asyncHandler(async (req: AuthRequest, res) => {
  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 50 });
  const status = req.query.status as string | undefined;
  const assigneeId = req.query.assigneeId as string | undefined;
  const scope = req.query.scope as string | undefined; // 'mine' | 'all'

  const where: any = {};
  if (status) where.status = status;
  if (assigneeId) where.assigneeId = assigneeId;
  if (scope === 'mine' || (scope !== 'all' && req.user!.role !== 'ADMIN')) {
    where.assigneeId = req.user!.id;
  }

  const [items, total] = await Promise.all([
    prisma.task.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      include: { assignee: { select: { id: true, name: true } } },
    }),
    prisma.task.count({ where }),
  ]);
  return ok(res, { items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

export const createTask = asyncHandler(async (req: AuthRequest, res) => {
  const data = taskSchema.parse(req.body);
  const task = await prisma.task.create({
    data: {
      title: data.title,
      description: data.description || null,
      status: data.status,
      priority: data.priority,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      assigneeId: data.assigneeId ?? req.user!.id,
      relatedType: data.relatedType,
      relatedId: data.relatedId,
      createdById: req.user!.id,
    },
    include: { assignee: { select: { name: true } } },
  });
  if (task.assigneeId && task.assigneeId !== req.user!.id) {
    await notify({ userId: task.assigneeId, type: 'TASK_OVERDUE', title: 'New task assigned', message: `Task "${task.title}" was assigned to you.`, link: '/tasks' });
  }
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'TASK_CREATED', entityType: 'Task', entityId: task.id });
  return created(res, task);
});

export const updateTask = asyncHandler(async (req: AuthRequest, res) => {
  const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!existing) notFound('Task not found');

  const data = taskSchema.partial().parse(req.body);
  const task = await prisma.task.update({
    where: { id: req.params.id },
    data: { ...data, dueDate: data.dueDate ? new Date(data.dueDate) : undefined },
    include: { assignee: { select: { name: true } } },
  });

  if (data.status === 'COMPLETED' && existing.assigneeId && existing.assigneeId !== req.user!.id) {
    await notify({ userId: existing.assigneeId, type: 'TASK_OVERDUE', title: 'Task completed', message: `Task "${task.title}" was marked completed.` });
  }
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'TASK_UPDATED', entityType: 'Task', entityId: task.id });
  return ok(res, task);
});

export const deleteTask = asyncHandler(async (req: AuthRequest, res) => {
  await prisma.task.delete({ where: { id: req.params.id } });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'TASK_DELETED', entityType: 'Task', entityId: req.params.id });
  return ok(res, { deleted: true });
});

// ======================= FOLLOW-UPS =======================

const followUpSchema = z.object({
  type: z.enum(['CALL', 'MEETING', 'EMAIL', 'REMINDER']),
  subject: z.string().min(1),
  notes: z.string().optional().or(z.literal('')),
  scheduledAt: z.string(),
  status: z.nativeEnum(FollowUpStatus).optional(),
  customerId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
});

export const listFollowUps = asyncHandler(async (req: AuthRequest, res) => {
  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 50 });
  const status = req.query.status as string | undefined;
  const upcoming = req.query.upcoming === 'true';
  const scope = req.query.scope as string | undefined;

  const where: any = {};
  if (status) where.status = status;
  if (upcoming) {
    where.scheduledAt = { gte: new Date() };
    where.status = status ?? 'SCHEDULED';
  }
  if (scope === 'mine' || (scope !== 'all' && req.user!.role !== 'ADMIN')) {
    where.assigneeId = req.user!.id;
  }

  const [items, total] = await Promise.all([
    prisma.followUp.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { scheduledAt: 'asc' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        lead: { select: { id: true, name: true, phone: true } },
        assignee: { select: { id: true, name: true } },
      },
    }),
    prisma.followUp.count({ where }),
  ]);
  return ok(res, { items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

export const createFollowUp = asyncHandler(async (req: AuthRequest, res) => {
  const data = followUpSchema.parse(req.body);
  const followUp = await prisma.followUp.create({
    data: {
      type: data.type,
      subject: data.subject,
      notes: data.notes || null,
      scheduledAt: new Date(data.scheduledAt),
      status: data.status,
      customerId: data.customerId ?? null,
      leadId: data.leadId ?? null,
      assigneeId: data.assigneeId ?? req.user!.id,
      createdById: req.user!.id,
    },
    include: { customer: { select: { name: true } }, lead: { select: { name: true } }, assignee: { select: { name: true } } },
  });
  if (followUp.assigneeId && followUp.assigneeId !== req.user!.id) {
    await notify({ userId: followUp.assigneeId, type: 'FOLLOW_UP', title: 'Follow-up scheduled', message: `Follow-up "${followUp.subject}" scheduled for ${followUp.scheduledAt.toISOString()}.`, link: '/tasks' });
  }
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'FOLLOW_UP_CREATED', entityType: 'FollowUp', entityId: followUp.id });
  return created(res, followUp);
});

export const updateFollowUp = asyncHandler(async (req: AuthRequest, res) => {
  const existing = await prisma.followUp.findUnique({ where: { id: req.params.id } });
  if (!existing) notFound('Follow-up not found');
  const data = followUpSchema.partial().parse(req.body);
  const followUp = await prisma.followUp.update({
    where: { id: req.params.id },
    data: { ...data, scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined },
    include: { customer: { select: { name: true } }, lead: { select: { name: true } } },
  });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'FOLLOW_UP_UPDATED', entityType: 'FollowUp', entityId: followUp.id });
  return ok(res, followUp);
});

export const deleteFollowUp = asyncHandler(async (req: AuthRequest, res) => {
  await prisma.followUp.delete({ where: { id: req.params.id } });
  return ok(res, { deleted: true });
});

// Due/overdue follow-ups for notification widget
export const upcomingFollowUps = asyncHandler(async (req: AuthRequest, res) => {
  const { start } = todayRange(0);
  const items = await prisma.followUp.findMany({
    where: { scheduledAt: { gte: start }, status: 'SCHEDULED' },
    orderBy: { scheduledAt: 'asc' },
    take: 10,
    include: { lead: { select: { name: true } }, customer: { select: { name: true } }, assignee: { select: { name: true } } },
  });
  return ok(res, items);
});
