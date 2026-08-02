import type { Role } from '@prisma/client';

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, message: string, code = 'BAD_REQUEST', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function ok<T>(res: any, data: T, message?: string) {
  return res.status(200).json({ success: true, message, data });
}

export function created<T>(res: any, data: T, message?: string) {
  return res.status(201).json({ success: true, message, data });
}

export function notFound(message = 'Resource not found'): never {
  throw new ApiError(404, message, 'NOT_FOUND');
}

export function badRequest(message: string, details?: unknown): never {
  throw new ApiError(400, message, 'BAD_REQUEST', details);
}

export function unauthorized(message = 'Unauthorized'): never {
  throw new ApiError(401, message, 'UNAUTHORIZED');
}

export function forbidden(message = 'Forbidden'): never {
  throw new ApiError(403, message, 'FORBIDDEN');
}

// Async wrapper so thrown errors reach the error middleware
export const asyncHandler =
  (fn: (req: any, res: any, next: any) => Promise<any>) =>
  (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export function getPagination(query: any, defaults = { page: 1, pageSize: 20 }) {
  const page = Math.max(Number(query?.page ?? defaults.page), 1);
  const pageSize = Math.min(Math.max(Number(query?.pageSize ?? defaults.pageSize), 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

// RBAC: returns the list of branch ids a user may access.
// Admin/Auditor => null means all branches. Manager/Staff => their own branch only.
export function accessibleBranches(user: { role: Role; branchId?: string | null }) {
  if (user.role === 'ADMIN' || user.role === 'AUDITOR') return null;
  if (!user.branchId) throw forbidden('No branch assigned to this account');
  return [user.branchId];
}

export function assertBranchAllowed(user: { role: Role; branchId?: string | null }, branchId?: string | null) {
  if (user.role === 'ADMIN' || user.role === 'AUDITOR') return;
  if (!branchId) throw forbidden('A branch is required for this action');
  if (branchId !== user.branchId) throw forbidden('You do not have access to this branch');
}

// Build a Prisma where-clause restricting data to the user's accessible branches.
export function branchScope(user: { role: Role; branchId?: string | null }, field = 'branchId') {
  const allowed = accessibleBranches(user);
  return allowed ? { [field]: { in: allowed } } : {};
}

export function generateInvoiceNo(): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${stamp}-${rand}`;
}

export function todayRange(offsetDays = 0) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - offsetDays);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}
