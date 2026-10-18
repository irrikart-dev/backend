import { z } from 'zod';

export const verifyPaymentSchema = z.object({
  body: z.object({
    // our own order id, from POST /orders/checkout
    orderId: z.string().min(1),
    // the two values the client SDK hands back on success
    providerPaymentId: z.string().min(1),
    signature: z.string().min(1),
  }),
});


export const manualRefundSchema = z.object({
  body: z.object({
    orderId: z.string().min(1),
    // whole rupees; omit to refund everything still refundable
    amount: z.number().int().positive().optional(),
    reason: z.string().trim().min(3).max(200),
  }),
});
