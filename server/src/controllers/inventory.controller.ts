import { z } from 'zod';
import { TransferStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler, ok, created, notFound, badRequest, forbidden, getPagination, assertBranchAllowed, branchScope } from '../utils/helpers';
import { writeAuditLog, notifyAdmins } from '../utils/audit';
import type { AuthRequest } from '../middleware/auth';

// ======================= PRODUCTS =======================

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  category: z.string().optional().or(z.literal('')),
  description: z.string().optional().or(z.literal('')),
  price: z.number().min(0),
  cost: z.number().min(0),
  lowStockThreshold: z.number().int().min(0).optional(),
});

export const listProducts = asyncHandler(async (req: AuthRequest, res) => {
  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 50 });
  const search = (req.query.search as string) ?? '';
  const category = req.query.category as string | undefined;

  const where: any = {};
  if (category) where.category = category;
  if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }, { category: { contains: search, mode: 'insensitive' } }];

  const [items, total] = await Promise.all([
    prisma.product.findMany({ where, skip, take: pageSize, orderBy: { name: 'asc' }, include: { branchStock: { include: { branch: { select: { id: true, name: true, code: true } } } } } }),
    prisma.product.count({ where }),
  ]);
  return ok(res, { items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

export const createProduct = asyncHandler(async (req: AuthRequest, res) => {
  if (req.user!.role === 'SALES_STAFF') forbidden('Only managers and admins can create products');  const data = productSchema
    .extend({
      stock: z.array(z.object({ branchId: z.string().min(1), quantity: z.number().int().min(0) })).optional(),
    })
    .parse(req.body);

  const { stock, ...productData } = data;

  if (stock?.length) {
    const branchIds = [...new Set(stock.map((s) => s.branchId))];
    if (branchIds.length !== stock.length) badRequest('Each branch may only appear once in stock');
    const validBranches = await prisma.branch.count({ where: { id: { in: branchIds }, isActive: true } });
    if (validBranches !== branchIds.length) badRequest('One or more branches are invalid');
    if (req.user!.role !== 'ADMIN' && stock.some((s) => s.branchId !== req.user!.branchId)) {
      forbidden('You can only set initial stock for your own branch');
    }
  }

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({ data: productData });
    if (stock?.length) {
      await tx.branchProduct.createMany({
        data: stock.map((s) => ({ branchId: s.branchId, productId: created.id, quantity: s.quantity })),
      });
    }
    return created;
  });

  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'PRODUCT_CREATED', entityType: 'Product', entityId: product.id, details: stock?.length ? { stock } : undefined });
  return created(res, product);
});

export const updateProduct = asyncHandler(async (req: AuthRequest, res) => {
  if (req.user!.role === 'SALES_STAFF') forbidden('Only managers and admins can edit products');
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing) notFound('Product not found');
  const data = productSchema.partial().parse(req.body);
  const product = await prisma.product.update({ where: { id: req.params.id }, data });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'PRODUCT_UPDATED', entityType: 'Product', entityId: product.id });
  return ok(res, product);
});

// ======================= BRANCH STOCK =======================

export const getInventory = asyncHandler(async (req: AuthRequest, res) => {
  const branchId = req.query.branchId as string | undefined;
  if (branchId) assertBranchAllowed(req.user!, branchId);

  const branches = await prisma.branch.findMany({ where: { isActive: true }, orderBy: { code: 'asc' } });
  const allowed = req.user!.role === 'ADMIN' ? branches.map((b) => b.id) : [req.user!.branchId!];
  const targetBranchId = branchId ?? allowed[0];

  const [stock, lowStock] = await Promise.all([
    prisma.branchProduct.findMany({
      where: { branchId: targetBranchId, product: { isActive: true } },
      include: { product: true },
      orderBy: { product: { name: 'asc' } },
    }),
    prisma.branchProduct.findMany({
      where: { branchId: { in: allowed }, quantity: { lte: 0 }, product: { isActive: true } },
      include: { product: true, branch: { select: { id: true, name: true, code: true } } },
    }),
  ]);

  const lowStockItems = await prisma.branchProduct.findMany({
    where: { branchId: { in: allowed }, product: { isActive: true } },
    include: { product: true, branch: { select: { id: true, name: true, code: true } } },
  });
  const lowStockThresholdList = lowStockItems.filter((s) => s.quantity > 0 && s.quantity <= s.product.lowStockThreshold);

  const outOfStock = lowStock.filter((s) => s.quantity <= 0);
  const stockMap = new Map(stock.map((s) => [s.productId, s.quantity]));

  const products = stock
    .map((s) => ({ ...s.product, quantity: s.quantity }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  return ok(res, {
    branch: branches.find((b) => b.id === targetBranchId),
    branches: branches.filter((b) => allowed.includes(b.id)),
    products,
    totalSku: stock.length,
    totalUnits: stock.reduce((s, x) => s + x.quantity, 0),
    stockValue: stock.reduce((s, x) => s + x.quantity * x.product.price, 0),
    lowStock: lowStockThresholdList,
    outOfStock,
    stockMap: Object.fromEntries(stockMap),
  });
});

// set stock level (manual adjustment) — admin/manager
export const setStock = asyncHandler(async (req: AuthRequest, res) => {
  if (req.user!.role === 'SALES_STAFF') forbidden('Only managers and admins can adjust stock');
  const schema = z.object({ branchId: z.string(), productId: z.string(), quantity: z.number().int().min(0) });
  const data = schema.parse(req.body);
  assertBranchAllowed(req.user!, data.branchId);

  const bp = await prisma.branchProduct.upsert({
    where: { branchId_productId: { branchId: data.branchId, productId: data.productId } },
    update: { quantity: data.quantity },
    create: { branchId: data.branchId, productId: data.productId, quantity: data.quantity },
  });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'STOCK_ADJUSTED', entityType: 'BranchProduct', entityId: `${data.branchId}:${data.productId}`, branchId: data.branchId, details: { quantity: data.quantity } });
  return ok(res, bp);
});

// ======================= TRANSFERS =======================

export const requestTransfer = asyncHandler(async (req: AuthRequest, res) => {
  const schema = z.object({
    productId: z.string(),
    fromBranchId: z.string(),
    toBranchId: z.string(),
    quantity: z.number().int().min(1),
    note: z.string().optional().or(z.literal('')),
  });
  const data = schema.parse(req.body);
  if (data.fromBranchId === data.toBranchId) badRequest('Source and destination branches must differ');
  if (req.user!.role !== 'ADMIN' && (data.fromBranchId !== req.user!.branchId && data.toBranchId !== req.user!.branchId)) {
    forbidden('You can only create transfers involving your own branch');
  }

  const stock = await prisma.branchProduct.findUnique({ where: { branchId_productId: { branchId: data.fromBranchId, productId: data.productId } } });
  if ((stock?.quantity ?? 0) < data.quantity) badRequest('Insufficient stock in the source branch');

  const transfer = await prisma.stockTransfer.create({
    data: {
      productId: data.productId,
      fromBranchId: data.fromBranchId,
      toBranchId: data.toBranchId,
      quantity: data.quantity,
      status: TransferStatus.PENDING,
      requestedById: req.user!.id,
      note: data.note || null,
    },
    include: { product: true, fromBranch: { select: { name: true } }, toBranch: { select: { name: true } }, requestedBy: { select: { name: true } } },
  });

  await notifyAdmins({ type: 'TRANSFER', title: 'Stock transfer requested', message: `${data.quantity} x ${transfer.product.name} from ${transfer.fromBranch.name} to ${transfer.toBranch.name}.`, link: '/inventory' });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'TRANSFER_REQUESTED', entityType: 'StockTransfer', entityId: transfer.id, branchId: data.fromBranchId });
  return created(res, transfer);
});

export const listTransfers = asyncHandler(async (req: AuthRequest, res) => {
  const { page, pageSize, skip } = getPagination(req.query, { page: 1, pageSize: 20 });
  const status = req.query.status as string | undefined;

  let where: any = {};
  if (req.user!.role !== 'ADMIN') {
    where = { OR: [{ fromBranchId: req.user!.branchId }, { toBranchId: req.user!.branchId }] };
  }
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    prisma.stockTransfer.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        fromBranch: { select: { id: true, name: true, code: true } },
        toBranch: { select: { id: true, name: true, code: true } },
        requestedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
    }),
    prisma.stockTransfer.count({ where }),
  ]);
  return ok(res, { items, total, page, pageSize, pages: Math.ceil(total / pageSize) });
});

export const decideTransfer = asyncHandler(async (req: AuthRequest, res) => {
  const action = (req.body?.action as string) ?? 'APPROVED';
  if (!['APPROVED', 'REJECTED', 'COMPLETED'].includes(action)) badRequest('Invalid action');

  const transfer = await prisma.stockTransfer.findUnique({ where: { id: req.params.id } });
  if (!transfer) notFound('Transfer not found');

  if (action === 'APPROVED') {
    if (req.user!.role === 'SALES_STAFF') forbidden('Only managers and admins can approve transfers');
    const updated = await prisma.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: TransferStatus.APPROVED, approvedById: req.user!.id },
    });
    await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'TRANSFER_APPROVED', entityType: 'StockTransfer', entityId: transfer.id, branchId: transfer.fromBranchId });
    return ok(res, updated);
  }

  if (action === 'REJECTED') {
    if (req.user!.role === 'SALES_STAFF') forbidden('Only managers and admins can reject transfers');
    const updated = await prisma.stockTransfer.update({
      where: { id: transfer.id },
      data: { status: TransferStatus.REJECTED, approvedById: req.user!.id },
    });
    await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'TRANSFER_REJECTED', entityType: 'StockTransfer', entityId: transfer.id, branchId: transfer.fromBranchId });
    return ok(res, updated);
  }

  // COMPLETED — move stock (must be approved first)
  if (transfer.status !== 'APPROVED') badRequest('Transfer must be approved before it can be completed');
  assertBranchAllowed(req.user!, transfer.toBranchId);

  const fromStock = await prisma.branchProduct.findUnique({ where: { branchId_productId: { branchId: transfer.fromBranchId, productId: transfer.productId } } });
  if ((fromStock?.quantity ?? 0) < transfer.quantity) badRequest('Insufficient stock in source branch');

  // deduct from source
  await prisma.branchProduct.update({
    where: { branchId_productId: { branchId: transfer.fromBranchId, productId: transfer.productId } },
    data: { quantity: (fromStock?.quantity ?? 0) - transfer.quantity },
  });
  // add to destination
  await prisma.branchProduct.upsert({
    where: { branchId_productId: { branchId: transfer.toBranchId, productId: transfer.productId } },
    update: { quantity: { increment: transfer.quantity } },
    create: { branchId: transfer.toBranchId, productId: transfer.productId, quantity: transfer.quantity },
  });

  const updated = await prisma.stockTransfer.update({
    where: { id: transfer.id },
    data: { status: TransferStatus.COMPLETED, completedAt: new Date() },
  });
  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'TRANSFER_COMPLETED', entityType: 'StockTransfer', entityId: transfer.id, branchId: transfer.toBranchId });
  return ok(res, updated);
});

// ======================= BARCODE LOOKUP =======================

// POS fast-add: find a product by SKU / barcode and return its branch stock.
export const lookupByBarcode = asyncHandler(async (req: AuthRequest, res) => {
  const sku = decodeURIComponent(req.params.sku ?? '').trim().toUpperCase();
  if (!sku) badRequest('A barcode / SKU is required');
  const product = await prisma.product.findFirst({ where: { OR: [{ sku: { equals: sku, mode: 'insensitive' } }], isActive: true } });
  if (!product) notFound('No product found for this barcode / SKU');

  const branchId = req.query.branchId as string | undefined;
  const scope = branchScope(req.user!);
  const stock = await prisma.branchProduct.findMany({
    where: { ...scope, productId: product.id, ...(branchId ? { branchId } : {}) },
    include: { branch: { select: { id: true, name: true, code: true } } },
  });
  return ok(res, { product, stock });
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

// Bulk-create products. Expected columns:
// name, sku, price, cost, category, lowStockThreshold, branchCode, quantity
export const importProducts = asyncHandler(async (req: AuthRequest, res) => {
  if (req.user!.role === 'SALES_STAFF') forbidden('Only managers and admins can import products');
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
  const skipped: string[] = [];
  let errors = 0;

  for (const row of rows.slice(1)) {
    const name = row[idx('name')]?.trim();
    const sku = row[idx('sku')]?.trim();
    if (!name || !sku) { errors++; continue; }
    const price = Number(row[idx('price')] ?? 0);
    const cost = Number(row[idx('cost')] ?? 0);
    const category = row[idx('category')]?.trim() || null;
    const lowStockThreshold = Number(row[idx('lowstockthreshold')] ?? 5);

    const existing = await prisma.product.findUnique({ where: { sku } });
    if (existing) { skipped.push(sku); continue; }

    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: { name, sku, category, price: isNaN(price) ? 0 : price, cost: isNaN(cost) ? 0 : cost, lowStockThreshold: isNaN(lowStockThreshold) ? 5 : lowStockThreshold },
      });
      const branchCode = row[idx('branchcode')]?.trim().toUpperCase();
      const qty = Number(row[idx('quantity')] ?? 0);
      if (branchCode && branchByCode.has(branchCode)) {
        const branchId = branchByCode.get(branchCode)!;
        if (req.user!.role !== 'ADMIN' && branchId !== req.user!.branchId) throw forbidden('You can only import stock for your own branch');
        await tx.branchProduct.create({ data: { branchId, productId: p.id, quantity: isNaN(qty) ? 0 : qty } });
      }
      return p;
    });
    createdItems.push({ id: product.id, name: product.name, sku: product.sku });
  }

  await writeAuditLog({ userId: req.user!.id, userEmail: req.user!.email, action: 'PRODUCTS_IMPORTED', details: { created: createdItems.length, skipped: skipped.length, errors } });
  return created(res, { created: createdItems.length, skipped, errors, products: createdItems });
});
