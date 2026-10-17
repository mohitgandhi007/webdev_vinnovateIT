import { z } from 'zod';

export const uuidParamSchema = z.object({
  id: z.string().uuid({ message: 'Parameter must be a valid UUID' })
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['pending', 'healthy', 'degraded', 'failing', 'checking']).optional(),
  is_active: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  sort_by: z.enum(['created_at', 'name', 'status', 'last_checked_at']).default('created_at'),
  order: z.enum(['ASC', 'DESC', 'asc', 'desc']).default('DESC')
});

export const createMonitorSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255, 'Name cannot exceed 255 characters'),
  url: z.string().trim().url('Must be a valid URL format').refine(val => {
    try {
      const parsed = new URL(val);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }, 'Protocol must be http or https'),
  mode: z.enum(['text', 'visual', 'both'], {
    errorMap: () => ({ message: "Mode must be 'text', 'visual', or 'both'" })
  }).default('both'),
  check_cadence: z.enum(['15m', '30m', '1h', '6h', '12h', '24h'], {
    errorMap: () => ({ message: "Interval must be between 15 minutes and 24 hours ('15m', '30m', '1h', '6h', '12h', '24h')" })
  }).default('15m'),
  css_selector: z.string().trim().max(1000).optional().default(''),
  ignored_selectors: z.string().trim().max(2000).optional().default(''),
  ignore_patterns: z.array(z.string()).optional().default([]),
  noise_threshold_percent: z.number().int().min(0).max(100).default(5),
  numeric_selector: z.string().trim().max(1000).optional().nullable(),
  numeric_unit: z.string().trim().max(50).optional().nullable()
});

export const updateMonitorSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  url: z.string().trim().url().refine(val => {
    try {
      const parsed = new URL(val);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }, 'Protocol must be http or https').optional(),
  mode: z.enum(['text', 'visual', 'both']).optional(),
  check_cadence: z.enum(['15m', '30m', '1h', '6h', '12h', '24h']).optional(),
  css_selector: z.string().trim().max(1000).optional(),
  ignored_selectors: z.string().trim().max(2000).optional(),
  ignore_patterns: z.array(z.string()).optional(),
  noise_threshold_percent: z.number().int().min(0).max(100).optional(),
  status: z.enum(['pending', 'healthy', 'degraded', 'failing', 'checking']).optional(),
  is_active: z.boolean().optional(),
  is_reviewed: z.boolean().optional(),
  numeric_selector: z.string().trim().max(1000).optional().nullable(),
  numeric_unit: z.string().trim().max(50).optional().nullable()
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update'
});

export const inspectSelectorSchema = z.object({
  url: z.string().trim().url('A valid URL must be provided for inspection')
});

