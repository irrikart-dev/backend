import repository from './catalog.repository.js';
import * as inventoryService from '../inventory/inventory.service.js';
import { deleteImage } from '../admin/admin.service.js';
import { NotFoundError, ConflictError } from '../../common/errors/AppError.js';

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

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

function toProductDto(p) {
  const variant = p.variants?.[0];
  const image = p.images?.[0];
  const price = variant ? Number(variant.price) : 0;

  return {
    id: p.id,
    sku: variant?.sku ?? '',
    slug: p.slug,
    name: p.title,
    category: p.categoryId,
    categoryName: p.category?.name,
    image: image?.url ?? null,
    imageUrl: image?.url ?? null,
    displayImageUrl: image?.url ?? null,
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
  const { active, source, reserved, createdAt, image, displayImageUrl, ...pub } = toProductDto(p);
  return pub;
}

// ---- app-facing catalogue (public, live products only) ----

export async function listPublicProducts({ search, categoryId, page, limit }) {
  const filter = { search, categoryId, active: true };
  const [rows, total] = await Promise.all([
    repository.listProducts({ ...filter, skip: (page - 1) * limit, take: limit }),
    repository.countProducts(filter),
  ]);

  return { items: rows.map(toPublicProductDto), page, limit, total };
}

export async function getPublicProduct(idOrSlug) {
  const row = await repository.getProductByIdOrSlug(idOrSlug);
  // a hidden product is indistinguishable from a missing one to the app
  if (!row || !row.active) throw new NotFoundError('Product not found');
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

export async function getProduct(id) {
  const row = await repository.getProductById(id);
  if (!row) throw new NotFoundError('Product not found');
  return toProductDto(row);
}

export async function createProduct(input) {
  const slug = input.slug ? await uniqueSlug(slugify(input.slug)) : await uniqueSlug(slugify(input.name));
  const sku = input.sku ? await uniqueSku(input.sku) : await uniqueSku(slugify(input.name).toUpperCase().slice(0, 20));

  const row = await repository.createProduct({
    product: {
      categoryId: input.category,
      title: input.name,
      slug,
      tagline: input.tagline ?? null,
      description: input.description ?? null,
      features: input.features ?? [],
      specs: input.specs ?? [],
      inStock: input.inStock ?? true,
      active: input.active ?? true,
      source: 'admin',
    },
    variant: {
      sku,
      unit: input.unit ?? 'piece',
      price: input.price,
      stock: input.stockQty ?? 0,
    },
    imageUrl: input.imageUrl ?? null,
  });

  const variant = row.variants[0];
  if (variant && variant.stock > 0) {
    await inventoryService.recordAdjustment(variant.id, variant.stock, 'manual');
  }

  return toProductDto(row);
}

export async function updateProduct(id, input) {
  const before = await repository.getProductById(id);
  if (!before) throw new NotFoundError('Product not found');

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
    },
    variant:
      input.unit !== undefined || input.price !== undefined
        ? {
            ...(input.unit !== undefined ? { unit: input.unit } : {}),
            ...(input.price !== undefined ? { price: input.price } : {}),
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

export async function deleteProduct(id) {
  const result = await repository.deleteProduct(id);
  if (result.notFound) throw new NotFoundError('Product not found');
  await Promise.all(result.imageUrls.map(deleteImage));
}
