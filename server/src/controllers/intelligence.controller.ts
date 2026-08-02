import { prisma } from '../lib/prisma';
import { asyncHandler, ok, badRequest } from '../utils/helpers';
import { forecastRevenue, leadScore, scoreLabel } from '../utils/intelligence';
import { getAppSettings } from '../utils/settings';
import { buildReceiptText, sendMessage } from '../utils/mailer';
import { writeAuditLog, notifyAdmins } from '../utils/audit';
import type { AuthRequest } from '../middleware/auth';

// ======================= FORECAST =======================

export const getForecast = asyncHandler(async (req: AuthRequest, res) => {
  const branchId = req.query.branchId as string | undefined;
  const days = Math.min(Number(req.query.days ?? 30), 90);

  const where: any = branchId ? { branchId, status: 'COMPLETED' } : { status: 'COMPLETED' };
  if (branchId) {
    if (req.user!.role !== 'ADMIN' && branchId !== req.user!.branchId) badRequest('You do not have access to this branch');
  } else if (req.user!.role !== 'ADMIN') {
    where.branchId = req.user!.branchId;
  }

  const since = new Date();
  since.setDate(since.getDate() - 90);
  where.createdAt = { gte: since };

  const sales = await prisma.sale.findMany({ where: where as any, select: { total: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
  const byDay = new Map<string, number>();
  for (const s of sales) {
    const key = s.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + s.total);
  }
  const history = Array.from(byDay.entries()).map(([date, revenue]) => ({ date, revenue }));

  const forecast = forecastRevenue(history, days);
  const avgOrder = await prisma.sale.aggregate({ where: { ...(where as any), status: 'COMPLETED' }, _avg: { total: true }, _count: true });

  return ok(res, {
    ...forecast,
    forecastDays: days,
    actualTotal: history.reduce((s, h) => s + h.revenue, 0),
    avgOrderValue: avgOrder._avg.total ?? 0,
    transactions: avgOrder._count,
  });
});

// ======================= LEAD SCORING =======================

export const getLeadScores = asyncHandler(async (req: AuthRequest, res) => {
  const status = req.query.status as string | undefined;
  const where: any = {};
  if (status) where.status = status;

  const leads = await prisma.lead.findMany({
    where,
    select: {
      id: true, name: true, company: true, phone: true, email: true, value: true, source: true, status: true,
      createdAt: true, assignedToId: true,
      _count: { select: { interactions: true } },
      assignedTo: { select: { name: true } },
      branch: { select: { name: true, code: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });

  const now = Date.now();
  const scored = leads.map((l) => {
    const daysOpen = Math.max(Math.floor((now - l.createdAt.getTime()) / 86400000), 0);
    const score = leadScore({
      value: l.value,
      source: l.source,
      stage: l.status,
      daysOpen,
      interactions: l._count.interactions,
      assigned: !!l.assignedToId,
    });
    return { ...l, score, scoreLabel: scoreLabel(score), daysOpen };
  }).sort((a, b) => b.score - a.score);

  const hot = scored.filter((s) => s.scoreLabel === 'HOT').length;
  const warm = scored.filter((s) => s.scoreLabel === 'WARM').length;
  const cold = scored.filter((s) => s.scoreLabel === 'COLD').length;

  return ok(res, { items: scored, summary: { hot, warm, cold, total: scored.length } });
});

// ======================= DAILY SUMMARY =======================

export const getDailySummary = asyncHandler(async (req: AuthRequest, res) => {
  const settings = await getAppSettings();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const start = new Date(yesterday); start.setHours(0, 0, 0, 0);
  const end = new Date(yesterday); end.setHours(23, 59, 59, 999);

  const scope = req.user!.role === 'ADMIN' || req.user!.role === 'AUDITOR' ? {} : { branchId: req.user!.branchId };
  const [sales, revenueAgg, customers, leads, lowStock, pendingReturns, pendingTransfers, expenses] = await Promise.all([
    prisma.sale.count({ where: { ...(scope as any), createdAt: { gte: start, lte: end }, status: 'COMPLETED' } }),
    prisma.sale.aggregate({ where: { ...(scope as any), createdAt: { gte: start, lte: end }, status: 'COMPLETED' }, _sum: { total: true } }),
    prisma.customer.count({ where: { ...(scope as any), createdAt: { gte: start, lte: end } } }),
    prisma.lead.count({ where: { ...(scope as any), createdAt: { gte: start, lte: end } } }),
    prisma.branchProduct.count({ where: { quantity: { lte: 0 }, product: { isActive: true } } }),
    prisma.return.count({ where: { status: 'PENDING' } }),
    prisma.stockTransfer.count({ where: { status: 'PENDING' } }),
    prisma.expense.aggregate({ where: { ...(scope as any), expenseDate: { gte: start, lte: end } }, _sum: { amount: true } }),
  ]);

  const summary = {
    date: yesterday.toISOString().slice(0, 10),
    businessName: settings.businessName,
    currency: settings.currency,
    revenue: revenueAgg._sum?.total ?? 0,
    transactions: sales,
    newCustomers: customers,
    newLeads: leads,
    expenses: expenses._sum?.amount ?? 0,
    outOfStockItems: lowStock,
    pendingReturns,
    pendingTransfers,
  };

  const send = req.query.send === 'true';
  if (send && req.user!.role === 'ADMIN') {
    const lines = [
      `${summary.businessName} — Daily Summary (${summary.date})`,
      '',
      `Revenue:        ${summary.currency} ${summary.revenue.toFixed(2)} (${summary.transactions} txns)`,
      `Expenses:       ${summary.currency} ${summary.expenses.toFixed(2)}`,
      `New customers:  ${summary.newCustomers}`,
      `New leads:      ${summary.newLeads}`,
      `Out of stock:   ${summary.outOfStockItems}`,
      `Pending returns:${summary.pendingReturns}`,
      `Pending transfers: ${summary.pendingTransfers}`,
    ].join('\n');
    const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true }, select: { email: true } });
    let sent = 0;
    for (const a of admins) {
      const okSent = await sendMessage({ to: a.email, channel: 'EMAIL', subject: `Daily summary — ${summary.date}`, body: lines }, settings);
      if (okSent) sent += 1;
    }
    await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'DAILY_SUMMARY_SENT', details: { date: summary.date, sent } });
    await notifyAdmins({ type: 'SALES', title: 'Daily summary sent', message: `Morning briefing for ${summary.date} emailed to ${sent} admin(s).` });
    return ok(res, { ...summary, emailed: sent });
  }

  return ok(res, summary);
});
