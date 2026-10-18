import { z } from 'zod';

export const deviceSchema = z.object({
  body: z.object({
    fcmToken: z.string().min(20).max(4096),
    platform: z.enum(['android', 'ios', 'web']),
  }),
});

export const removeDeviceSchema = z.object({
  body: z.object({ fcmToken: z.string().min(1).max(4096) }),
});

export const listNotificationsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
  }),
});

// FCM shows ~65 chars of title and ~240 of body before truncating on most phones
export const campaignSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1).max(65),
    body: z.string().trim().min(1).max(240),
    link: z.string().trim().max(300).optional(),
  }),
});
