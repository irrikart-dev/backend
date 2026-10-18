import { prisma } from '../../config/db.js';

export default {
  // signed change; a debit only applies if the balance covers it (count 0 otherwise)
  changeBalance(userId, amount, tx) {
    return tx.user.updateMany({
      where: { id: userId, ...(amount < 0 ? { walletBalance: { gte: -amount } } : {}) },
      data: { walletBalance: { increment: amount } },
    });
  },

  balance(userId, client = prisma) {
    return client.user.findUnique({ where: { id: userId }, select: { walletBalance: true } });
  },

  createTransaction(data, tx) {
    return tx.walletTransaction.create({ data });
  },

  async creditedForOrder(orderId, client = prisma) {
    const agg = await client.walletTransaction.aggregate({ where: { orderId, type: 'REFUND' }, _sum: { amount: true } });
    return Number(agg._sum.amount ?? 0);
  },

  listForUser(userId, take = 50) {
    return prisma.walletTransaction.findMany({
      where: { userId },
      include: { order: { select: { id: true, orderNumber: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    });
  },

  listForAdmin(where, { skip, take }) {
    return prisma.walletTransaction.findMany({
      where,
      include: {
        order: { select: { id: true, orderNumber: true } },
        user: { select: { name: true, phone: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  },

  countForAdmin(where) {
    return prisma.walletTransaction.count({ where });
  },

  async sumForAdmin(where) {
    const agg = await prisma.walletTransaction.aggregate({ where, _sum: { amount: true } });
    return Number(agg._sum.amount ?? 0);
  },
};
