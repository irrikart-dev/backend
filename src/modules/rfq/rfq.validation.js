import { z } from 'zod';

const RFQ_STATUS = z.enum(['NEW', 'CONTACTED', 'CLOSED']);

export const createRfqSchema = z.object({
  body: z
    .object({
      productId: z.string().min(1).optional(),
      quantity: z.number().int().min(1).max(100000),
      requirements: z.string().trim().max(2000).optional(),
      targetPrice: z.number().positive().optional(),
    })
    // a request with neither has nothing for staff to quote on
    .refine((b) => b.productId || b.requirements, {
      message: 'Pick a product or describe what you need',
      path: ['requirements'],
    }),
});

export const listRfqQuerySchema = z.object({
  query: z.object({
    status: RFQ_STATUS.optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
  }),
});

export const updateRfqSchema = z.object({
  body: z.object({
    status: RFQ_STATUS.optional(),
    adminNote: z.string().trim().max(2000).nullable().optional(),
  }),
});
