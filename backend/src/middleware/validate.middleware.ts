import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Zod-based request body validation middleware.
 * On failure returns 400 with flattened Zod errors.
 * On success replaces req.body with the parsed (and typed) data.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error.flatten(),
      });
      return;
    }

    req.body = result.data;
    next();
  };
}
