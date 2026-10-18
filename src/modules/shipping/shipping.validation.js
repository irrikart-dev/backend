import { z } from 'zod';

export const serviceabilityQuerySchema = z.object({
  query: z.object({
    pincode: z.string().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit pincode'),
    // whole-cart weight; defaults to one standard parcel
    weightKg: z.coerce.number().positive().max(100).default(0.5),
    // z.coerce.boolean() would read "false" as true
    cod: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  }),
});
