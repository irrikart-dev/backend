import { z } from 'zod';

const specSchema = z.object({ label: z.string(), value: z.string() });

// Shiprocket's create-order API needs these per item — optional everywhere
// since ProductVariant defaults them (0.5kg / 10x10x10cm) when not set.
const shippingDims = {
  weightKg: z.number().positive().optional(),
  lengthCm: z.number().positive().optional(),
  widthCm: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
};

// shared with vendors.validation.js's vendorCreateProductSchema — the vendor-scoped
// create route reuses this exact shape, just without the vendorId field admin picks here
export const productBodyFields = {
  name: z.string().min(1),
  sku: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  category: z.string().min(1),
  tagline: z.string().optional(),
  description: z.string().optional(),
  unit: z.string().optional(),
  price: z.number().nonnegative(),
  stockQty: z.number().int().nonnegative().optional(),
  imageUrl: z.string().nullable().optional(),
  videoUrl: z.string().url().nullable().optional(),
  features: z.array(z.string()).optional(),
  specs: z.array(specSchema).optional(),
  inStock: z.boolean().optional(),
  active: z.boolean().optional(),
  ...shippingDims,
};

export const createProductSchema = z.object({
  body: z.object({ ...productBodyFields, vendorId: z.string().min(1) }),
});

export const updateProductSchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    tagline: z.string().optional(),
    description: z.string().optional(),
    unit: z.string().optional(),
    price: z.number().nonnegative().optional(),
    stockQty: z.number().int().nonnegative().optional(),
    imageUrl: z.string().nullable().optional(),
    videoUrl: z.string().url().nullable().optional(),
    features: z.array(z.string()).optional(),
    specs: z.array(specSchema).optional(),
    inStock: z.boolean().optional(),
    active: z.boolean().optional(),
    ...shippingDims,
  }),
});

export const addProductImageSchema = z.object({
  body: z.object({
    url: z.string().min(1),
  }),
});

export const createVariantSchema = z.object({
  body: z.object({
    size: z.string().min(1).optional(),
    color: z.string().min(1).optional(),
    unit: z.string().optional(),
    price: z.number().nonnegative(),
    stockQty: z.number().int().nonnegative().optional(),
    sku: z.string().min(1).optional(),
    ...shippingDims,
  }),
});

export const updateVariantSchema = z.object({
  body: z.object({
    size: z.string().min(1).nullable().optional(),
    color: z.string().min(1).nullable().optional(),
    unit: z.string().optional(),
    price: z.number().nonnegative().optional(),
    stockQty: z.number().int().nonnegative().optional(),
    ...shippingDims,
  }),
});

export const pricingSchema = z.object({
  body: z.object({
    price: z.number().nonnegative(),
  }),
});

export const stockSchema = z.object({
  body: z.object({
    stock: z.number().int().nonnegative(),
  }),
});

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1),
    blurb: z.string().optional(),
    imageUrl: z.string().nullable().optional(),
  }),
});

export const updateCategorySchema = z.object({
  body: z.object({
    name: z.string().min(1).optional(),
    blurb: z.string().optional(),
    imageUrl: z.string().nullable().optional(),
  }),
});
