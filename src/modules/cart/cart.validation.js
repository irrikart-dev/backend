import { z } from 'zod';

export const addItemSchema = z.object({
  body: z.object({
    variantId: z.string().min(1),
    quantity: z.number().int().positive().default(1),
  }),
});

export const updateItemQuantitySchema = z.object({
  body: z.object({
    // 0 is rejected here — removing a line goes through DELETE /items/:itemId
    quantity: z.number().int().positive(),
  }),
});
