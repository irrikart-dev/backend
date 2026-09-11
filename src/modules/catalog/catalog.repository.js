import { prisma } from '../../config/db.js';

const productInclude = {
  category: true,
  brand: true,
  variants: { take: 1 },
  images: { take: 1, orderBy: { position: 'asc' } },
};

// shared by the admin list (no `active` filter) and the app list (active only),
// so a change to what "search" means can't drift between the two
function productWhere({ search, categoryId, active } = {}) {
  return {
    ...(categoryId ? { categoryId } : {}),
    ...(active !== undefined ? { active } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { slug: { contains: search, mode: 'insensitive' } },
            { variants: { some: { sku: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
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

  listProducts({ search, categoryId, active, skip, take } = {}) {
    return prisma.product.findMany({
      where: productWhere({ search, categoryId, active }),
      include: productInclude,
      orderBy: { updatedAt: 'desc' },
      ...(skip !== undefined ? { skip } : {}),
      ...(take !== undefined ? { take } : {}),
    });
  },

  countProducts({ search, categoryId, active } = {}) {
    return prisma.product.count({ where: productWhere({ search, categoryId, active }) });
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

  async deleteProduct(id) {
    const existing = await prisma.product.findUnique({
      where: { id },
      select: { images: { select: { url: true } } },
    });
    if (!existing) return { notFound: true };
    await prisma.product.delete({ where: { id } });
    return { imageUrls: existing.images.map((i) => i.url) };
  },
};
