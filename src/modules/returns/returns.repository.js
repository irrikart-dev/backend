import { prisma } from '../../config/db.js';

const itemInclude = {
  items: {
    include: {
      orderItem: {
        include: {
          variant: { select: { sku: true, product: { select: { title: true, images: { take: 1, orderBy: { position: 'asc' } } } } } },
        },
      },
    },
  },
};

const adminInclude = {
  ...itemInclude,
  user: { select: { name: true, phone: true, email: true } },
  order: { select: { id: true, orderNumber: true, status: true, paymentMethod: true, totalAmount: true, deliveredAt: true } },
};

export default {
  // everything a return decision needs: lines, and every earlier return's lines (so
  // the same unit can't be returned twice)
  findOrderForReturn(orderId, where = {}) {
    return prisma.order.findFirst({
      where: { id: orderId, ...where },
      include: { items: true, returns: { include: { items: true } } },
    });
  },

  create({ items, ...data }) {
    return prisma.returnRequest.create({ data: { ...data, items: { create: items } }, include: itemInclude });
  },

  listForOrder(orderId) {
    return prisma.returnRequest.findMany({ where: { orderId }, include: itemInclude, orderBy: { createdAt: 'desc' } });
  },

  listForUser(userId) {
    return prisma.returnRequest.findMany({ where: { userId }, include: adminInclude, orderBy: { createdAt: 'desc' }, take: 50 });
  },

  listForAdmin(where, { skip, take }) {
    return prisma.returnRequest.findMany({ where, include: adminInclude, orderBy: { createdAt: 'desc' }, skip, take });
  },

  countForAdmin(where) {
    return prisma.returnRequest.count({ where });
  },

  findById(id) {
    return prisma.returnRequest.findUnique({ where: { id }, include: adminInclude });
  },

  // compare-and-set on status: count:0 means someone else decided it first
  transition(id, fromStatuses, data, client = prisma) {
    return client.returnRequest.updateMany({ where: { id, status: { in: fromStatuses } }, data });
  },

  update(id, data) {
    return prisma.returnRequest.update({ where: { id }, data });
  },

  transitionOrder(orderId, fromStatuses, data, client = prisma) {
    return client.order.updateMany({ where: { id: orderId, status: { in: fromStatuses } }, data });
  },
};
