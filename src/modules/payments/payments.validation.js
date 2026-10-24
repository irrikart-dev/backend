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

export const listRefundsQuerySchema = z.object({
  query: z.object({
    status: z.enum(['pending', 'processed', 'failed']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
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
