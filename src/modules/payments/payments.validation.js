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
