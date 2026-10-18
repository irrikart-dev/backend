import { z } from 'zod';

const couponFields = {
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, - and _ only'),
  type: z.enum(['FLAT', 'PERCENT']),
  value: z.number().positive(),
  minCartValue: z.number().nonnegative().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().positive().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  active: z.boolean().optional(),
  description: z.string().trim().max(120).nullable().optional(),
  listed: z.boolean().optional(),
  firstOrderOnly: z.boolean().optional(),
  // email or phone of the one customer who may use it; null clears it
  customerContact: z.string().trim().max(120).nullable().optional(),
};

const percentCap = (c) => c.type !== 'PERCENT' || c.value === undefined || c.value <= 100;
const percentCapError = { message: 'A percentage discount can be at most 100', path: ['value'] };

export const createCouponSchema = z.object({
  body: z.object(couponFields).refine(percentCap, percentCapError),
});

// percent cap is checked against the stored coupon in discounts.service.js
export const updateCouponSchema = z.object({
  body: z.object(couponFields).partial(),
});
