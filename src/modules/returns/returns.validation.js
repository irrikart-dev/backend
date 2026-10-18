import { z } from 'zod';
import env from '../../config/env.js';

// photos must be ones this API issued (POST /returns/photos) — staff open them, so
// an arbitrary third-party URL would be a tracking/phishing vector
const OWN_PHOTO_PREFIX = `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_STORAGE_BUCKET}/returns/`;

export const createReturnSchema = z.object({
  body: z.object({
    orderId: z.string().min(1),
    type: z.enum(['RETURN', 'REPLACE']).default('RETURN'),
    reason: z.string().trim().min(3).max(200),
    details: z.string().trim().max(2000).optional(),
    photoUrls: z
      .array(z.string().refine((u) => u.startsWith(OWN_PHOTO_PREFIX), 'Upload photos with POST /returns/photos'))
      .max(5)
      .default([]),
    // omit to return everything still returnable on the order
    items: z
      .array(z.object({ orderItemId: z.string().min(1), quantity: z.number().int().min(1) }))
      .min(1)
      .optional(),
  }),
});

export const listReturnsQuerySchema = z.object({
  query: z.object({
    status: z.enum(['REQUESTED', 'APPROVED', 'COMPLETED', 'REJECTED']).optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
  }),
});

export const approveReturnSchema = z.object({
  body: z.object({ note: z.string().trim().max(1000).optional() }),
});

export const rejectReturnSchema = z.object({
  body: z.object({ note: z.string().trim().min(3).max(1000) }),
});

export const completeReturnSchema = z.object({
  body: z.object({
    restock: z.boolean().default(true),
    note: z.string().trim().max(1000).optional(),
  }),
});
