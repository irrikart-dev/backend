import { z } from 'zod';

export const listProductsSchema = z.object({
  query: z.object({
    category: z.string().min(1).optional(),
    search: z.string().min(1).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});
