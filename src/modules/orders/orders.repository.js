import { prisma } from '../../config/db.js';

export default {
  createOrder({ orderNumber, userId, totalAmount, items }, client = prisma) {
    return client.order.create({
      data: {
        orderNumber,
        userId,
        totalAmount,
        items: {
          create: items.map(({ variantId, quantity, unitPrice, totalPrice }) => ({
            variantId,
            quantity,
            unitPrice,
            totalPrice,
          })),
        },
      },
      include: { items: true },
    });
  },

  updateStatus(orderId, status, client = prisma) {
    return client.order.update({ where: { id: orderId }, data: { status } });
  },
};
