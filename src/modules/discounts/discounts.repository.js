import { prisma } from '../../config/db.js';

export default {
  // codes are stored upper-case but customers type them any way they like
  findByCode(code, client = prisma) {
    return client.coupon.findFirst({ where: { code: { equals: code, mode: 'insensitive' } } });
  },

  findById(id) {
    return prisma.coupon.findUnique({ where: { id } });
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

  // ---- admin ----

  list() {
    return prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  },

  // every live usage with what its order was billed and its pre-discount line
  // items — cancelled orders give their usage back, so this is only real redemptions
  // ponytail: loads every usage row into memory; swap for a SQL GROUP BY once
  // coupon redemptions run into the tens of thousands
  listUsagesWithOrders() {
    return prisma.couponUsage.findMany({
      select: {
        couponId: true,
        userId: true,
        order: { select: { totalAmount: true, items: { select: { quantity: true, unitPrice: true } } } },
      },
    });
  },

  create(data) {
    return prisma.coupon.create({ data });
  },

  update(id, data) {
    return prisma.coupon.update({ where: { id }, data });
  },

  delete(id) {
    return prisma.coupon.delete({ where: { id } });
  },
};
