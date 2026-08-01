import { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma';

interface AuditInput {
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: unknown;
  branchId?: string | null;
}

export async function writeAuditLog(input: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        userEmail: input.userEmail ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        details: (input.details as any) ?? undefined,
        branchId: input.branchId ?? null,
      },
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

export async function notify(input: NotifyInput) {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link,
      },
    });
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
}

// Notify the business owner (ADMIN) about something important.
export async function notifyAdmins(input: Omit<NotifyInput, 'userId'>) {
  try {
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { id: true } });
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link,
      })),
    });
  } catch (err) {
    console.error('Failed to notify admins:', err);
  }
}
