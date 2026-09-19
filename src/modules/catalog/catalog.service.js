import repository from './catalog.repository.js';
import * as inventoryService from '../inventory/inventory.service.js';
import { deleteImage } from '../admin/admin.service.js';
import { slugify } from '../../common/utils/slugify.js';
import { NotFoundError, ConflictError, ForbiddenError } from '../../common/errors/AppError.js';

async function uniqueSlug(base) {
  let slug = base;
  let n = 1;
  while (await repository.getProductBySlug(slug)) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

async function uniqueSku(base) {
  let sku = base;
  let n = 1;
  while (await repository.getVariantBySku(sku)) {
    sku = `${base}-${++n}`;
  }
  return sku;
}

function toCategoryDto(c) {
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    blurb: c.blurb ?? '',
    imageUrl: c.imageUrl ?? null,
    productCount: c._count?.products ?? 0,
  };
}

function toVariantDto(v) {
  return {
    id: v.id,
    sku: v.sku,
    size: v.size,
    color: v.color,
    unit: v.unit,
    price: Number(v.price),
    stockQty: v.stock,
    available: v.stock - v.reserved,
  };
}

function toProductDto(p) {
  // variants[0]/images[0] stay the "default" shown outside the PDP (list
  // cards, cart lines, checkout) — untouched by adding more of either, so
  // cart/checkout keep working against whichever variantId they were given
  const variant = p.variants?.[0];
  const image = p.images?.[0];
  const price = variant ? Number(variant.price) : 0;

  return {
    id: p.id,
    // Kept even though `variants` below now carries every option — cart's
    // POST /cart/items and every screen that predates the PDP gallery/variant
    // selector still expects this top-level default id.
    variantId: variant?.id ?? null,
    sku: variant?.sku ?? '',
    slug: p.slug,
    name: p.title,
    vendorId: p.vendorId,
    vendor: p.vendor ? { id: p.vendor.id, storeName: p.vendor.storeName, slug: p.vendor.slug } : null,
    category: p.categoryId,
    categoryName: p.category?.name,
    image: image?.url ?? null,
    imageUrl: image?.url ?? null,
    displayImageUrl: image?.url ?? null,
    // Full gallery/options — PDP media viewer and variant selector read these;
    // everything else can keep ignoring them.
    images: (p.images ?? []).map((i) => i.url),
    // Admin-only — carries the image id the add/remove-image endpoints need,
    // which the public `images` array (just URLs) deliberately doesn't expose.
    galleryImages: (p.images ?? []).map((i) => ({ id: i.id, url: i.url, position: i.position })),
    videoUrl: p.videoUrl ?? null,
    variants: (p.variants ?? []).map(toVariantDto),
    tagline: p.tagline ?? '',
    description: p.description ?? '',
    features: p.features,
    specs: p.specs ?? [],
    unit: variant?.unit ?? 'piece',
    price,
    rating: p.rating,
    reviewCount: p.reviewCount,
    inStock: p.inStock,
    source: p.source,
    active: p.active,
    stockQty: variant?.stock ?? 0,
    reserved: variant?.reserved ?? 0,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// What the mobile app sees. Derived from the admin DTO rather than built separately
// so the two can't drift; the dropped keys are internal (see docs/app-catalog-api-contract.md).
function toPublicProductDto(p) {
  const { active, source, reserved, createdAt, image, displayImageUrl, galleryImages, ...pub } =
    toProductDto(p);
  return pub;
}

// ---- app-facing catalogue (public, live products only) ----

export async function listPublicProducts({ search, categoryId, page, limit }) {
  const filter = { search, categoryId, active: true, publicOnly: true };
  const [rows, total] = await Promise.all([
    repository.listProducts({ ...filter, skip: (page - 1) * limit, take: limit }),
    repository.countProducts(filter),
  ]);

  return { items: rows.map(toPublicProductDto), page, limit, total };
}

// a vendor with a Route account that isn't activated yet can't be paid out, so their
// products stay unlisted until it is (see routeStatus on Vendor). The platform's own
// system vendor has no razorpayAccountId and is exempt from this gate.
function isVendorSellable(vendor) {
  if (!vendor) return false;
  if (!vendor.razorpayAccountId) return true;
  return vendor.status === 'ACTIVE' && vendor.routeStatus === 'activated';
}

export async function getPublicProduct(idOrSlug) {
  const row = await repository.getProductByIdOrSlug(idOrSlug);
  // a hidden product is indistinguishable from a missing one to the app
  if (!row || !row.active || !isVendorSellable(row.vendor)) throw new NotFoundError('Product not found');
  return toPublicProductDto(row);
}

// ---- categories ----

export async function listCategories() {
  const rows = await repository.listCategories();
  return rows.map(toCategoryDto);
}

export async function createCategory(input) {
  const slug = await uniqueSlugForCategory(slugify(input.name));
  const category = await repository.createCategory({
    name: input.name,
    slug,
    blurb: input.blurb ?? null,
    imageUrl: input.imageUrl ?? null,
  });
  return toCategoryDto(category);
}

async function uniqueSlugForCategory(base) {
  let slug = base;
  let n = 1;
  while (await repository.getCategoryBySlug(slug)) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

export async function updateCategory(id, input) {
  const existing = await repository.getCategoryById(id);
  if (!existing) throw new NotFoundError('Category not found');
  const category = await repository.updateCategory(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.blurb !== undefined ? { blurb: input.blurb } : {}),
    ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
  });

  if (input.imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== input.imageUrl) {
    await deleteImage(existing.imageUrl);
  }

  return toCategoryDto(category);
}

export async function deleteCategory(id) {
  const existing = await repository.getCategoryById(id);
  const result = await repository.deleteCategory(id);
  if (result.blocked) {
    throw new ConflictError(
      `Category has ${result.count} product(s) — move or delete them first`
    );
  }

  if (existing?.imageUrl) await deleteImage(existing.imageUrl);
}

// ---- products ----

export async function listProducts(query) {
  const rows = await repository.listProducts(query);
  return rows.map(toProductDto);
}

export async function getProduct(id, { vendorId } = {}) {
  const row = await repository.getProductById(id);
  if (!row) throw new NotFoundError('Product not found');
  if (vendorId && row.vendorId !== vendorId) throw new ForbiddenError('Not your product');
  return toProductDto(row);
}

export async function createProduct(input) {
  const slug = input.slug ? await uniqueSlug(slugify(input.slug)) : await uniqueSlug(slugify(input.name));
  const sku = input.sku ? await uniqueSku(input.sku) : await uniqueSku(slugify(input.name).toUpperCase().slice(0, 20));

  const row = await repository.createProduct({
    product: {
      vendorId: input.vendorId,
      categoryId: input.category,
      title: input.name,
      slug,
      tagline: input.tagline ?? null,
      description: input.description ?? null,
      features: input.features ?? [],
      specs: input.specs ?? [],
      inStock: input.inStock ?? true,
      active: input.active ?? true,
      videoUrl: input.videoUrl ?? null,
      source: 'admin',
    },
    variant: {
      sku,
      unit: input.unit ?? 'piece',
      price: input.price,
      stock: input.stockQty ?? 0,
      ...(input.weightKg !== undefined ? { weightKg: input.weightKg } : {}),
      ...(input.lengthCm !== undefined ? { lengthCm: input.lengthCm } : {}),
      ...(input.widthCm !== undefined ? { widthCm: input.widthCm } : {}),
      ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}),
    },
    imageUrl: input.imageUrl ?? null,
  });

  const variant = row.variants[0];
  if (variant && variant.stock > 0) {
    await inventoryService.recordAdjustment(variant.id, variant.stock, 'manual');
  }

  return toProductDto(row);
}

export async function updateProduct(id, input, { vendorId } = {}) {
  const before = await repository.getProductById(id);
  if (!before) throw new NotFoundError('Product not found');
  if (vendorId && before.vendorId !== vendorId) throw new ForbiddenError('Not your product');

  const row = await repository.updateProduct(id, {
    product: {
      ...(input.category !== undefined ? { categoryId: input.category } : {}),
      ...(input.name !== undefined ? { title: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.features !== undefined ? { features: input.features } : {}),
      ...(input.specs !== undefined ? { specs: input.specs } : {}),
      ...(input.inStock !== undefined ? { inStock: input.inStock } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.videoUrl !== undefined ? { videoUrl: input.videoUrl } : {}),
    },
    variant:
      input.unit !== undefined ||
      input.price !== undefined ||
      input.weightKg !== undefined ||
      input.lengthCm !== undefined ||
      input.widthCm !== undefined ||
      input.heightCm !== undefined
        ? {
            ...(input.unit !== undefined ? { unit: input.unit } : {}),
            ...(input.price !== undefined ? { price: input.price } : {}),
            ...(input.weightKg !== undefined ? { weightKg: input.weightKg } : {}),
            ...(input.lengthCm !== undefined ? { lengthCm: input.lengthCm } : {}),
            ...(input.widthCm !== undefined ? { widthCm: input.widthCm } : {}),
            ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}),
          }
        : undefined,
    imageUrl: input.imageUrl,
  });

  const oldImageUrl = before.images?.[0]?.url;
  if (input.imageUrl !== undefined && oldImageUrl && oldImageUrl !== input.imageUrl) {
    await deleteImage(oldImageUrl);
  }

  if (input.stockQty !== undefined) {
    await setStock(id, input.stockQty);
    return getProduct(id);
  }

  return toProductDto(row);
}

export async function updateProductPricing(id, { price }) {
  const row = await repository.updateProduct(id, { product: {}, variant: { price } });
  if (!row) throw new NotFoundError('Product not found');
  return toProductDto(row);
}

async function setStock(productId, stock) {
  const before = await repository.getProductById(productId);
  if (!before) throw new NotFoundError('Product not found');
  const variant = before.variants[0];
  const delta = stock - (variant?.stock ?? 0);

  await repository.updateProduct(productId, { product: {}, variant: { stock } });
  if (variant && delta !== 0) {
    await inventoryService.recordAdjustment(variant.id, delta, 'manual');
  }
}

export async function updateProductStock(id, { stock }) {
  await setStock(id, stock);
  return getProduct(id);
}

export async function deleteProduct(id, { vendorId } = {}) {
  if (vendorId) {
    const existing = await repository.getProductById(id);
    if (!existing) throw new NotFoundError('Product not found');
    if (existing.vendorId !== vendorId) throw new ForbiddenError('Not your product');
  }
  const result = await repository.deleteProduct(id);
  if (result.notFound) throw new NotFoundError('Product not found');
  await Promise.all(result.imageUrls.map(deleteImage));
}

// ---- gallery images (extra angles / in-use shots, beyond the primary image) ----

export async function addProductImage(productId, { url }) {
  const product = await repository.getProductById(productId);
  if (!product) throw new NotFoundError('Product not found');
  await repository.addProductImage(productId, url);
  return getProduct(productId);
}

export async function removeProductImage(productId, imageId) {
  const image = await repository.getImageById(imageId);
  if (!image || image.productId !== productId) throw new NotFoundError('Image not found');
  await repository.deleteImageById(imageId);
  await deleteImage(image.url);
  return getProduct(productId);
}

// ---- variants (size/pack options, beyond the primary one createProduct makes) ----

export async function createProductVariant(productId, input) {
  const product = await repository.getProductById(productId);
  if (!product) throw new NotFoundError('Product not found');

  const sku = input.sku ? await uniqueSku(input.sku) : await uniqueSku(`${product.variants[0]?.sku ?? productId}-V`);
  const variant = await repository.createVariant(productId, {
    sku,
    size: input.size ?? null,
    color: input.color ?? null,
    unit: input.unit ?? 'piece',
    price: input.price,
    stock: input.stockQty ?? 0,
    ...(input.weightKg !== undefined ? { weightKg: input.weightKg } : {}),
    ...(input.lengthCm !== undefined ? { lengthCm: input.lengthCm } : {}),
    ...(input.widthCm !== undefined ? { widthCm: input.widthCm } : {}),
    ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}),
  });

  if (variant.stock > 0) {
    await inventoryService.recordAdjustment(variant.id, variant.stock, 'manual');
  }

  return getProduct(productId);
}

export async function updateProductVariant(productId, variantId, input) {
  const variant = await repository.getVariantById(variantId);
  if (!variant || variant.productId !== productId) throw new NotFoundError('Variant not found');

  const delta = input.stockQty !== undefined ? input.stockQty - variant.stock : 0;

  await repository.updateVariant(variantId, {
    ...(input.size !== undefined ? { size: input.size } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
    ...(input.unit !== undefined ? { unit: input.unit } : {}),
    ...(input.price !== undefined ? { price: input.price } : {}),
    ...(input.stockQty !== undefined ? { stock: input.stockQty } : {}),
    ...(input.weightKg !== undefined ? { weightKg: input.weightKg } : {}),
    ...(input.lengthCm !== undefined ? { lengthCm: input.lengthCm } : {}),
    ...(input.widthCm !== undefined ? { widthCm: input.widthCm } : {}),
    ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}),
  });

  if (delta !== 0) await inventoryService.recordAdjustment(variantId, delta, 'manual');

  return getProduct(productId);
}

export async function deleteProductVariant(productId, variantId) {
  const variant = await repository.getVariantById(variantId);
  if (!variant || variant.productId !== productId) throw new NotFoundError('Variant not found');

  const product = await repository.getProductById(productId);
  if (product.variants.length <= 1) {
    throw new ConflictError('Cannot delete a product\'s only variant');
  }
  if (await repository.variantInUse(variantId)) {
    throw new ConflictError('Variant is referenced by a cart or past order — cannot delete');
  }

  await repository.deleteVariant(variantId);
  return getProduct(productId);
}

// ---- stats ----

export async function getStats() {
  const raw = await repository.getStatsRaw();
  const prices = raw.variants.map((v) => Number(v.price));
  const inventoryValue = raw.variants.reduce((sum, v) => sum + Number(v.price) * v.stock, 0);
  const averagePrice = prices.length ? prices.reduce((sum, p) => sum + p, 0) / prices.length : 0;

  return {
    totalProducts: raw.totalProducts,
    activeProducts: raw.activeProducts,
    adminProducts: raw.adminProducts,
    seedProducts: raw.seedProducts,
    outOfStock: raw.outOfStock,
    categories: raw.categoryCount,
    inventoryValue,
    averagePrice,
    byCategory: raw.categories.map((c) => ({ id: c.id, name: c.name, count: c._count.products })),
    recentlyUpdated: raw.recentlyUpdated.map(toProductDto),
  };
}
