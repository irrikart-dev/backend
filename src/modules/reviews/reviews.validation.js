import { z } from 'zod';

export const submitReviewSchema = z.object({
  body: z.object({
    orderItemId: z.string().min(1),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
  }),
});

const REVIEW_STATUS = z.enum(['PENDING', 'APPROVED', 'REJECTED']);

export const listReviewsQuerySchema = z.object({
  query: z.object({
    status: REVIEW_STATUS.optional(),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
  }),
});

export const reviewStatusSchema = z.object({
  body: z.object({ status: REVIEW_STATUS }),
});
