import { z } from 'zod';
import { ADMIN_PERMISSIONS } from '../../common/middlewares/auth.js';

const productStatus = z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']);

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
  brandId: z.string().min(1).nullable().optional(),
  inStock: z.boolean().optional(),
  status: productStatus.optional(),
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
    brandId: z.string().min(1).nullable().optional(),
    inStock: z.boolean().optional(),
    status: productStatus.optional(),
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

export const bulkUpdateProductsSchema = z.object({
  body: z
    .object({
      ids: z.array(z.string().min(1)).min(1).max(500),
      status: productStatus.optional(),
      category: z.string().min(1).optional(),
      brandId: z.string().min(1).nullable().optional(),
      inStock: z.boolean().optional(),
    })
    .refine(
      (b) => [b.status, b.category, b.brandId, b.inStock].some((v) => v !== undefined),
      'Nothing to update'
    ),
});

export const listProductsQuerySchema = z.object({
  query: z.object({
    search: z.string().optional(),
    category: z.string().optional(),
    vendorId: z.string().optional(),
    status: productStatus.optional(),
  }),
});

export const brandSchema = z.object({
  body: z.object({ name: z.string().trim().min(1).max(80) }),
});

export const listOrdersQuerySchema = z.object({
  query: z.object({
    status: z.enum(['PLACED', 'PAYMENT_FAILED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED']).optional(),
    vendorId: z.string().optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
  }),
});

export const orderStatusSchema = z.object({
  body: z.object({ status: z.enum(['PACKED', 'SHIPPED', 'DELIVERED']) }),
});

export const listPaymentsQuerySchema = z.object({
  query: z.object({
    status: z.enum(['CREATED', 'CAPTURED', 'FAILED']).optional(),
    transferStatus: z.enum(['processed', 'failed', 'reversed', 'none']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
  }),
});

export const stockAdjustmentSchema = z.object({
  body: z.object({
    // signed: +10 received, -2 damaged
    delta: z.number().int().refine((n) => n !== 0, 'Delta must not be 0'),
    note: z.string().trim().min(1).max(200),
  }),
});

const permissionList = z.array(z.enum(ADMIN_PERMISSIONS)).min(1);

export const createStaffSchema = z.object({
  body: z.object({ email: z.string().email(), permissions: permissionList }),
});

export const updateStaffSchema = z.object({
  body: z.object({ permissions: permissionList }),
});
