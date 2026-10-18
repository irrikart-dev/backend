import { z } from 'zod';

export const listWalletRefundsQuerySchema = z.object({
  query: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
  }),
});
