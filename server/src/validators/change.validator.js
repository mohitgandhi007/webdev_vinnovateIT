import { z } from 'zod';

export const updateChangeReviewSchema = z.object({
  is_reviewed: z.boolean({ required_error: 'is_reviewed must be a boolean' })
});

export const changeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  is_reviewed: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  monitor_id: z.string().uuid().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional()
});

