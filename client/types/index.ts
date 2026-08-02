export type Role = "ADMIN" | "BRANCH_MANAGER" | "SALES_STAFF" | "AUDITOR";

export type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL_SENT" | "NEGOTIATION" | "WON" | "LOST";
export type LeadSource = "REFERRAL" | "WEBSITE" | "SOCIAL_MEDIA" | "WALK_IN" | "CALL" | "OTHER";
export type CustomerSegment = "VIP" | "REGULAR" | "INACTIVE" | "NEW";
export type PaymentMethod = "CASH" | "CARD" | "MOBILE_MONEY" | "CREDIT";
export type PaymentStatus = "PAID" | "PARTIAL" | "UNPAID";
export type ExpenseCategory = "RENT" | "SALARIES" | "UTILITIES" | "SUPPLIES" | "MARKETING" | "MAINTENANCE" | "TRANSPORT" | "OTHER";
export type ShiftStatus = "OPEN" | "CLOSED";
export type CampaignType = "BIRTHDAY" | "ANNIVERSARY" | "INACTIVE" | "CUSTOM";
export type CampaignStatus = "DRAFT" | "SCHEDULED" | "SENT";
export type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type FollowUpType = "CALL" | "MEETING" | "EMAIL" | "REMINDER";
export type FollowUpStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";
export type TransferStatus = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
export type ReturnStatus = "PENDING" | "APPROVED" | "REJECTED";
export type SaleStatus = "COMPLETED" | "REFUNDED" | "VOID";
export type NotificationType = "FOLLOW_UP" | "LEAD_ASSIGNED" | "DEAL_STATUS" | "TASK_OVERDUE" | "LOW_STOCK" | "RETURN" | "TRANSFER" | "SALES";
export type LoyaltyTier = "BRONZE" | "SILVER" | "GOLD";

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  isActive: boolean;
  createdAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string | null;
  avatarUrl?: string | null;
  branchId?: string | null;
  branch?: { id: string; name: string; code: string } | null;
  isActive?: boolean;
  emailVerified?: boolean;
  createdAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  address?: string | null;
  notes?: string | null;
  segment: CustomerSegment;
  birthday?: string | null;
  anniversary?: string | null;
  points?: number;
  totalPointsEarned?: number;
  tier?: LoyaltyTier;
  creditLimit?: number;
  creditBalance?: number;
  creditAvailable?: number;
  preferredBranchId?: string | null;
  preferredBranch?: { id: string; name: string; code: string } | null;
  createdAt: string;
  lifetimeValue?: number;
  purchaseCount?: number;
}

export interface Lead {
  id: string;
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  source: LeadSource;
  status: LeadStatus;
  value: number;
  notes?: string | null;
  assignedToId?: string | null;
  assignedTo?: { id: string; name: string } | null;
  branchId?: string | null;
  branch?: { id: string; name: string; code: string } | null;
  convertedCustomerId?: string | null;
  createdAt: string;
}

export interface Opportunity {
  id: string;
  name: string;
  stage: LeadStatus;
  value: number;
  expectedCloseDate?: string | null;
  probability: number;
  customerId?: string | null;
  customer?: { name: string } | null;
  leadId?: string | null;
  lead?: { name: string; phone?: string | null } | null;
  ownerId?: string | null;
  owner?: { name: string } | null;
  wonAt?: string | null;
}

export interface SaleItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  invoiceNo: string;
  branchId: string;
  branch?: { id: string; name: string; code: string } | null;
  userId?: string | null;
  user?: { id: string; name: string } | null;
  customerId?: string | null;
  customer?: { id: string; name: string; phone?: string | null; email?: string | null; points?: number } | null;
  paymentMethod: PaymentMethod;
  paymentStatus?: PaymentStatus;
  amountPaid?: number;
  creditUsed?: number;
  currency?: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  pointsEarned?: number;
  pointsRedeemed?: number;
  pointsDiscount?: number;
  status: SaleStatus;
  notes?: string | null;
  pending?: boolean;
  items: SaleItem[];
  createdAt: string;
  returns?: { id: string; status: ReturnStatus }[];
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category?: string | null;
  description?: string | null;
  price: number;
  cost: number;
  lowStockThreshold: number;
  quantity?: number;
  branchStock?: { branchId: string; quantity: number; branch: { id: string; name: string; code: string } }[];
}

export interface StockTransfer {
  id: string;
  productId: string;
  product?: { id: string; name: string; sku: string };
  fromBranchId: string;
  toBranchId: string;
  fromBranch?: { id: string; name: string; code: string };
  toBranch?: { id: string; name: string; code: string };
  quantity: number;
  status: TransferStatus;
  requestedBy?: { name: string } | null;
  approvedBy?: { name: string } | null;
  note?: string | null;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
  assigneeId?: string | null;
  assignee?: { id: string; name: string } | null;
  createdAt: string;
}

export interface FollowUp {
  id: string;
  type: FollowUpType;
  subject: string;
  notes?: string | null;
  scheduledAt: string;
  status: FollowUpStatus;
  customerId?: string | null;
  customer?: { id: string; name: string; phone?: string | null; email?: string | null; points?: number } | null;
  leadId?: string | null;
  lead?: { id: string; name: string; phone?: string | null } | null;
  assigneeId?: string | null;
  assignee?: { id: string; name: string } | null;
  createdAt: string;
}

export interface Return {
  id: string;
  saleId: string;
  sale?: { invoiceNo: string; items: SaleItem[] };
  branchId: string;
  branch?: { name: string; code: string } | null;
  userId?: string | null;
  user?: { name: string } | null;
  approvedBy?: { name: string } | null;
  amount: number;
  reason: string;
  status: ReturnStatus;
  createdAt: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface Interaction {
  id: string;
  type: "CALL" | "EMAIL" | "MEETING" | "NOTE" | "WHATSAPP";
  subject?: string | null;
  notes: string;
  date: string;
  customerId?: string | null;
  leadId?: string | null;
  userId?: string | null;
  user?: { name: string } | null;
}

export interface Expense {
  id: string;
  branchId: string;
  branch?: { id: string; name: string; code: string } | null;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expenseDate: string;
  createdBy?: { name: string } | null;
  createdAt: string;
}

export interface CustomerPayment {
  id: string;
  customerId: string;
  branchId: string;
  branch?: { id: string; name: string; code: string } | null;
  amount: number;
  method: PaymentMethod;
  note?: string | null;
  createdBy?: { name: string } | null;
  createdAt: string;
}

export interface Shift {
  id: string;
  userId: string;
  user?: { id: string; name: string } | null;
  branchId: string;
  branch?: { id: string; name: string; code: string } | null;
  clockIn: string;
  clockOut?: string | null;
  openingCash: number;
  closingCash?: number | null;
  expectedCash?: number | null;
  variance?: number | null;
  notes?: string | null;
  status: ShiftStatus;
}

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  channel: "EMAIL" | "SMS" | "WHATSAPP" | "IN_APP";
  message: string;
  scheduledAt?: string | null;
  sentAt?: string | null;
  branch?: { id: string; name: string; code: string } | null;
  createdBy?: { name: string } | null;
  createdAt: string;
  recipients?: { id: string; status: string; customer?: { name: string } | null }[];
  _count?: { recipients: number };
}

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  RENT: "Rent",
  SALARIES: "Salaries",
  UTILITIES: "Utilities",
  SUPPLIES: "Supplies",
  MARKETING: "Marketing",
  MAINTENANCE: "Maintenance",
  TRANSPORT: "Transport",
  OTHER: "Other",
};

export interface DashboardData {
  kpis: {
    todayRevenue: number;
    todayTransactions: number;
    monthRevenue: number;
    monthCount: number;
    totalCustomers: number;
    totalLeads: number;
    openLeads: number;
    wonLeads: number;
    lostLeads: number;
    branchCount: number;
    avgOrderValue: number;
  };
  topBranch: { name: string; code: string } | null;
  branchComparison: {
    id: string;
    name: string;
    code: string;
    todayRevenue: number;
    todayTransactions: number;
    monthRevenue: number;
    monthTransactions: number;
    totalSales: number;
    lowStockCount: number;
  }[];
  lowStock: {
    branchId: string;
    branch: { id: string; name: string; code: string };
    product: Product;
    quantity: number;
    status: "LOW" | "OUT_OF_STOCK";
  }[];
  revenueTrend: { date: string; revenue: number; transactions: number }[];
  recentSales: {
    id: string;
    invoiceNo: string;
    total: number;
    paymentMethod: PaymentMethod;
    branch: { name: string; code: string };
    customer?: { name: string } | null;
    user?: { name: string } | null;
    createdAt: string;
    itemCount: number;
  }[];
  activityFeed: { id: string; action: string; userEmail: string | null; createdAt: string }[];
  upcomingFollowUps: FollowUp[];
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  error?: { code: string; message: string; details?: unknown };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export const LEAD_STAGES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"];

export const STAGE_LABELS: Record<LeadStatus, string> = {
  NEW: "New Lead",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  PROPOSAL_SENT: "Proposal Sent",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Owner",
  BRANCH_MANAGER: "Branch Manager",
  SALES_STAFF: "Sales Staff",
  AUDITOR: "Auditor (read-only)",
};

export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  VIP: "VIP",
  REGULAR: "Regular",
  INACTIVE: "Inactive",
  NEW: "New",
};
