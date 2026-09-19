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
};
