import { z } from 'zod';

export const checkoutSchema = z.object({
  body: z.object({
    addressId: z.string().min(1),
    couponCode: z.string().trim().min(1).max(40).optional(),
    paymentMethod: z.enum(['ONLINE', 'COD']).default('ONLINE'),
  }),
});

export const cancelOrderSchema = z.object({
  body: z.object({ reason: z.string().trim().min(3).max(500) }),
});

// vendors pack and ship; DELIVERED is admin-only (admin.validation.js orderStatusSchema)
export const vendorOrderStatusSchema = z.object({
  body: z.object({ status: z.enum(['PACKED', 'SHIPPED']) }),
});
