import { LeadStatus, SaleStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, ok, assertBranchAllowed, branchScope, todayRange } from '../utils/helpers';
import type { AuthRequest } from '../middleware/auth';

type Period = 'day' | 'week' | 'month' | 'year' | 'custom';

function periodRange(period: Period, offset = 0, from?: string, to?: string) {
  const now = new Date();
  const end = new Date();
  const start = new Date();

  if (period === 'day') {
    start.setDate(now.getDate() - offset);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 1);
  } else if (period === 'week') {
    start.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1) - offset * 7);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 7);
  } else if (period === 'year') {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === 'custom') {
    start.setTime(new Date(from ?? now).getTime());
    start.setHours(0, 0, 0, 0);
    end.setTime(new Date(to ?? now).getTime());
    end.setHours(23, 59, 59, 999);
  } else {
    // month
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    if (offset > 0) start.setMonth(start.getMonth() - offset);
    end.setMonth(start.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  }
  return { start, end };
}

function resolveScopeAndBranch(req: AuthRequest) {
  const branchId = req.query.branchId as string | undefined;
  const allowedBranches = branchScope(req.user!);
  if (branchId) {
    assertBranchAllowed(req.user!, branchId);
    return { where: { branchId }, branchId };
  }
  return { where: allowedBranches, branchId: null as string | null };
}

// Customer rows are scoped by preferredBranchId (customers are a unified pool).
function resolveCustomerScope(req: AuthRequest) {
  const allowedBranches = branchScope(req.user!, 'preferredBranchId');
  return { where: allowedBranches, branchId: null as string | null };
}

// Branch ids the current user may access (null = all).
function allowedBranchIds(req: AuthRequest): string[] | null {
  return req.user!.role === 'ADMIN' ? null : [req.user!.branchId!];
}

// ======================= DASHBOARD =======================

export const getDashboard = asyncHandler(async (req: AuthRequest, res) => {
  const { where, branchId } = resolveScopeAndBranch(req);
  const { start: dayStart } = todayRange(0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const completedWhere = { ...where, status: 'COMPLETED' as SaleStatus };
  const ids = allowedBranchIds(req);

  const [
    todaySales, todayAgg, monthAgg, monthCount,
    lowStockBranches, branchCount, customerCount, leadCount,
    wonLeads, lostLeads, openLeads, recentSales, recentActivity,
  ] = await Promise.all([
    prisma.sale.findMany({ where: { ...completedWhere, createdAt: { gte: dayStart } }, select: { total: true, id: true } }),
    prisma.sale.aggregate({ where: { ...completedWhere, createdAt: { gte: dayStart } }, _sum: { total: true }, _count: true }),
    prisma.sale.aggregate({ where: { ...completedWhere, createdAt: { gte: monthStart } }, _sum: { total: true }, _count: true }),
    prisma.sale.count({ where: { ...completedWhere, createdAt: { gte: monthStart } } }),
    prisma.branchProduct.findMany({ where: { ...branchScope(req.user!), product: { isActive: true } }, include: { product: true, branch: { select: { id: true, name: true, code: true } } } }),
    prisma.branch.count({ where: ids ? { id: { in: ids } } : {} }),
    prisma.customer.count({ where: resolveCustomerScope(req).where as any }),
    prisma.lead.count({ where: { ...branchScope(req.user!), status: { not: 'WON' as LeadStatus } } }),
    prisma.lead.count({ where: { ...branchScope(req.user!), status: 'WON' as LeadStatus } }),
    prisma.lead.count({ where: { ...branchScope(req.user!), status: 'LOST' as LeadStatus } }),
    prisma.lead.count({ where: { ...branchScope(req.user!), status: { notIn: ['WON' as LeadStatus, 'LOST' as LeadStatus] } } }),
    prisma.sale.findMany({ where: completedWhere, orderBy: { createdAt: 'desc' }, take: 8, include: { branch: { select: { name: true, code: true } }, customer: { select: { name: true } }, user: { select: { name: true } }, items: true } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12 }),
  ]);

  const lowStock = lowStockBranches
    .filter((s) => s.quantity <= s.product.lowStockThreshold)
    .sort((a, b) => a.quantity - b.quantity)
    .slice(0, 8)
    .map((s) => ({ ...s, status: s.quantity <= 0 ? 'OUT_OF_STOCK' : 'LOW' }));

  const todayRevenue = todayAgg._sum.total ?? 0;
  const todayTransactions = todayAgg._count;
  const monthRevenue = monthAgg._sum.total ?? 0;

  const topBranch = await prisma.sale.groupBy({
    by: ['branchId'],
    where: { ...completedWhere, createdAt: { gte: monthStart } },
    _sum: { total: true },
    _count: true,
    orderBy: { _sum: { total: 'desc' } },
    take: 1,
  });
  const topBranchName = topBranch.length
    ? (await prisma.branch.findUnique({ where: { id: topBranch[0].branchId }, select: { name: true, code: true } }))
    : null;

  const branchComparison = await Promise.all(
    (await prisma.branch.findMany({
      where: ids ? { id: { in: ids } } : undefined,
      orderBy: { code: 'asc' },
    })).map(async (b) => {
      const [td, tm, tc] = await Promise.all([
        prisma.sale.aggregate({ where: { branchId: b.id, createdAt: { gte: dayStart }, status: 'COMPLETED' }, _sum: { total: true }, _count: true }),
        prisma.sale.aggregate({ where: { branchId: b.id, createdAt: { gte: monthStart }, status: 'COMPLETED' }, _sum: { total: true }, _count: true }),
        prisma.sale.count({ where: { branchId: b.id, status: 'COMPLETED' } }),
      ]);
      return {
        id: b.id, name: b.name, code: b.code,
        todayRevenue: td._sum.total ?? 0, todayTransactions: td._count,
        monthRevenue: tm._sum.total ?? 0, monthTransactions: tm._count,
        totalSales: tc,
        lowStockCount: lowStockBranches.filter((s) => s.branchId === b.id && s.quantity <= s.product.lowStockThreshold).length,
      };
    })
  );

  const activityFeed = recentActivity.map((a) => ({
    id: a.id,
    action: a.action,
    userEmail: a.userEmail,
    entityType: a.entityType,
    createdAt: a.createdAt,
  }));

  return ok(res, {
    kpis: {
      todayRevenue, todayTransactions,
      monthRevenue, monthCount,
      totalCustomers: customerCount,
      totalLeads: leadCount,
      openLeads, wonLeads, lostLeads,
      branchCount,
      avgOrderValue: todayTransactions > 0 ? todayRevenue / todayTransactions : 0,
    },
    topBranch: topBranchName,
    branchComparison,
    lowStock,
    revenueTrend: await revenueTrend(where, periodRange('day', 6), 'day'),
    recentSales: recentSales.map((s) => ({
      id: s.id, invoiceNo: s.invoiceNo, total: s.total, paymentMethod: s.paymentMethod,
      branch: s.branch, customer: s.customer, user: s.user, createdAt: s.createdAt, itemCount: s.items.reduce((x, i) => x + i.quantity, 0),
    })),
    activityFeed,
    upcomingFollowUps: await prisma.followUp.findMany({
      where: { scheduledAt: { gte: dayStart }, status: 'SCHEDULED' },
      orderBy: { scheduledAt: 'asc' },
      take: 5,
      include: { lead: { select: { name: true } }, customer: { select: { name: true } }, assignee: { select: { name: true } } },
    }),
  });
});

// Daily revenue trend for last N days
async function revenueTrend(where: any, range: { start: Date; end: Date }, period: Period, buckets = 7) {
  const sales = await prisma.sale.findMany({
    where: { ...where, status: 'COMPLETED', createdAt: { gte: range.start, lte: range.end } },
    select: { total: true, createdAt: true },
  });

  const fmt = (d: Date) => {
    if (period === 'day') return d.toISOString().slice(0, 10);
    const m = d.getMonth() + 1;
    return `${d.getFullYear()}-${String(m).padStart(2, '0')}`;
  };

  const map = new Map<string, { date: string; revenue: number; transactions: number }>();
  for (let i = buckets - 1; i >= 0; i--) {
    const d = new Date(range.end);
    d.setDate(d.getDate() - i);
    map.set(fmt(d), { date: fmt(d), revenue: 0, transactions: 0 });
  }
  for (const s of sales) {
    const key = fmt(s.createdAt);
    if (!map.has(key)) map.set(key, { date: key, revenue: 0, transactions: 0 });
    const entry = map.get(key)!;
    entry.revenue += s.total;
    entry.transactions += 1;
  }
  return Array.from(map.values());
}

// ======================= REPORTS =======================

function paramRange(req: AuthRequest) {
  const period = (req.query.period as Period) ?? 'month';
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  return periodRange(period, 0, from, to);
}

export const getSalesReport = asyncHandler(async (req: AuthRequest, res) => {
  const { where } = resolveScopeAndBranch(req);
  const { start, end } = paramRange(req);
  const sales = await prisma.sale.findMany({
    where: { ...where, status: 'COMPLETED', createdAt: { gte: start, lte: end } },
    include: { items: { include: { product: { select: { cost: true } } } }, branch: { select: { name: true, code: true } }, user: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const totalCost = sales.reduce((s, x) => s + x.items.reduce((si, it) => si + (it.product?.cost ?? it.unitPrice) * it.quantity, 0), 0);
  const totalDiscount = sales.reduce((s, x) => s + x.discount, 0);
  const grossProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const byBranch = new Map<string, { name: string; revenue: number; count: number }>();
  const byMethod = new Map<string, { method: string; revenue: number; count: number }>();
  const bestSellers = new Map<string, { productId: string; name: string; quantity: number; revenue: number }>();
  const staffPerf = new Map<string, { userId: string; name: string; revenue: number; count: number }>();

  for (const s of sales) {
    const b = byBranch.get(s.branchId) ?? { name: `${s.branch?.code ?? ''} — ${s.branch?.name ?? ''}`, revenue: 0, count: 0 };
    b.revenue += s.total; b.count += 1;
    byBranch.set(s.branchId, b);

    const m = byMethod.get(s.paymentMethod) ?? { method: s.paymentMethod, revenue: 0, count: 0 };
    m.revenue += s.total; m.count += 1;
    byMethod.set(s.paymentMethod, m);

    const sp = staffPerf.get(s.userId ?? '') ?? { userId: s.userId ?? '', name: s.user?.name ?? 'System', revenue: 0, count: 0 };
    sp.revenue += s.total; sp.count += 1;
    staffPerf.set(s.userId ?? '', sp);

    for (const item of s.items) {
      const bs = bestSellers.get(item.productId) ?? { productId: item.productId, name: item.productName, quantity: 0, revenue: 0 };
      bs.quantity += item.quantity; bs.revenue += item.lineTotal;
      bestSellers.set(item.productId, bs);
    }
  }

  return ok(res, {
    period: { start, end, label: req.query.period ?? 'month' },
    summary: { totalRevenue, totalCost, grossProfit, profitMargin, totalTransactions: sales.length, totalDiscount },
    byBranch: Array.from(byBranch.values()).sort((a, b) => b.revenue - a.revenue),
    byPaymentMethod: Array.from(byMethod.values()).sort((a, b) => b.revenue - a.revenue),
    bestSellers: Array.from(bestSellers.values()).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    staffPerformance: Array.from(staffPerf.values()).sort((a, b) => b.revenue - a.revenue),
    revenueTrend: await revenueTrend(where, { start, end }, req.query.period as Period ?? 'month', 12),
  });
});

export const getLeadsReport = asyncHandler(async (req: AuthRequest, res) => {
  const { where } = resolveScopeAndBranch(req);
  const { start, end } = paramRange(req);
  const leads = await prisma.lead.findMany({
    where: { ...where, createdAt: { gte: start, lte: end } },
    include: { assignedTo: { select: { name: true } } },
  });

  const total = leads.length;
  const won = leads.filter((l) => l.status === 'WON').length;
  const lost = leads.filter((l) => l.status === 'LOST').length;
  const open = total - won - lost;
  const conversionRate = total > 0 ? (won / total) * 100 : 0;
  const pipelineValue = leads.filter((l) => l.status !== 'WON' && l.status !== 'LOST').reduce((s, l) => s + l.value, 0);
  const wonValue = leads.filter((l) => l.status === 'WON').reduce((s, l) => s + l.value, 0);

  const bySource = new Map<string, { source: string; count: number; won: number }>();
  const byStatus = new Map<string, { status: string; count: number; value: number }>();
  const byAssignee = new Map<string, { name: string; total: number; won: number; value: number }>();

  for (const l of leads) {
    const s = bySource.get(l.source) ?? { source: l.source, count: 0, won: 0 };
    s.count += 1; if (l.status === 'WON') s.won += 1;
    bySource.set(l.source, s);

    const st = byStatus.get(l.status) ?? { status: l.status, count: 0, value: 0 };
    st.count += 1; st.value += l.value;
    byStatus.set(l.status, st);

    const a = byAssignee.get(l.assignedToId ?? '') ?? { name: l.assignedTo?.name ?? 'Unassigned', total: 0, won: 0, value: 0 };
    a.total += 1; a.value += l.value; if (l.status === 'WON') a.won += 1;
    byAssignee.set(l.assignedToId ?? '', a);
  }

  return ok(res, {
    period: { start, end, label: req.query.period ?? 'month' },
    summary: { total, won, lost, open, conversionRate, pipelineValue, wonValue },
    bySource: Array.from(bySource.values()),
    byStatus: Array.from(byStatus.values()),
    byAssignee: Array.from(byAssignee.values()),
  });
});

export const getCustomerGrowthReport = asyncHandler(async (req: AuthRequest, res) => {
  const { where } = resolveCustomerScope(req);
  const { start, end } = paramRange(req);
  const customers = await prisma.customer.findMany({ where: { ...(where as any), createdAt: { gte: start, lte: end } }, select: { createdAt: true, segment: true } });

  const monthly = new Map<string, { month: string; count: number }>();
  const bySegment = new Map<string, { segment: string; count: number }>();
  for (const c of customers) {
    const key = c.createdAt.toISOString().slice(0, 7);
    const m = monthly.get(key) ?? { month: key, count: 0 };
    m.count += 1;
    monthly.set(key, m);
    const seg = bySegment.get(c.segment) ?? { segment: c.segment, count: 0 };
    seg.count += 1;
    bySegment.set(c.segment, seg);
  }
  const totalCustomers = await prisma.customer.count({ where: where as any });

  return ok(res, {
    period: { start, end, label: req.query.period ?? 'month' },
    totalCustomers,
    newInPeriod: customers.length,
    monthly: Array.from(monthly.values()).sort((a, b) => a.month.localeCompare(b.month)),
    bySegment: Array.from(bySegment.values()),
  });
});

// ======================= PROFIT & LOSS =======================

export const getPnlReport = asyncHandler(async (req: AuthRequest, res) => {
  const { where } = resolveScopeAndBranch(req);
  const { start, end } = paramRange(req);
  const sales = await prisma.sale.findMany({
    where: { ...where, status: 'COMPLETED', createdAt: { gte: start, lte: end } },
    include: {
      items: { include: { product: { select: { cost: true } } } },
      branch: { select: { id: true, name: true, code: true } },
      returns: { select: { amount: true, status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const expenses = await prisma.expense.findMany({
    where: { ...where, expenseDate: { gte: start, lte: end } },
    include: { branch: { select: { id: true, name: true, code: true } } },
    orderBy: { expenseDate: 'asc' },
  });

  const totalRevenue = sales.reduce((s, x) => s + x.total, 0);
  const totalCogs = sales.reduce((s, x) => s + x.items.reduce((si, it) => si + (it.product?.cost ?? it.unitPrice) * it.quantity, 0), 0);
  const totalDiscount = sales.reduce((s, x) => s + x.discount, 0);
  const totalTax = sales.reduce((s, x) => s + x.tax, 0);
  const totalPointsDiscount = sales.reduce((s, x) => s + (x.pointsDiscount ?? 0), 0);
  const pendingReturns = sales.reduce((s, x) => s + x.returns.reduce((a, r) => a + r.amount, 0), 0);
  const totalExpenses = expenses.reduce((s, x) => s + x.amount, 0);
  const grossProfit = totalRevenue - totalCogs;
  const netProfit = grossProfit - pendingReturns - totalExpenses;
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const expenseByCategory = new Map<string, { category: string; amount: number; count: number }>();
  for (const e of expenses) {
    const c = expenseByCategory.get(e.category) ?? { category: e.category, amount: 0, count: 0 };
    c.amount += e.amount;
    c.count += 1;
    expenseByCategory.set(e.category, c);
  }

  const byBranch = new Map<string, { id: string; name: string; revenue: number; cost: number; expenses: number; profit: number; count: number }>();
  for (const s of sales) {
    const b = byBranch.get(s.branchId) ?? { id: s.branchId, name: `${s.branch?.code ?? ''} — ${s.branch?.name ?? ''}`, revenue: 0, cost: 0, expenses: 0, profit: 0, count: 0 };
    const cost = s.items.reduce((si, it) => si + (it.product?.cost ?? it.unitPrice) * it.quantity, 0);
    b.revenue += s.total;
    b.cost += cost;
    b.profit += s.total - cost;
    b.count += 1;
    byBranch.set(s.branchId, b);
  }
  for (const e of expenses) {
    const b = byBranch.get(e.branchId) ?? { id: e.branchId, name: `${e.branch?.code ?? ''} — ${e.branch?.name ?? ''}`, revenue: 0, cost: 0, expenses: 0, profit: 0, count: 0 };
    b.expenses += e.amount;
    b.profit -= e.amount;
    byBranch.set(e.branchId, b);
  }

  return ok(res, {
    period: { start, end, label: req.query.period ?? 'month' },
    summary: {
      totalRevenue,
      totalCogs,
      grossProfit,
      netProfit,
      profitMargin,
      netMargin,
      totalDiscount,
      totalTax,
      totalPointsDiscount,
      pendingReturns,
      totalExpenses,
      transactions: sales.length,
      expenseTransactions: expenses.length,
    },
    expensesByCategory: Array.from(expenseByCategory.values()).sort((a, b) => b.amount - a.amount),
    byBranch: Array.from(byBranch.values()).sort((a, b) => b.revenue - a.revenue),
  });
});

// ======================= STOCK VALUATION =======================

export const getStockValuation = asyncHandler(async (req: AuthRequest, res) => {
  const branchId = req.query.branchId as string | undefined;
  if (branchId) assertBranchAllowed(req.user!, branchId);

  const where: any = { ...branchScope(req.user!), product: { isActive: true } };
  if (branchId) where.branchId = branchId;

  const stock = await prisma.branchProduct.findMany({
    where,
    include: { product: true, branch: { select: { id: true, name: true, code: true } } },
    orderBy: [{ branch: { code: 'asc' } }, { product: { name: 'asc' } }],
  });

  const byBranch = new Map<string, { id: string; name: string; skuCount: number; units: number; valueAtCost: number; valueAtPrice: number }>();
  for (const s of stock) {
    const b = byBranch.get(s.branchId) ?? { id: s.branchId, name: `${s.branch?.code ?? ''} — ${s.branch?.name ?? ''}`, skuCount: 0, units: 0, valueAtCost: 0, valueAtPrice: 0 };
    b.skuCount += 1;
    b.units += s.quantity;
    b.valueAtCost += s.quantity * s.product.cost;
    b.valueAtPrice += s.quantity * s.product.price;
    byBranch.set(s.branchId, b);
  }

  const products = stock.map((s) => ({
    productId: s.productId,
    branchId: s.branchId,
    branchName: `${s.branch?.code ?? ''} — ${s.branch?.name ?? ''}`,
    name: s.product.name,
    sku: s.product.sku,
    category: s.product.category,
    cost: s.product.cost,
    price: s.product.price,
    quantity: s.quantity,
    valueAtCost: s.quantity * s.product.cost,
    valueAtPrice: s.quantity * s.product.price,
  }));

  const totalUnits = stock.reduce((s, x) => s + x.quantity, 0);
  const totalValueAtCost = stock.reduce((s, x) => s + x.quantity * x.product.cost, 0);
  const totalValueAtPrice = stock.reduce((s, x) => s + x.quantity * x.product.price, 0);

  return ok(res, {
    summary: { totalSku: stock.length, totalUnits, totalValueAtCost, totalValueAtPrice, potentialMargin: totalValueAtPrice - totalValueAtCost },
    byBranch: Array.from(byBranch.values()).sort((a, b) => b.valueAtCost - a.valueAtCost),
    products,
  });
});

// ======================= PURCHASE SUGGESTIONS =======================

export const getPurchaseSuggestions = asyncHandler(async (req: AuthRequest, res) => {
  const branchId = req.query.branchId as string | undefined;
  if (branchId) assertBranchAllowed(req.user!, branchId);

  const scope = branchScope(req.user!);
  const where: any = { ...scope, product: { isActive: true } };
  if (branchId) where.branchId = branchId;

  const stock = await prisma.branchProduct.findMany({
    where,
    include: { product: true, branch: { select: { id: true, name: true, code: true } } },
    orderBy: [{ branch: { code: 'asc' } }, { product: { name: 'asc' } }],
  });

  // Units sold per product in the last 30 days (for velocity-based reorder)
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const velocityRows = await prisma.saleItem.groupBy({
    by: ['productId'],
    where: {
      sale: {
        status: 'COMPLETED',
        createdAt: { gte: since },
        ...(branchId ? { branchId } : scope),
      },
    },
    _sum: { quantity: true },
  });
  const velocity = new Map(velocityRows.map((v) => [v.productId, v._sum.quantity ?? 0]));

  const suggestions = stock
    .filter((s) => s.quantity <= s.product.lowStockThreshold)
    .map((s) => {
      const sold30 = velocity.get(s.productId) ?? 0;
      const dailyRate = sold30 / 30;
      const coverDays = dailyRate > 0 ? Math.round(s.quantity / dailyRate) : null;
      const target = Math.max(s.product.lowStockThreshold * 2, 1);
      return {
        productId: s.productId,
        name: s.product.name,
        sku: s.product.sku,
        category: s.product.category,
        cost: s.product.cost,
        branchId: s.branchId,
        branchName: `${s.branch?.code ?? ''} — ${s.branch?.name ?? ''}`,
        currentQty: s.quantity,
        lowStockThreshold: s.product.lowStockThreshold,
        suggestedQty: Math.max(target - s.quantity, 1),
        soldLast30: sold30,
        dailyRate,
        coverDays,
        status: s.quantity <= 0 ? 'OUT_OF_STOCK' : 'LOW',
      };
    })
    .sort((a, b) => (b.branchName.localeCompare(a.branchName)) || (a.currentQty === b.currentQty ? a.name.localeCompare(b.name) : a.currentQty - b.currentQty));

  return ok(res, { suggestions });
});

// ======================= RECONCILIATION =======================

// Per-branch payment method totals (cash/card/mobile money/credit) for a day or range.
export const getReconciliation = asyncHandler(async (req: AuthRequest, res) => {
  const branchId = req.query.branchId as string | undefined;
  const from = (req.query.from as string) || todayRange(0).start.toISOString();
  const to = (req.query.to as string) || todayRange(0).end.toISOString();

  const where: any = { ...branchScope(req.user!), status: 'COMPLETED', createdAt: { gte: new Date(from), lte: new Date(to) } };
  if (branchId) {
    assertBranchAllowed(req.user!, branchId);
    where.branchId = branchId;
  }

  const grouped = await prisma.sale.groupBy({
    by: ['branchId', 'paymentMethod'],
    where,
    _sum: { total: true, amountPaid: true, creditUsed: true },
    _count: true,
  });

  const branches = await prisma.branch.findMany({ select: { id: true, name: true, code: true } });
  const branchMap = new Map(branches.map((b) => [b.id, b]));

  const rows = grouped.map((g) => ({
    branchId: g.branchId,
    branch: branchMap.get(g.branchId) ? { id: g.branchId, name: branchMap.get(g.branchId)!.name, code: branchMap.get(g.branchId)!.code } : null,
    method: g.paymentMethod,
    total: g._sum.total ?? 0,
    amountPaid: g._sum.amountPaid ?? 0,
    creditUsed: g._sum.creditUsed ?? 0,
    count: g._count,
  }));

  const totals = grouped.reduce(
    (acc, g) => {
      acc.total += g._sum.total ?? 0;
      acc.amountPaid += g._sum.amountPaid ?? 0;
      acc.creditUsed += g._sum.creditUsed ?? 0;
      acc.count += g._count;
      return acc;
    },
    { total: 0, amountPaid: 0, creditUsed: 0, count: 0 }
  );

  return ok(res, { period: { from, to }, rows, totals });
});

export const exportReportCsv = asyncHandler(async (req: AuthRequest, res) => {
  const report = req.params.type; // sales | leads | customers | staff
  const { where } = resolveScopeAndBranch(req);
  const { start, end } = paramRange(req);

  let rows: Record<string, string | number>[] = [];
  let headers: string[] = [];

  if (report === 'sales') {
    const sales = await prisma.sale.findMany({
      where: { ...where, status: 'COMPLETED', createdAt: { gte: start, lte: end } },
      include: { items: true, branch: { select: { code: true } }, customer: { select: { name: true } }, user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    headers = ['Invoice', 'Date', 'Branch', 'Customer', 'Staff', 'Method', 'Items', 'Total'];
    rows = sales.map((s) => ({
      Invoice: s.invoiceNo,
      Date: s.createdAt.toISOString(),
      Branch: s.branch?.code ?? '',
      Customer: s.customer?.name ?? '',
      Staff: s.user?.name ?? '',
      Method: s.paymentMethod,
      Items: s.items.reduce((x, i) => x + i.quantity, 0),
      Total: s.total,
    }));
  } else if (report === 'leads') {
    const leads = await prisma.lead.findMany({ where: { ...where, createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'asc' } });
    headers = ['Name', 'Company', 'Email', 'Phone', 'Source', 'Status', 'Value', 'Created'];
    rows = leads.map((l) => ({ Name: l.name, Company: l.company ?? '', Email: l.email ?? '', Phone: l.phone ?? '', Source: l.source, Status: l.status, Value: l.value, Created: l.createdAt.toISOString() }));
  } else if (report === 'customers') {
    const customerScope = resolveCustomerScope(req).where;
    const customers = await prisma.customer.findMany({ where: { ...(customerScope as any), createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'asc' } });
    headers = ['Name', 'Email', 'Phone', 'Company', 'Segment', 'Created'];
    rows = customers.map((c) => ({ Name: c.name, Email: c.email ?? '', Phone: c.phone ?? '', Company: c.company ?? '', Segment: c.segment, Created: c.createdAt.toISOString() }));
  } else if (report === 'staff') {
    const staff = await prisma.user.findMany({ where: { role: { in: ['BRANCH_MANAGER', 'SALES_STAFF'] } }, include: { sales: { where: { status: 'COMPLETED', createdAt: { gte: start, lte: end } }, select: { total: true, id: true } } } });
    headers = ['Name', 'Email', 'Role', 'Branch', 'Transactions', 'Revenue'];
    rows = staff.map((u) => ({ Name: u.name, Email: u.email, Role: u.role, Branch: u.branchId ?? '', Transactions: u.sales.length, Revenue: u.sales.reduce((s, x) => s + x.total, 0) }));
  } else {
    return ok(res, { message: 'Unknown report type' });
  }

  const escape = (v: string | number) => {
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h] ?? '')).join(','))].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${report}-report.csv"`);
  return res.send('\uFEFF' + csv);
});

export const exportRevenueJson = asyncHandler(async (req: AuthRequest, res) => {
  const { where } = resolveScopeAndBranch(req);
  const { start, end } = paramRange(req);
  const trend = await revenueTrend(where, { start, end }, req.query.period as Period ?? 'month', 12);
  return ok(res, trend);
});
