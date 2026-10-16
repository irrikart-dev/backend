import { prisma } from '../../config/db.js';

export default {
  createVendor(data) {
    return prisma.vendor.create({ data });
  },

  listVendors() {
    return prisma.vendor.findMany({ orderBy: { createdAt: 'desc' } });
  },

  getVendorById(id) {
    return prisma.vendor.findUnique({ where: { id } });
  },

  getVendorBySlug(slug) {
    return prisma.vendor.findUnique({ where: { slug } });
  },

  getVendorByOwnerUserId(ownerUserId) {
    return prisma.vendor.findUnique({ where: { ownerUserId } });
  },

  updateVendor(id, data) {
    return prisma.vendor.update({ where: { id }, data });
  },

  // vendor payouts screen: every payment on one of this vendor's orders, newest first
  listPayouts(vendorId) {
    return prisma.payment.findMany({
      where: { order: { vendorId } },
      include: { order: { select: { orderNumber: true, vendorAmount: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },

  // performance: order counts/value per vendor × status × who cancelled
  groupOrdersForPerformance(vendorId) {
    return prisma.order.groupBy({
      by: ['vendorId', 'status', 'cancelledBy'],
      where: vendorId ? { vendorId } : {},
      _count: { _all: true },
      _sum: { totalAmount: true },
    });
  },

  // per-product rating/reviewCount are already denormalised by reviews.repository.js
  listRatedProducts(vendorId) {
    return prisma.product.findMany({
      where: { reviewCount: { gt: 0 }, ...(vendorId ? { vendorId } : {}) },
      select: { vendorId: true, rating: true, reviewCount: true },
    });
  },
};
