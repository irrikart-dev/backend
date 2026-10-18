import { z } from 'zod';
import { productBodyFields } from '../admin/admin.validation.js';

export const createVendorSchema = z.object({
  body: z.object({
    storeName: z.string().min(1),
    // the vendor must have already signed in once via Firebase (see promote-admin.js
    // for the same constraint) — this looks up that existing User row by email
    ownerEmail: z.string().email(),
    commissionPercent: z.number().min(0).max(100).optional(),
    legalBusinessName: z.string().optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    // required at create time — a vendor with no linked account can never receive a
    // Route split payment, so there's no point onboarding one without it. Created
    // directly with Razorpay, outside this app; we only verify and store it.
    razorpayAccountId: z.string().min(1),
  }),
});

export const updateVendorSchema = z.object({
  body: z.object({
    storeName: z.string().min(1).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    commissionPercent: z.number().min(0).max(100).optional(),
    legalBusinessName: z.string().optional(),
    contactEmail: z.string().email().optional(),
    contactPhone: z.string().optional(),
    razorpayAccountId: z.string().min(1).nullable().optional(),
  }),
});

// same product shape admin uses (admin.validation.js's productBodyFields), minus
// vendorId — a vendor can only ever create products under their own req.vendor.id
export const vendorCreateProductSchema = z.object({
  body: z.object({ ...productBodyFields }),
});
