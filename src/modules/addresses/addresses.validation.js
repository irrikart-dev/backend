import { z } from 'zod';

const pincode = z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits');

export const createAddressSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1),
    phone: z.string().trim().min(10).max(15),
    line1: z.string().trim().min(1),
    line2: z.string().trim().optional(),
    city: z.string().trim().min(1),
    state: z.string().trim().min(1),
    pincode,
    isDefault: z.boolean().optional(),
  }),
});

export const updateAddressSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(10).max(15).optional(),
    line1: z.string().trim().min(1).optional(),
    line2: z.string().trim().optional(),
    city: z.string().trim().min(1).optional(),
    state: z.string().trim().min(1).optional(),
    pincode: pincode.optional(),
    isDefault: z.boolean().optional(),
  }),
});
