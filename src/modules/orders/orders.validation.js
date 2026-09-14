import { z } from 'zod';

export const checkoutSchema = z.object({
  body: z.object({
    couponCode: z.string().trim().min(1).max(40).optional(),
  }),
});
