import { prisma } from '../../config/db.js';

const orderItemInclude = {
  items: {
    include: {
      variant: {
        include: {
          product: { include: { images: { take: 1, orderBy: { position: 'asc' } } } },
        },
      },
    },
  },
  address: true,
};

export default {
  createOrder({ orderNumber, userId, cartId, addressId, totalAmount, items }, client = prisma) {
    return client.order.create({
      data: {
        orderNumber,
        userId,
        cartId,
        addressId,
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

  // scoped by userId so an id from another user's order 404s instead of leaking
  findByIdForUser(orderId, userId) {
    return prisma.order.findFirst({ where: { id: orderId, userId }, include: orderItemInclude });
  },

  // order history screen: newest first. No pagination yet — ponytail: add cursor
  // pagination if/when a real account accumulates enough orders for it to matter.
  listForUser(userId) {
    return prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },
};
