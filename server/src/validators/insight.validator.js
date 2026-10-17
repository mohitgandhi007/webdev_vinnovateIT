import { z } from 'zod';

export const VALID_CATEGORIES = [
  'pricing',
  'content',
  'announcement',
  'policy',
  'availability',
  'design',
  'other'
];

export const VALID_IMPORTANCE = ['low', 'medium', 'high'];

export const ALLOWED_INSIGHT_CATEGORIES = VALID_CATEGORIES;
export const ALLOWED_INSIGHT_IMPORTANCE = VALID_IMPORTANCE;

export const evidenceItemSchema = z.object({
  description: z.string().trim().min(1, 'Evidence description required'),
  source: z.string().trim().default('detected_text_difference')
});

export const aiInsightOutputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
  summary: z.string().trim().min(1, 'Summary is required'),
  category: z.string().toLowerCase().refine(val => VALID_CATEGORIES.includes(val), {
    message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}`
  }),
  importance: z.string().toLowerCase().refine(val => VALID_IMPORTANCE.includes(val), {
    message: `Importance must be one of: ${VALID_IMPORTANCE.join(', ')}`
  }),
  evidence: z.array(evidenceItemSchema).default([])
});

export const insightQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  monitor_id: z.string().uuid().optional(),
  category: z.string().optional(),
  importance: z.enum(['low', 'medium', 'high']).optional()
});
