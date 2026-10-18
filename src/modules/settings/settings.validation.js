import { z } from 'zod';

export const shippingRulesSchema = z.object({
  body: z.object({
    freeShippingAbove: z.number().int().min(0).nullable(),
    shippingSlabs: z
      .array(z.object({ upToKg: z.number().positive().max(1000), fee: z.number().int().min(0).max(100000) }))
      .max(20)
      .refine((slabs) => new Set(slabs.map((s) => s.upToKg)).size === slabs.length, 'Two slabs share the same weight'),
  }),
});
