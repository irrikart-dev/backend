import { z } from 'zod';

import { HttpError } from '../utils/http-error.js';
import { slugify, uniqueSlug } from '../utils/slug.js';
import { newId, skuFromSlug, store } from './store.js';

const specSchema = z.object({
  label: z.string().min(1).max(60),
  value: z.string().min(1).max(120),
});

const baseProduct = {
  name: z.string().min(2).max(140),
  sku: z.string().min(2).max(40).regex(/^[A-Za-z0-9._-]+$/, 'SKU may only contain letters, digits, dot, dash and underscore'),
  category: z.string().min(1),
  tagline: z.string().max(200).default(''),
  description: z.string().max(4000).default(''),
  features: z.array(z.string().min(1).max(200)).max(20).default([]),
  specs: z.array(specSchema).max(30).default([]),
  unit: z.string().min(1).max(24).default('piece'),
  // Whole rupees, matching the app's interim money model. Paise arrives with
  // the payments feature; changing it here means changing it in one place.
  mrp: z.number().int().nonnegative(),
  price: z.number().int().nonnegative(),
  imageUrl: z.string().url().max(500).nullable().default(null),
  stockQty: z.number().int().nonnegative().default(0),
  inStock: z.boolean().default(true),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  rating: z.number().min(0).max(5).default(0),
  reviewCount: z.number().int().nonnegative().default(0),
};

export const createProductSchema = z
  .object({ ...baseProduct, slug: z.string().max(80).optional(), sku: baseProduct.sku.optional() })
  .refine((v) => v.price <= v.mrp, { message: 'Selling price cannot exceed MRP', path: ['price'] });

export const updateProductSchema = z
  .object({ ...baseProduct, slug: z.string().max(80) })
  .partial();

export const pricingSchema = z
  .object({
    mrp: z.number().int().nonnegative(),
    price: z.number().int().nonnegative(),
  })
  .refine((v) => v.price <= v.mrp, { message: 'Selling price cannot exceed MRP', path: ['price'] });

/** `assets/mock/products/img012-x.webp` -> `/static/products/img012-x.webp` */
function assetUrl(image) {
  if (!image) return null;
  return `/static/products/${image.split('/').pop()}`;
}

/** Shape returned to every client (app + storefront + dashboard). */
export function toPublicProduct(p) {
  return {
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    category: p.category,
    image: p.image,
    imageUrl: p.imageUrl,
    // Ready-to-render URL for web clients: an admin-supplied remote image, or
    // the bundled catalogue asset served from /static. The app ignores this and
    // uses `image` (a local asset path) so seed products render offline.
    displayImageUrl: p.imageUrl ?? assetUrl(p.image),
    tagline: p.tagline,
    description: p.description,
    features: p.features,
    specs: p.specs,
    unit: p.unit,
    mrp: p.mrp,
    price: p.price,
    discountPercent: p.mrp <= p.price ? 0 : Math.round(((p.mrp - p.price) / p.mrp) * 100),
    rating: p.rating,
    reviewCount: p.reviewCount,
    inStock: p.inStock && p.stockQty !== 0,
    featured: p.featured,
    source: p.source,
    updatedAt: p.updatedAt,
  };
}

export function listProducts({ category, search, featured, inStock, includeInactive = false } = {}) {
  let rows = store.products;
  if (!includeInactive) rows = rows.filter((p) => p.active);
  if (category) rows = rows.filter((p) => p.category === category);
  if (featured !== undefined) rows = rows.filter((p) => p.featured === featured);
  if (inStock !== undefined) rows = rows.filter((p) => (p.inStock && p.stockQty !== 0) === inStock);
  if (search) {
    const q = search.trim().toLowerCase();
    rows = rows.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.tagline.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }
  return rows;
}

export function findById(id) {
  const p = store.products.find((x) => x.id === id);
  if (!p) throw HttpError.notFound(`No product with id ${id}`);
  return p;
}

export function findBySlug(slug) {
  const p = store.products.find((x) => x.slug === slug && x.active);
  if (!p) throw HttpError.notFound(`No product with slug ${slug}`);
  return p;
}

function assertCategoryExists(id) {
  if (!store.categories.some((c) => c.id === id)) {
    throw HttpError.badRequest(`Unknown category "${id}"`);
  }
}

function assertSkuFree(sku, exceptId) {
  const clash = store.products.find(
    (p) => p.sku.toLowerCase() === sku.toLowerCase() && p.id !== exceptId,
  );
  if (clash) throw HttpError.conflict(`SKU "${sku}" is already used by "${clash.name}"`);
}

export async function createProduct(input) {
  const data = createProductSchema.parse(input);
  assertCategoryExists(data.category);

  const slug = uniqueSlug(
    slugify(data.slug || data.name),
    store.products.map((p) => p.slug),
  );
  const sku = data.sku?.trim() || skuFromSlug(slug);
  assertSkuFree(sku);

  const now = new Date().toISOString();
  const product = {
    id: newId(),
    ...data,
    sku,
    slug,
    image: null, // seed products carry a bundled asset path; admin ones use imageUrl
    source: 'admin',
    createdAt: now,
    updatedAt: now,
  };
  store.products.push(product);
  await store.save();
  return product;
}

export async function updateProduct(id, input) {
  const product = findById(id);
  const patch = updateProductSchema.parse(input);

  if (patch.category) assertCategoryExists(patch.category);
  if (patch.sku) assertSkuFree(patch.sku.trim(), id);
  if (patch.slug) {
    patch.slug = uniqueSlug(
      slugify(patch.slug),
      store.products.filter((p) => p.id !== id).map((p) => p.slug),
    );
  }

  const merged = { ...product, ...patch };
  if (merged.price > merged.mrp) {
    throw HttpError.badRequest('Selling price cannot exceed MRP', { path: ['price'] });
  }

  Object.assign(product, patch, { updatedAt: new Date().toISOString() });
  await store.save();
  return product;
}

/** Pricing-only edit — the dashboard's inline price editor uses this. */
export async function updatePricing(id, input) {
  const { mrp, price } = pricingSchema.parse(input);
  const product = findById(id);
  Object.assign(product, { mrp, price, updatedAt: new Date().toISOString() });
  await store.save();
  return product;
}

export async function deleteProduct(id) {
  const product = findById(id);
  if (product.source === 'seed') {
    // Seed rows mirror the client's live site; hiding is reversible, deleting
    // would silently drop catalogue data the app still links to.
    throw HttpError.forbidden(
      'Catalogue products from the original IrriKart site cannot be deleted — set them inactive instead.',
    );
  }
  store.products.splice(store.products.indexOf(product), 1);
  await store.save();
  return product;
}

export function stats() {
  const products = store.products;
  const active = products.filter((p) => p.active);
  const outOfStock = active.filter((p) => !p.inStock || p.stockQty === 0);
  const inventoryValue = active.reduce((sum, p) => sum + p.price * (p.stockQty ?? 0), 0);
  const byCategory = store.categories.map((c) => ({
    id: c.id,
    name: c.name,
    count: active.filter((p) => p.category === c.id).length,
  }));
  return {
    totalProducts: products.length,
    activeProducts: active.length,
    adminProducts: products.filter((p) => p.source === 'admin').length,
    seedProducts: products.filter((p) => p.source === 'seed').length,
    outOfStock: outOfStock.length,
    featured: active.filter((p) => p.featured).length,
    categories: store.categories.length,
    inventoryValue,
    averagePrice: active.length
      ? Math.round(active.reduce((s, p) => s + p.price, 0) / active.length)
      : 0,
    byCategory,
    recentlyUpdated: [...products]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6)
      .map(toPublicProduct),
  };
}
