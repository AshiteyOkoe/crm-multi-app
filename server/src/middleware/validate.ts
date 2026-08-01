import { ZodError, type ZodSchema } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/helpers';

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
        next(new ApiError(400, 'Validation failed', 'VALIDATION_ERROR', details));
      } else {
        next(err);
      }
    }
  };
}
