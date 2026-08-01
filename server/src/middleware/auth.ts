import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { unauthorized, forbidden } from '../utils/helpers';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  branchId?: string | null;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, branchId: user.branchId ?? null },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as any }
  );
}

export function authenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next(unauthorized('Authentication token required'));

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthUser;
    req.user = { id: payload.id, email: payload.email, name: payload.name, role: payload.role, branchId: payload.branchId ?? null };
    next();
  } catch {
    return next(unauthorized('Invalid or expired token'));
  }
}

export function authorize(...roles: Role[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden('You do not have permission to perform this action'));
    next();
  };
}
