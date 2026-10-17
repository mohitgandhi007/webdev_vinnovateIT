import { z } from 'zod';

export const ALLOWED_CHANNELS = ['email', 'telegram', 'discord'];

// Strict SSRF defense for Discord webhooks
export function validateDiscordWebhookUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Discord webhook must use secure HTTPS protocol' };
    }
    const host = parsed.hostname.toLowerCase();
    if (host !== 'discord.com' && host !== 'discordapp.com' && !host.endsWith('.discord.com')) {
      return { valid: false, reason: 'Discord webhook URL must be hosted on discord.com or discordapp.com' };
    }
    if (!/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/.test(parsed.pathname)) {
      return { valid: false, reason: 'Invalid Discord webhook URL path format' };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'Malformed webhook URL' };
  }
}

// Telegram chat ID validation
export function validateTelegramChatId(chatId) {
  const str = String(chatId).trim();
  if (!/^-?\d{5,20}$/.test(str)) {
    return { valid: false, reason: 'Telegram Chat ID must be a 5 to 20 digit integer (may include negative sign for channels/groups)' };
  }
  return { valid: true };
}

// Email validation
export function validateEmailAddress(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(String(email).trim())) {
    return { valid: false, reason: 'Invalid email address format' };
  }
  return { valid: true };
}

export const destinationTriggersSchema = z.object({
  on_change: z.boolean().default(true),
  on_high_importance: z.boolean().default(false),
  on_failure: z.boolean().default(false),
  keywords: z.array(z.string().trim()).default([])
}).default({});

export const createDestinationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  channel: z.enum(['email', 'telegram', 'discord'], {
    errorMap: () => ({ message: 'Channel must be one of: email, telegram, discord' })
  }),
  target_destination: z.string().trim().min(1, 'Target destination is required'),
  config: z.record(z.any()).default({}),
  triggers: destinationTriggersSchema,
  is_active: z.boolean().default(true)
}).superRefine((data, ctx) => {
  if (data.channel === 'discord') {
    const check = validateDiscordWebhookUrl(data.target_destination);
    if (!check.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target_destination'],
        message: check.reason
      });
    }
  } else if (data.channel === 'telegram') {
    const check = validateTelegramChatId(data.target_destination);
    if (!check.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target_destination'],
        message: check.reason
      });
    }
  } else if (data.channel === 'email') {
    const check = validateEmailAddress(data.target_destination);
    if (!check.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['target_destination'],
        message: check.reason
      });
    }
  }
});

export const updateDestinationSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  target_destination: z.string().trim().min(1).optional(),
  config: z.record(z.any()).optional(),
  triggers: destinationTriggersSchema.optional(),
  is_active: z.boolean().optional()
}).superRefine((data, ctx) => {
  // If target_destination is being updated, channel would be checked in service layer against existing record
});
