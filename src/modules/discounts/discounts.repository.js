import { prisma } from '../../config/db.js';

export default {
  findByCode(code, client = prisma) {
    return client.coupon.findUnique({ where: { code } });
  },

  countUsages(couponId, client = prisma) {
    return client.couponUsage.count({ where: { couponId } });
  },

  countUsagesForUser(couponId, userId, client = prisma) {
    return client.couponUsage.count({ where: { couponId, userId } });
  },

  createUsage({ couponId, userId, orderId }, client = prisma) {
    return client.couponUsage.create({ data: { couponId, userId, orderId } });
  },

  deleteUsageByOrderId(orderId, client = prisma) {
    return client.couponUsage.deleteMany({ where: { orderId } });
  },
};
