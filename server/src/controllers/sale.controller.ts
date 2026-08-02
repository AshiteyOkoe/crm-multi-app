import { z } from 'zod';
import { PaymentMethod, SaleStatus, ReturnStatus, PaymentStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, ok, created, notFound, badRequest, forbidden, getPagination, generateInvoiceNo, branchScope, assertBranchAllowed, todayRange } from '../utils/helpers';
import { pointsForAmount, redemptionValue, maxRedeemablePoints, tierFor } from '../utils/loyalty';
import { writeAuditLog, notifyAdmins } from '../utils/audit';
import { getAppSettings, currencySymbol } from '../utils/settings';
import { buildReceiptText, sendMessage } from '../utils/mailer';
import type { AuthRequest } from '../middleware/auth';

const saleItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
});

const createSaleSchema = z.object({
  branchId: z.string().optional(),
  customerId: z.string().optional().nullable(),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  amountPaid: z.number().min(0).optional(),
  discount: z.number().min(0).optional(),
  tax: z.number().min(0).optional(),
  pointsRedeemed: z.number().int().min(0).optional(),
  items: z.array(saleItemSchema).min(1),
  notes: z.string().optional().or(z.literal('')),
  deliverReceipt: z.array(z.enum(['EMAIL', 'SMS', 'WHATSAPP'])).optional(),
});

export const createSale = asyncHandler(async (req: AuthRequest, res) => {
  const data = createSaleSchema.parse(req.body);
  const settings = await getAppSettings();
  if (req.user!.role === 'SALES_STAFF' && (data.discount ?? 0) > 0) forbidden('Only managers and admins can apply discounts');
  const branchId = data.branchId ?? req.user!.branchId;
  if (!branchId) badRequest('Please select a branch for this sale');
  assertBranchAllowed(req.user!, branchId);

  const itemIds = data.items.map((i) => i.productId);
  const products = await prisma.product.findMany({ where: { id: { in: itemIds }, isActive: true } });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const subtotalItems: Array<{ productId: string; productName: string; quantity: number; unitPrice: number; lineTotal: number }> = [];
  let subtotal = 0;

  for (const item of data.items) {
    const product = productMap.get(item.productId);
    if (!product) badRequest(`Product ${item.productId} not found or inactive`);
    // check stock in branch
    const stock = await prisma.branchProduct.findUnique({ where: { branchId_productId: { branchId: branchId!, productId: item.productId } } });
    const available = stock?.quantity ?? 0;
    if (available < item.quantity) badRequest(`Insufficient stock for "${product!.name}" (available: ${available})`, { product: product!.name });

    const lineTotal = product!.price * item.quantity;
    subtotal += lineTotal;
    subtotalItems.push({ productId: item.productId, productName: product!.name, quantity: item.quantity, unitPrice: product!.price, lineTotal });
  }

  const discount = data.discount ?? 0;
  const tax = data.tax ?? 0;
  const pointsRedeemed = data.pointsRedeemed ?? 0;

  // Loyalty redemption
  let pointsDiscount = 0;
  let redeemedPoints = 0;
  if (pointsRedeemed > 0) {
    if (!data.customerId) badRequest('Select a customer to redeem loyalty points');
    const cust = await prisma.customer.findUnique({ where: { id: data.customerId! }, select: { points: true } });
    if (!cust) notFound('Customer not found');
    if (cust.points < pointsRedeemed) badRequest(`Customer only has ${cust.points} points available`);
    const base = Math.max(subtotal - discount + tax, 0);
    redeemedPoints = Math.min(pointsRedeemed, maxRedeemablePoints(base));
    pointsDiscount = redemptionValue(redeemedPoints);
  }
  const total = Math.max(subtotal - discount + tax - pointsDiscount, 0);
  // Tier-aware points (fetch customer tier when a customer is linked)
  let customerTier: 'BRONZE' | 'SILVER' | 'GOLD' = 'BRONZE';
  if (data.customerId) {
    const cust = await prisma.customer.findUnique({ where: { id: data.customerId }, select: { totalPointsEarned: true } });
    if (cust) customerTier = tierFor(cust.totalPointsEarned ?? 0);
  }
  const pointsEarned = settings.loyaltyEnabled ? pointsForAmount(total, customerTier) : 0;

  // Credit / payment status handling
  let amountPaid = data.amountPaid ?? (data.paymentMethod === 'CREDIT' ? 0 : total);
  amountPaid = Math.min(Math.max(amountPaid, 0), total);
  const creditUsed = Math.round((total - amountPaid) * 100) / 100;
  let paymentStatus: PaymentStatus = PaymentStatus.PAID;
  if (creditUsed >= total && total > 0) paymentStatus = PaymentStatus.UNPAID;
  else if (creditUsed > 0) paymentStatus = PaymentStatus.PARTIAL;

  let customerForCredit: { id: string; creditBalance: number; creditLimit: number } | null = null;
  if (creditUsed > 0) {
    if (!settings.creditEnabled) badRequest('Credit purchases are currently disabled');
    if (!data.customerId) badRequest('Select a customer to buy on credit');
    customerForCredit = await prisma.customer.findUnique({ where: { id: data.customerId! }, select: { id: true, creditBalance: true, creditLimit: true } });
    if (!customerForCredit) notFound('Customer not found');
    if (customerForCredit.creditLimit <= 0) badRequest('This customer does not have a credit limit');
    if (customerForCredit.creditBalance + creditUsed > customerForCredit.creditLimit) {
      badRequest(`Credit limit exceeded. Remaining credit: ${(customerForCredit.creditLimit - customerForCredit.creditBalance).toFixed(2)}`, { creditLimit: customerForCredit.creditLimit, balance: customerForCredit.creditBalance, requested: creditUsed });
    }
  }

  const invoiceNo = generateInvoiceNo();
  const sale = await prisma.sale.create({
    data: {
      invoiceNo,
      branchId: branchId!,
      userId: req.user!.id,
      customerId: data.customerId ?? null,
      paymentMethod: data.paymentMethod,
      paymentStatus,
      amountPaid,
      creditUsed,
      currency: settings.currency,
      subtotal,
      discount,
      tax,
      total,
      pointsEarned,
      pointsRedeemed: redeemedPoints,
      pointsDiscount,
      notes: data.notes || null,
      items: { create: subtotalItems },
    },
    include: { items: { include: { product: true } }, customer: { select: { name: true, phone: true, email: true, points: true } }, branch: { select: { name: true, code: true } }, user: { select: { name: true } } },
  });

  // Loyalty balance updates
  if (sale.customerId && (pointsEarned > 0 || redeemedPoints > 0)) {
    await prisma.customer.update({
      where: { id: sale.customerId },
      data: {
        points: { increment: pointsEarned - redeemedPoints },
        totalPointsEarned: { increment: pointsEarned },
      },
    });
  }

  // Credit balance update
  if (customerForCredit && creditUsed > 0) {
    await prisma.customer.update({ where: { id: customerForCredit.id }, data: { creditBalance: { increment: creditUsed } } });
  }

  // decrement stock
  for (const item of subtotalItems) {
    const stock = await prisma.branchProduct.findUnique({ where: { branchId_productId: { branchId: branchId!, productId: item.productId } } });
    if (stock) {
      const newQty = stock.quantity - item.quantity;
      await prisma.branchProduct.update({ where: { branchId_productId: { branchId: branchId!, productId: item.productId } }, data: { quantity: newQty } });

      // low stock alert
      const product = productMap.get(item.productId)!;
      if (settings.lowStockAlertEnabled && newQty <= product.lowStockThreshold && newQty >= 0) {
        await notifyAdmins({ type: 'LOW_STOCK', title: 'Low stock alert', message: `"${product.name}" is low in ${branchId} (${newQty} remaining).`, link: '/inventory' });
      }
    }
  }

  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'SALE_CREATED', entityType: 'Sale', entityId: sale.id, branchId: branchId!, details: { total, pointsEarned, pointsRedeemed: redeemedPoints, pointsDiscount, paymentStatus, creditUsed, amountPaid } });

  // Deliver receipt
  if (data.deliverReceipt?.length && sale.customer) {
    const symbol = await currencySymbol(settings.currency);
    const text = buildReceiptText({
      businessName: settings.businessName,
      footer: settings.receiptFooter,
      invoiceNo: sale.invoiceNo,
      createdAt: sale.createdAt,
      branchName: sale.branch?.name,
      customerName: sale.customer?.name,
      currency: symbol,
      items: sale.items.map((i) => ({ productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
      subtotal: sale.subtotal,
      discount: sale.discount,
      tax: sale.tax,
      pointsDiscount: sale.pointsDiscount,
      total: sale.total,
      amountPaid: sale.amountPaid,
      creditUsed: sale.creditUsed,
      paymentMethod: sale.paymentMethod,
    });
    for (const channel of data.deliverReceipt) {
      const to = channel === 'EMAIL' ? sale.customer?.email : sale.customer?.phone;
      if (to) await sendMessage({ to, channel: channel as any, subject: `Receipt ${sale.invoiceNo}`, body: text }, settings);
    }
  }

  return created(res, sale);
});

export const deliverReceipt = asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({ channels: z.array(z.enum(['EMAIL', 'SMS', 'WHATSAPP'])).min(1) });
  const data = schema.parse(req.body);
  const sale = await prisma.sale.findUnique({
    where: { id: req.params.id },
    include: { items: true, customer: { select: { name: true, email: true, phone: true } }, branch: { select: { name: true, code: true } } },
  });
  if (!sale) notFound('Sale not found');
  assertBranchAllowed(req.user!, sale.branchId);
  if (!sale.customer) badRequest('This sale has no linked customer to deliver a receipt to');

  const settings = await getAppSettings();
  const symbol = await currencySymbol(settings.currency);
  const text = buildReceiptText({
    businessName: settings.businessName,
    footer: settings.receiptFooter,
    invoiceNo: sale.invoiceNo,
    createdAt: sale.createdAt,
    branchName: sale.branch?.name,
    customerName: sale.customer?.name,
    currency: symbol,
    items: sale.items.map((i) => ({ productName: i.productName, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    subtotal: sale.subtotal,
    discount: sale.discount,
    tax: sale.tax,
    pointsDiscount: sale.pointsDiscount ?? 0,
    total: sale.total,
    amountPaid: sale.amountPaid,
    creditUsed: sale.creditUsed,
    paymentMethod: sale.paymentMethod,
  });

  const delivered: string[] = [];
  for (const channel of data.channels) {
    const to = channel === 'EMAIL' ? sale.customer?.email : sale.customer?.phone;
    if (!to) continue;
    const okSent = await sendMessage({ to, channel: channel as any, subject: `Receipt ${sale.invoiceNo}`, body: text }, settings);
    if (okSent) delivered.push(channel);
  }
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'RECEIPT_DELIVERED', entityType: 'Sale', entityId: sale.id, branchId: sale.branchId, details: { channels: delivered } });
  return ok(res, { delivered });
});

export const listSales = asyncHandler(async (req: AuthRequest, res) => {
  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 20 });
  const branchId = req.query.branchId as string | undefined;
  const status = req.query.status as string | undefined;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const search = (req.query.search as string) ?? '';

  const where: any = { ...branchScope(req.user!) };
  if (branchId) {
    assertBranchAllowed(req.user!, branchId);
    where.branchId = branchId;
  }
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  if (search) {
    where.OR = [{ invoiceNo: { contains: search, mode: 'insensitive' } }, { customer: { name: { contains: search, mode: 'insensitive' } } }];
  }

  const [items, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        customer: { select: { id: true, name: true, phone: true } },
        user: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
        returns: { select: { status: true, id: true } },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  const { _sum } = await prisma.sale.aggregate({ where: { ...where, status: 'COMPLETED' }, _sum: { total: true } });
  return ok(res, { items, total, page, pageSize, pages: Math.ceil(total / pageSize), revenue: _sum.total ?? 0 });
});

export const getSale = asyncHandler(async (req: AuthRequest, res) => {
  const sale = await prisma.sale.findUnique({
    where: { id: req.params.id },
    include: {
      items: { include: { product: { select: { sku: true, name: true } } } },
      customer: true,
      user: { select: { name: true, email: true } },
      branch: true,
      returns: true,
    },
  });
  if (!sale) notFound('Sale not found');
  assertBranchAllowed(req.user!, sale!.branchId);
  return ok(res, sale);
});

// Void a sale (admin/manager only) — restore stock
export const voidSale = asyncHandler(async (req: AuthRequest, res) => {
  if (req.user!.role === 'SALES_STAFF') forbidden('Only managers and admins can void sales');
  const sale = await prisma.sale.findUnique({ where: { id: req.params.id }, include: { items: true } });
  if (!sale) notFound('Sale not found');
  assertBranchAllowed(req.user!, sale.branchId);
  if (sale.status !== 'COMPLETED') badRequest('Only completed sales can be voided');

  for (const item of sale.items) {
    await prisma.branchProduct.upsert({
      where: { branchId_productId: { branchId: sale.branchId, productId: item.productId } },
      update: { quantity: { increment: item.quantity } },
      create: { branchId: sale.branchId, productId: item.productId, quantity: item.quantity },
    });
  }

  // Reverse loyalty: claw back earned points, return redeemed points
  if (sale.customerId && (sale.pointsEarned > 0 || sale.pointsRedeemed > 0)) {
    const cust = await prisma.customer.findUnique({ where: { id: sale.customerId }, select: { points: true } });
    if (cust) {
      await prisma.customer.update({
        where: { id: sale.customerId },
        data: {
          points: Math.max(cust.points - sale.pointsEarned + sale.pointsRedeemed, 0),
          totalPointsEarned: { decrement: sale.pointsEarned },
        },
      });
    }
  }

  // Reverse credit: remove the outstanding credit added by this sale
  if (sale.customerId && sale.creditUsed > 0) {
    await prisma.customer.update({ where: { id: sale.customerId }, data: { creditBalance: { decrement: sale.creditUsed } } });
  }

  const updated = await prisma.sale.update({ where: { id: sale.id }, data: { status: 'VOID' } });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'SALE_VOIDED', entityType: 'Sale', entityId: sale.id, branchId: sale.branchId });
  return ok(res, updated);
});

// ======================= RETURNS =======================

export const createReturn = asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({
    saleId: z.string(),
    reason: z.string().min(2),
    amount: z.number().min(0),
  });
  const data = schema.parse(req.body);

  const sale = await prisma.sale.findUnique({ where: { id: data.saleId } });
  if (!sale) notFound('Sale not found');
  assertBranchAllowed(req.user!, sale.branchId);
  if (sale.status !== 'COMPLETED') badRequest('Only completed sales can be returned');

  const r = await prisma.return.create({
    data: {
      saleId: sale.id,
      branchId: sale.branchId,
      userId: req.user!.id,
      amount: data.amount,
      reason: data.reason,
      status: ReturnStatus.PENDING,
    },
    include: { sale: { include: { items: true } }, branch: { select: { name: true } } },
  });

  await notifyAdmins({ type: 'RETURN', title: 'Return requested', message: `A ${data.amount} return was requested on invoice ${sale.invoiceNo}.`, link: '/sales' });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'RETURN_REQUESTED', entityType: 'Return', entityId: r.id, branchId: sale.branchId });
  return created(res, r);
});

// Today's revenue snapshot for POS footer
export const todaySummary = asyncHandler(async (req: AuthRequest, res) => {
  const { start } = todayRange(0);
  const scope = branchScope(req.user!);
  const where: any = { ...scope, createdAt: { gte: start }, status: 'COMPLETED' };
  const [count, agg] = await Promise.all([
    prisma.sale.count({ where }),
    prisma.sale.aggregate({ where, _sum: { total: true } }),
  ]);
  return ok(res, { count, revenue: agg._sum.total ?? 0, date: start });
});
