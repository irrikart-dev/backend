import { prisma } from '../../config/db.js';

export default {
  // scoped by userId (via the order it belongs to) so an id from someone else's
  // order can't be reviewed — same 404-not-403 pattern as orders.findByIdForUser
  findOrderItemForUser(orderItemId, userId) {
    return prisma.orderItem.findFirst({
      where: { id: orderItemId, order: { userId } },
      include: { order: { select: { status: true } }, variant: { select: { productId: true } } },
    });
  },

  findByOrderItemId(orderItemId) {
    return prisma.review.findUnique({ where: { orderItemId } });
  },

  create({ productId, userId, orderItemId, rating, comment, status }) {
    return prisma.review.create({
      data: { productId, userId, orderItemId, rating, comment, status },
    });
  },

  listForProduct(productId) {
    return prisma.review.findMany({
      where: { productId, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    });
  },

  // product page's rating/reviewCount are denormalised onto Product (and the seller's
  // onto Vendor) for the catalogue API to serve without a join — recomputed every time
  // a review lands or goes away
  async recomputeProductRating(productId, client = prisma) {
    const agg = await client.review.aggregate({
      where: { productId, status: 'APPROVED' },
      _avg: { rating: true },
      _count: true,
    });
    const product = await client.product.update({
      where: { id: productId },
      data: {
        rating: agg._avg.rating ?? 0,
        reviewCount: agg._count,
      },
      select: { vendorId: true },
    });

    const vendorAgg = await client.review.aggregate({
      where: { status: 'APPROVED', product: { vendorId: product.vendorId } },
      _avg: { rating: true },
      _count: true,
    });
    await client.vendor.update({
      where: { id: product.vendorId },
      data: { rating: vendorAgg._avg.rating ?? 0, reviewCount: vendorAgg._count },
    });
  },
};
