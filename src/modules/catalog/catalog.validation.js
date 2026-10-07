import { z } from 'zod';

// query strings arrive as text — "true"/"1" only, so "false" doesn't coerce to true
const queryBool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

export const listProductsSchema = z.object({
  query: z
    .object({
      category: z.string().min(1).optional(),
      search: z.string().min(1).optional(),
      brand: z.string().min(1).optional(),
      vendor: z.string().min(1).optional(),
      minPrice: z.coerce.number().nonnegative().optional(),
      maxPrice: z.coerce.number().nonnegative().optional(),
      minRating: z.coerce.number().min(0).max(5).optional(),
      inStock: queryBool.optional(),
      sort: z.enum(['newest', 'price_asc', 'price_desc', 'popular', 'rating']).optional(),
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(20),
    })
    .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
      message: 'minPrice must not exceed maxPrice',
      path: ['minPrice'],
    }),
});

export const productIdParamSchema = z.object({
  params: z.object({ productId: z.string().min(1) }),
});
