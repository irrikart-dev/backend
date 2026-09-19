import { prisma } from '../../config/db.js';

const productInclude = {
  category: true,
  brand: true,
  vendor: { select: { id: true, storeName: true, slug: true, status: true, razorpayAccountId: true, routeStatus: true } },
  // full lists — the DTO still treats variants[0]/images[0] as the default
  // shown outside the PDP, but the PDP gallery/variant selector needs the rest
  variants: { orderBy: { id: 'asc' } },
  images: { orderBy: { position: 'asc' } },
};

// a vendor with a Route account not yet activated can't be paid out — see
// catalog.service.js's isVendorSellable, which this mirrors at the query level
const publicVendorGate = {
  OR: [{ vendor: { razorpayAccountId: null } }, { vendor: { status: 'ACTIVE', routeStatus: 'activated' } }],
};

// shared by the admin list (no `active` filter) and the app list (active only),
// so a change to what "search" means can't drift between the two. Built as an AND of
// independent clauses (not a flat object) so publicOnly's OR and search's OR never
// collide by overwriting each other's `OR` key.
function productWhere({ search, categoryId, active, vendorId, publicOnly } = {}) {
  const clauses = [];
  if (vendorId) clauses.push({ vendorId });
  if (categoryId) clauses.push({ categoryId });
  if (active !== undefined) clauses.push({ active });
  if (publicOnly) clauses.push(publicVendorGate);
  if (search) {
    clauses.push({
      OR: [
        { title: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
      ],
    });
  }
  return clauses.length ? { AND: clauses } : {};
}

export default {
  // ---- categories ----

  listCategories() {
    return prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
  },

  getCategoryById(id) {
    return prisma.category.findUnique({ where: { id } });
  },

  getCategoryBySlug(slug) {
    return prisma.category.findUnique({ where: { slug } });
  },

  createCategory(data) {
    return prisma.category.create({ data });
  },

  updateCategory(id, data) {
    return prisma.category.update({ where: { id }, data });
  },

  async deleteCategory(id) {
    const count = await prisma.product.count({ where: { categoryId: id } });
    if (count > 0) return { blocked: true, count };
    await prisma.category.delete({ where: { id } });
    return { blocked: false };
  },

  // ---- products ----

  listProducts({ search, categoryId, active, vendorId, publicOnly, skip, take } = {}) {
    return prisma.product.findMany({
      where: productWhere({ search, categoryId, active, vendorId, publicOnly }),
      include: productInclude,
      orderBy: { updatedAt: 'desc' },
      ...(skip !== undefined ? { skip } : {}),
      ...(take !== undefined ? { take } : {}),
    });
  },

  countProducts({ search, categoryId, active, vendorId, publicOnly } = {}) {
    return prisma.product.count({ where: productWhere({ search, categoryId, active, vendorId, publicOnly }) });
  },

  getProductById(id) {
    return prisma.product.findUnique({ where: { id }, include: productInclude });
  },

  getProductByIdOrSlug(idOrSlug) {
    return prisma.product.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: productInclude,
    });
  },

  getProductBySlug(slug) {
    return prisma.product.findUnique({ where: { slug } });
  },

  getVariantBySku(sku) {
    return prisma.productVariant.findUnique({ where: { sku } });
  },

  createProduct({ product, variant, imageUrl }) {
    return prisma.product.create({
      data: {
        ...product,
        variants: { create: variant },
        ...(imageUrl ? { images: { create: { url: imageUrl, position: 0 } } } : {}),
      },
      include: productInclude,
    });
  },

  async updateProduct(id, { product, variant, imageUrl }) {
    const existing = await prisma.product.findUnique({
      where: { id },
      include: { variants: { take: 1 }, images: { take: 1 } },
    });
    if (!existing) return null;

    await prisma.$transaction([
      prisma.product.update({ where: { id }, data: product }),
      ...(variant && existing.variants[0]
        ? [prisma.productVariant.update({ where: { id: existing.variants[0].id }, data: variant })]
        : []),
      ...(imageUrl === null && existing.images[0]
        ? [prisma.productImage.delete({ where: { id: existing.images[0].id } })]
        : []),
      ...(imageUrl && existing.images[0]
        ? [prisma.productImage.update({ where: { id: existing.images[0].id }, data: { url: imageUrl } })]
        : []),
      ...(imageUrl && !existing.images[0]
        ? [prisma.productImage.create({ data: { productId: id, url: imageUrl, position: 0 } })]
        : []),
    ]);

    return prisma.product.findUnique({ where: { id }, include: productInclude });
  },

  // ---- gallery images (beyond the single primary image createProduct/updateProduct manage) ----

  async addProductImage(productId, url) {
    const count = await prisma.productImage.count({ where: { productId } });
    return prisma.productImage.create({ data: { productId, url, position: count } });
  },

  getImageById(imageId) {
    return prisma.productImage.findUnique({ where: { id: imageId } });
  },

  deleteImageById(imageId) {
    return prisma.productImage.delete({ where: { id: imageId } });
  },

  // ---- additional variants (size/pack options beyond the primary one createProduct makes) ----

  createVariant(productId, data) {
    return prisma.productVariant.create({ data: { productId, ...data } });
  },

  getVariantById(variantId) {
    return prisma.productVariant.findUnique({ where: { id: variantId } });
  },

  updateVariant(variantId, data) {
    return prisma.productVariant.update({ where: { id: variantId }, data });
  },

  // a variant referenced by any order/cart line is kept forever for history —
  // block the delete instead of orphaning those rows
  async variantInUse(variantId) {
    const [cartCount, orderCount] = await Promise.all([
      prisma.cartItem.count({ where: { variantId } }),
      prisma.orderItem.count({ where: { variantId } }),
    ]);
    return cartCount > 0 || orderCount > 0;
  },

  deleteVariant(variantId) {
    return prisma.productVariant.delete({ where: { id: variantId } });
  },

  async deleteProduct(id) {
    const existing = await prisma.product.findUnique({
      where: { id },
      select: { images: { select: { url: true } } },
    });
    if (!existing) return { notFound: true };
    await prisma.product.delete({ where: { id } });
    return { imageUrls: existing.images.map((i) => i.url) };
  },

  // ---- stats ----

  async getStatsRaw() {
    const [
      totalProducts,
      activeProducts,
      adminProducts,
      seedProducts,
      outOfStock,
      categoryCount,
      categories,
      variants,
      recentlyUpdated,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { active: true } }),
      prisma.product.count({ where: { source: 'admin' } }),
      prisma.product.count({ where: { source: 'seed' } }),
      prisma.product.count({ where: { variants: { none: { stock: { gt: 0 } } } } }),
      prisma.category.count(),
      prisma.category.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { products: true } } },
      }),
      prisma.productVariant.findMany({ select: { price: true, stock: true } }),
      prisma.product.findMany({ include: productInclude, orderBy: { updatedAt: 'desc' }, take: 5 }),
    ]);

    return {
      totalProducts,
      activeProducts,
      adminProducts,
      seedProducts,
      outOfStock,
      categoryCount,
      categories,
      variants,
      recentlyUpdated,
    };
  },
};
