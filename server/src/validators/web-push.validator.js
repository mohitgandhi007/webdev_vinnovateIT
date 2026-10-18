import { z } from 'zod';

export function validateWebPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    const isHttps = url.protocol === 'https:';
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (!isHttps && !isLocalhost) {
      return { valid: false, reason: 'Push subscription endpoint must use HTTPS (or HTTP for localhost)' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Endpoint must be a valid absolute URL' };
  }
}

export const webPushPreferencesSchema = z.object({
  notify_on_change: z.boolean().default(true),
  notify_on_failure: z.boolean().default(false),
  importance: z.enum(['all', 'high']).default('all')
}).default({});

export const subscribeWebPushSchema = z.preprocess((val) => {
  if (val && typeof val === 'object' && val.subscription) {
    return {
      endpoint: val.subscription.endpoint,
      keys: val.subscription.keys,
      preferences: val.preferences ?? val.subscription.preferences,
      userAgent: val.userAgent ?? val.subscription.userAgent
    };
  }
  return val;
}, z.object({
  endpoint: z.string().trim().min(10, 'Endpoint is required and must be a valid URL'),
  keys: z.object({
    p256dh: z.string().trim().min(5, 'p256dh public key is required'),
    auth: z.string().trim().min(3, 'auth secret is required')
  }),
  preferences: webPushPreferencesSchema.optional(),
  userAgent: z.string().optional()
})).superRefine((data, ctx) => {
  const check = validateWebPushEndpoint(data.endpoint);
  if (!check.valid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: check.reason,
      path: ['endpoint']
    });
  }
});

export const unsubscribeWebPushSchema = z.object({
  endpoint: z.string().trim().optional(),
  id: z.string().uuid().optional()
}).refine(data => Boolean(data.endpoint || data.id), {
  message: 'Either endpoint or subscription id is required'
});

export const updateWebPushPreferencesSchema = z.object({
  id: z.string().uuid('Valid subscription UUID required'),
  preferences: webPushPreferencesSchema
});
