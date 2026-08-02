import { z } from 'zod';
import { CampaignStatus, CampaignType, NotificationChannel } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, ok, created, notFound, badRequest, forbidden, getPagination } from '../utils/helpers';
import { writeAuditLog } from '../utils/audit';
import { sendMessage } from '../utils/mailer';
import { getAppSettings } from '../utils/settings';
import type { AuthRequest } from '../middleware/auth';

// ======================= SEGMENTS =======================

// Customers with a birthday / anniversary in the next `days` days
async function upcomingOccasions(kind: 'birthday' | 'anniversary', days = 14) {
  const now = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);
  const field = kind === 'birthday' ? 'birthday' : 'anniversary';
  const customers = await prisma.customer.findMany({
    where: { [field]: { not: null } },
    select: { id: true, name: true, phone: true, email: true, birthday: true, anniversary: true, preferredBranchId: true },
  });
  return customers.filter((c: any) => {
    const d = c[field] as Date | null;
    if (!d) return false;
    const occ = new Date(d);
    occ.setFullYear(now.getFullYear());
    if (occ < now) occ.setFullYear(now.getFullYear() + 1);
    return occ <= end;
  });
}

export const getSegments = asyncHandler(async (req: AuthRequest, res) => {
  const days = Number(req.query.days ?? 14);
  const [birthdays, anniversaries, inactive] = await Promise.all([
    upcomingOccasions('birthday', days),
    upcomingOccasions('anniversary', days),
    // Inactive: no sales in the last 90 days
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const activeIds = (await prisma.sale.findMany({ where: { createdAt: { gte: since }, status: 'COMPLETED' }, select: { customerId: true }, distinct: ['customerId'] })).map((s) => s.customerId).filter(Boolean) as string[];
      return prisma.customer.findMany({
        where: { id: { notIn: activeIds.length ? activeIds : ['__none__'] } },
        select: { id: true, name: true, phone: true, email: true, segment: true, preferredBranchId: true, createdAt: true },
      });
    })(),
  ]);

  return ok(res, {
    birthdays,
    anniversaries,
    inactive,
    days,
  });
});

// ======================= CAMPAIGNS =======================

const campaignSchema = z.object({
  name: z.string().min(1).max(150),
  type: z.nativeEnum(CampaignType).default(CampaignType.CUSTOM),
  channel: z.nativeEnum(NotificationChannel).default(NotificationChannel.SMS),
  message: z.string().min(1).max(1600),
  branchId: z.string().optional().nullable(),
  scheduledAt: z.string().optional().nullable(),
  audience: z.object({
    customerIds: z.array(z.string()).optional(),
    birthdays: z.boolean().optional(),
    anniversaries: z.boolean().optional(),
    inactive: z.boolean().optional(),
  }).optional(),
});

export const listCampaigns = asyncHandler(async (req: AuthRequest, res) => {
  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 20 });
  const [items, total] = await Promise.all([
    prisma.campaign.findMany({
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { branch: { select: { name: true, code: true } }, createdBy: { select: { name: true } }, _count: { select: { recipients: true } } },
    }),
    prisma.campaign.count(),
  ]);
  return ok(res, { items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

export const getCampaign = asyncHandler(async (req: AuthRequest, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: {
      branch: { select: { name: true, code: true } },
      createdBy: { select: { name: true } },
      recipients: { take: 200, include: { customer: { select: { name: true } } } },
    },
  });
  if (!campaign) notFound('Campaign not found');
  return ok(res, campaign);
});

async function resolveAudience(audience: { customerIds?: string[]; birthdays?: boolean; anniversaries?: boolean; inactive?: boolean } | undefined, type: CampaignType) {
  const ids = new Set<string>(audience?.customerIds ?? []);
  if (audience?.birthdays) (await upcomingOccasions('birthday', 14)).forEach((c) => ids.add(c.id));
  if (audience?.anniversaries) (await upcomingOccasions('anniversary', 14)).forEach((c) => ids.add(c.id));
  if (audience?.inactive) {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const activeIds = (await prisma.sale.findMany({ where: { createdAt: { gte: since }, status: 'COMPLETED' }, select: { customerId: true }, distinct: ['customerId'] })).map((s) => s.customerId).filter(Boolean) as string[];
    const inact = await prisma.customer.findMany({ where: { id: { notIn: activeIds.length ? activeIds : ['__none__'] } }, select: { id: true } });
    inact.forEach((c) => ids.add(c.id));
  }
  if (type === 'BIRTHDAY' && !ids.size) (await upcomingOccasions('birthday', 14)).forEach((c) => ids.add(c.id));
  if (type === 'ANNIVERSARY' && !ids.size) (await upcomingOccasions('anniversary', 14)).forEach((c) => ids.add(c.id));
  if (type === 'INACTIVE' && !ids.size) {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const activeIds = (await prisma.sale.findMany({ where: { createdAt: { gte: since }, status: 'COMPLETED' }, select: { customerId: true }, distinct: ['customerId'] })).map((s) => s.customerId).filter(Boolean) as string[];
    const inact = await prisma.customer.findMany({ where: { id: { notIn: activeIds.length ? activeIds : ['__none__'] } }, select: { id: true } });
    inact.forEach((c) => ids.add(c.id));
  }
  return Array.from(ids);
}

export const createCampaign = asyncHandler(async (req: AuthRequest, res) => {
  const data = campaignSchema.parse(req.body);
  const audience = await resolveAudience(data.audience, data.type);
  if (!audience.length) badRequest('No customers match this campaign audience');

  const campaign = await prisma.campaign.create({
    data: {
      name: data.name,
      type: data.type,
      channel: data.channel,
      message: data.message,
      branchId: data.branchId ?? null,
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      status: data.scheduledAt ? CampaignStatus.SCHEDULED : CampaignStatus.DRAFT,
      createdById: req.user!.id,
    },
    include: { branch: { select: { name: true, code: true } } },
  });

  const customers = await prisma.customer.findMany({ where: { id: { in: audience } }, select: { id: true, phone: true, email: true } });
  await prisma.campaignRecipient.createMany({
    data: customers.map((c) => ({ campaignId: campaign.id, customerId: c.id, phone: c.phone, email: c.email })),
  });

  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'CAMPAIGN_CREATED', entityType: 'Campaign', entityId: campaign.id, details: { type: data.type, recipients: customers.length } });
  return created(res, { ...campaign, recipientCount: customers.length });
});

// Send a campaign now
export const sendCampaign = asyncHandler(async (req: AuthRequest, res) => {
  if (req.user!.role === 'SALES_STAFF') forbidden('Only managers and admins can send campaigns');
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) notFound('Campaign not found');
  if (campaign.status === 'SENT') badRequest('This campaign has already been sent');

  const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: campaign.id }, include: { customer: { select: { name: true } } } });
  const settings = await getAppSettings();
  let sentCount = 0;

  for (const r of recipients) {
    const to = campaign.channel === 'EMAIL' ? r.email : r.phone;
    if (!to) {
      await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: 'FAILED' } });
      continue;
    }
    const body = campaign.message.replace(/\{\{name\}\}/g, r.customer?.name ?? 'Customer');
    const okSent = await sendMessage({ to, channel: campaign.channel as 'EMAIL' | 'SMS' | 'WHATSAPP', subject: campaign.name, body }, settings);
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: okSent ? 'SENT' : 'FAILED', sentAt: new Date() } });
    if (okSent) sentCount += 1;
  }

  const updated = await prisma.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.SENT, sentAt: new Date() } });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'CAMPAIGN_SENT', entityType: 'Campaign', entityId: campaign.id, details: { sent: sentCount, total: recipients.length } });
  return ok(res, { ...updated, sent: sentCount, total: recipients.length });
});

export const deleteCampaign = asyncHandler(async (req: AuthRequest, res) => {
  if (req.user!.role === 'SALES_STAFF') forbidden();
  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) notFound('Campaign not found');
  if (campaign.status === 'SENT') badRequest('Sent campaigns cannot be deleted');
  await prisma.campaign.delete({ where: { id: req.params.id } });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'CAMPAIGN_DELETED', entityType: 'Campaign', entityId: req.params.id });
  return ok(res, { deleted: true });
});
