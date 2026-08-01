import { PrismaClient, Role, LeadStatus, LeadSource, CustomerSegment, PaymentMethod, SaleStatus, TaskStatus, TaskPriority, FollowUpType, FollowUpStatus, NotificationType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const passwordHash = await bcrypt.hash('password123', 10);

  // ---------- Branches ----------
  const branch1 = await prisma.branch.upsert({
    where: { code: 'B1' },
    update: {},
    create: { name: 'Branch 1 — Accra Central', code: 'B1', address: '12 Market Road, Accra Central', phone: '+233 20 000 0001' },
  });
  const branch2 = await prisma.branch.upsert({
    where: { code: 'B2' },
    update: {},
    create: { name: 'Branch 2 — Osu', code: 'B2', address: '5 Oxford Street, Osu, Accra', phone: '+233 20 000 0002' },
  });
  const branch3 = await prisma.branch.upsert({
    where: { code: 'B3' },
    update: {},
    create: { name: 'Branch 3 — Tema', code: 'B3', address: '22 Community 1 Road, Tema', phone: '+233 20 000 0003' },
  });

  // ---------- Users ----------
  const admin = await prisma.user.upsert({
    where: { email: 'owner@crm.app' },
    update: {},
    create: { name: 'Kwame Asante', email: 'owner@crm.app', passwordHash, phone: '+233 24 000 0000', role: Role.ADMIN },
  });
  const mgr1 = await prisma.user.upsert({
    where: { email: 'manager1@crm.app' },
    update: {},
    create: { name: 'Ama Mensah', email: 'manager1@crm.app', passwordHash, phone: '+233 24 111 1111', role: Role.BRANCH_MANAGER, branchId: branch1.id },
  });
  const mgr2 = await prisma.user.upsert({
    where: { email: 'manager2@crm.app' },
    update: {},
    create: { name: 'Kofi Boateng', email: 'manager2@crm.app', passwordHash, phone: '+233 24 222 2222', role: Role.BRANCH_MANAGER, branchId: branch2.id },
  });
  const staff1 = await prisma.user.upsert({
    where: { email: 'cashier1@crm.app' },
    update: {},
    create: { name: 'Efua Owusu', email: 'cashier1@crm.app', passwordHash, phone: '+233 24 333 3333', role: Role.SALES_STAFF, branchId: branch1.id },
  });
  const staff2 = await prisma.user.upsert({
    where: { email: 'cashier2@crm.app' },
    update: {},
    create: { name: 'Yaw Adjei', email: 'cashier2@crm.app', passwordHash, phone: '+233 24 444 4444', role: Role.SALES_STAFF, branchId: branch3.id },
  });

  // ---------- Products ----------
  const productsData = [
    { name: 'Smartphone X10', sku: 'PHN-X10', category: 'Phones', price: 2499, cost: 2100, lowStockThreshold: 5 },
    { name: 'Wireless Earbuds', sku: 'AUD-EBUDS', category: 'Audio', price: 450, cost: 320, lowStockThreshold: 8 },
    { name: 'Smart Watch', sku: 'WCH-100', category: 'Wearables', price: 1200, cost: 950, lowStockThreshold: 4 },
    { name: 'Laptop Bag', sku: 'BAG-LAP', category: 'Accessories', price: 300, cost: 200, lowStockThreshold: 6 },
    { name: 'Bluetooth Speaker', sku: 'AUD-SPK', category: 'Audio', price: 650, cost: 480, lowStockThreshold: 5 },
    { name: 'Power Bank 20k', sku: 'CHG-PB20', category: 'Chargers', price: 220, cost: 150, lowStockThreshold: 10 },
    { name: 'USB-C Cable', sku: 'CHG-CBL', category: 'Chargers', price: 45, cost: 25, lowStockThreshold: 20 },
    { name: 'Laptop Stand', sku: 'ACC-STND', category: 'Accessories', price: 180, cost: 120, lowStockThreshold: 6 },
  ];

  const products: Record<string, any> = {};
  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: p,
    });
    products[p.sku] = product;
  }

  // ---------- Branch stock ----------
  const stockPlan: Array<[string, Record<string, number>]> = [
    [branch1.id, { 'PHN-X10': 12, 'AUD-EBUDS': 20, 'WCH-100': 4, 'BAG-LAP': 15, 'AUD-SPK': 6, 'CHG-PB20': 30, 'CHG-CBL': 60, 'ACC-STND': 9 }],
    [branch2.id, { 'PHN-X10': 3, 'AUD-EBUDS': 8, 'WCH-100': 9, 'BAG-LAP': 7, 'AUD-SPK': 2, 'CHG-PB20': 18, 'CHG-CBL': 45, 'ACC-STND': 12 }],
    [branch3.id, { 'PHN-X10': 8, 'AUD-EBUDS': 15, 'WCH-100': 6, 'BAG-LAP': 10, 'AUD-SPK': 12, 'CHG-PB20': 25, 'CHG-CBL': 40, 'ACC-STND': 15 }],
  ];
  for (const [branchId, plan] of stockPlan) {
    for (const [sku, qty] of Object.entries(plan)) {
      await prisma.branchProduct.upsert({
        where: { branchId_productId: { branchId, productId: products[sku].id } },
        update: { quantity: qty },
        create: { branchId, productId: products[sku].id, quantity: qty },
      });
    }
  }

  // ---------- Customers ----------
  const customerData = [
    { name: 'Adjoa Nyarko', phone: '+233 24 555 0001', email: 'adjoa@gmail.com', company: 'Nyarko Trading', segment: CustomerSegment.VIP, preferredBranchId: branch1.id, birthday: new Date('1990-03-15') },
    { name: 'Samuel Osei', phone: '+233 24 555 0002', email: 'samuel@yahoo.com', company: 'Osei Logistics', segment: CustomerSegment.REGULAR, preferredBranchId: branch2.id, birthday: new Date('1985-07-22') },
    { name: 'Grace Addo', phone: '+233 24 555 0003', email: 'grace.addo@outlook.com', segment: CustomerSegment.NEW, preferredBranchId: branch1.id, birthday: new Date('1992-11-02') },
    { name: 'Ibrahim Musa', phone: '+233 24 555 0004', email: 'ibrahim@gmail.com', company: 'Musa Ventures', segment: CustomerSegment.VIP, preferredBranchId: branch3.id, birthday: new Date('1988-01-30') },
    { name: 'Linda Quartey', phone: '+233 24 555 0005', email: 'linda.q@gmail.com', segment: CustomerSegment.REGULAR, preferredBranchId: branch2.id, birthday: new Date('1995-05-18') },
    { name: 'Michael Tetteh', phone: '+233 24 555 0006', email: 'mike.t@gmail.com', company: 'Tetteh Media', segment: CustomerSegment.INACTIVE, preferredBranchId: branch1.id },
    { name: 'Abena Sarpong', phone: '+233 24 555 0007', email: 'abena@gmail.com', segment: CustomerSegment.REGULAR, preferredBranchId: branch3.id, birthday: new Date('1993-09-09') },
    { name: 'Kweku Anane', phone: '+233 24 555 0008', email: 'kweku.a@gmail.com', company: 'Anane Farms', segment: CustomerSegment.NEW, preferredBranchId: branch2.id },
  ];

  const customers: Record<string, any> = {};
  for (const c of customerData) {
    const existing = await prisma.customer.findFirst({ where: { phone: c.phone } });
    const customer = existing ?? (await prisma.customer.create({ data: { ...c, createdById: admin.id } }));
    customers[c.phone] = customer;
  }

  // ---------- Leads ----------
  const leadsData = [
    { name: 'John Smith', company: 'ABC Ltd', email: 'john@example.com', phone: '+233 20 111 2001', source: LeadSource.WEBSITE, status: LeadStatus.NEW, assignedToId: staff1.id, branchId: branch1.id, value: 5000 },
    { name: 'Mary Darko', company: 'Darko Stores', email: 'mary@darko.com', phone: '+233 20 111 2002', source: LeadSource.REFERRAL, status: LeadStatus.CONTACTED, assignedToId: mgr2.id, branchId: branch2.id, value: 8000 },
    { name: 'Peter Asamoah', company: 'Asamoah Group', email: 'peter@asamoah.com', phone: '+233 20 111 2003', source: LeadSource.SOCIAL_MEDIA, status: LeadStatus.QUALIFIED, assignedToId: staff2.id, branchId: branch3.id, value: 12000 },
    { name: 'Janet Coleman', company: 'JC Fashion', email: 'janet@jcfashion.com', phone: '+233 20 111 2004', source: LeadSource.WALK_IN, status: LeadStatus.PROPOSAL_SENT, assignedToId: mgr1.id, branchId: branch1.id, value: 15000 },
    { name: 'Richard Baah', company: 'Baah Electronics', email: 'richard@baah.com', phone: '+233 20 111 2005', source: LeadSource.CALL, status: LeadStatus.NEGOTIATION, assignedToId: mgr2.id, branchId: branch2.id, value: 20000 },
    { name: 'Theresa Owusu', company: 'TO Solutions', email: 'theresa@tosolutions.com', phone: '+233 20 111 2006', source: LeadSource.WEBSITE, status: LeadStatus.WON, assignedToId: staff2.id, branchId: branch3.id, value: 9500, wonAt: new Date() },
    { name: 'Ben Agyeman', company: 'Agyeman Co', email: 'ben@agyeman.com', phone: '+233 20 111 2007', source: LeadSource.OTHER, status: LeadStatus.LOST, assignedToId: staff1.id, branchId: branch1.id, value: 4000, lostAt: new Date() },
  ];

  for (const l of leadsData) {
    const existing = await prisma.lead.findFirst({ where: { phone: l.phone } });
    if (existing) continue;
    const { assignedToId, ...rest } = l;
    const lead = await prisma.lead.create({ data: { ...rest, assignedToId: assignedToId ?? admin.id, createdById: admin.id } });
    await prisma.opportunity.create({
      data: { name: l.name, stage: l.status, value: l.value, leadId: lead.id, ownerId: assignedToId ?? admin.id },
    });
  }

  // ---------- Sales (30 days of history across branches) ----------
  const now = new Date();
  let seq = 1;
  for (let day = 0; day < 30; day++) {
    const date = new Date(now);
    date.setDate(date.getDate() - day);
    date.setHours(10 + (seq % 8), (seq * 7) % 60, 0, 0);
    const branch = seq % 3 === 0 ? branch1 : seq % 3 === 1 ? branch2 : branch3;
    const cashier = branch === branch1 ? staff1 : branch === branch2 ? staff2 : staff1;
    const customerPhones = Object.keys(customers);
    const customer = customers[customerPhones[seq % customerPhones.length]];
    const skus = ['PHN-X10', 'AUD-EBUDS', 'WCH-100', 'BAG-LAP', 'AUD-SPK', 'CHG-PB20', 'CHG-CBL'];
    const sku = skus[seq % skus.length];
    const product = products[sku];
    const qty = 1 + (seq % 3);
    const lineTotal = product.price * qty;
    const paymentMethods = [PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.MOBILE_MONEY];
    const invoiceNo = `INV-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}-${String(seq).padStart(4, '0')}`;
    const existing = await prisma.sale.findUnique({ where: { invoiceNo } });
    if (!existing) {
      const sale = await prisma.sale.create({
        data: {
          invoiceNo,
          branchId: branch.id,
          userId: cashier.id,
          customerId: customer?.id,
          paymentMethod: paymentMethods[seq % 3],
          subtotal: lineTotal,
          discount: 0,
          tax: 0,
          total: lineTotal,
          status: SaleStatus.COMPLETED,
          createdAt: date,
          items: {
            create: [{ productId: product.id, productName: product.name, quantity: qty, unitPrice: product.price, lineTotal }],
          },
        },
      });
      // ensure consistent stock history
      const bp = await prisma.branchProduct.findUnique({
        where: { branchId_productId: { branchId: branch.id, productId: product.id } },
      });
      if (bp && bp.quantity > 0) {
        await prisma.branchProduct.update({
          where: { branchId_productId: { branchId: branch.id, productId: product.id } },
          data: { quantity: Math.max(bp.quantity - qty, 0) },
        });
      }
      void sale;
    }
    seq++;
  }

  // ---------- Tasks & Follow-ups ----------
  const followUp1 = await prisma.followUp.create({
    data: {
      type: FollowUpType.CALL,
      subject: 'Follow-up on proposal',
      scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 5),
      status: FollowUpStatus.SCHEDULED,
      leadId: (await prisma.lead.findFirst({ where: { status: LeadStatus.PROPOSAL_SENT } }))?.id,
      assigneeId: mgr1.id,
      createdById: admin.id,
    },
  });
  await prisma.followUp.create({
    data: {
      type: FollowUpType.MEETING,
      subject: 'Product demo meeting',
      scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 26),
      status: FollowUpStatus.SCHEDULED,
      customerId: customers['+233 24 555 0001']?.id,
      assigneeId: staff1.id,
      createdById: admin.id,
    },
  });

  const task = await prisma.task.create({
    data: {
      title: 'Send proposal to Janet Coleman',
      description: 'Email the finalized proposal for the bulk phone order.',
      status: TaskStatus.PENDING,
      priority: TaskPriority.HIGH,
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24),
      assigneeId: mgr1.id,
      createdById: admin.id,
      relatedType: 'LEAD',
      relatedId: (await prisma.lead.findFirst({ where: { status: LeadStatus.PROPOSAL_SENT } }))?.id,
    },
  });
  void task;

  await prisma.task.create({
    data: {
      title: 'Restock power banks',
      description: 'Order more 20k power banks for Branch 2.',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.MEDIUM,
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 48),
      assigneeId: mgr2.id,
      createdById: admin.id,
    },
  });

  // ---------- Notifications ----------
  await prisma.notification.createMany({
    data: [
      { userId: admin.id, type: NotificationType.LOW_STOCK, title: 'Low stock alert', message: 'Smart Watch is low in Branch 2 (3 remaining).', link: '/inventory' },
      { userId: admin.id, type: NotificationType.FOLLOW_UP, title: 'Upcoming follow-up', message: `Follow-up "${followUp1.subject}" is scheduled soon.`, link: '/leads' },
    ],
    skipDuplicates: true,
  });

  // ---------- App settings ----------
  const settings: Array<[string, string]> = [
    ['businessName', 'Asante Retail Group'],
    ['currency', 'GHS'],
    ['lowStockAlertEnabled', 'true'],
  ];
  for (const [key, value] of settings) {
    await prisma.appSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  console.log('Seed complete!');
  console.log('----------------------------------------------');
  console.log('Login credentials:');
  console.log('  Owner (Super Admin): owner@crm.app / password123');
  console.log('  Branch Manager 1:    manager1@crm.app / password123');
  console.log('  Branch Manager 2:    manager2@crm.app / password123');
  console.log('  Cashier 1:           cashier1@crm.app / password123');
  console.log('  Cashier 2:           cashier2@crm.app / password123');
  console.log('----------------------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
