import { prisma } from '../../config/db.js';

// latest payment attempt only — orders have one Payment row per gateway order
const latestPayment = { payments: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 } };

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
  ...latestPayment,
};

const adminOrderInclude = {
  ...orderItemInclude,
  user: { select: { id: true, name: true, phone: true, email: true } },
  vendor: { select: { id: true, storeName: true } },
  payments: { include: { refunds: true }, orderBy: { createdAt: 'desc' } },
};

export default {
  createOrder(
    {
      orderNumber,
      userId,
      cartId,
      vendorId,
      addressId,
      status = 'PLACED',
      paymentMethod = 'ONLINE',
      totalAmount,
      vendorAmount,
      platformAmount,
      items,
    },
    client = prisma
  ) {
    return client.order.create({
      data: {
        orderNumber,
        userId,
        cartId,
        vendorId,
        addressId,
        status,
        paymentMethod,
        totalAmount,
        vendorAmount,
        platformAmount,
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

  // payment capture: only an order still waiting on payment can be confirmed —
  // count:0 means it was cancelled/expired first
  confirmIfPlaced(orderId, client = prisma) {
    return client.order.updateMany({
      where: { id: orderId, status: { in: ['PLACED', 'PAYMENT_FAILED'] } },
      data: { status: 'CONFIRMED' },
    });
  },

  // a failed attempt on an order still waiting for payment; no-op once it's moved on
  markPaymentFailed(orderId, client = prisma) {
    return client.order.updateMany({ where: { id: orderId, status: 'PLACED' }, data: { status: 'PAYMENT_FAILED' } });
  },

  // compare-and-set on status: count:0 means someone else moved the order first
  transition(orderId, fromStatus, data, client = prisma) {
    return client.order.updateMany({ where: { id: orderId, status: fromStatus }, data });
  },

  findById(orderId) {
    return prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  },

  // online orders nobody paid for within the timeout — their stock is still held
  listStaleUnpaid(cutoff, take) {
    return prisma.order.findMany({
      where: { status: { in: ['PLACED', 'PAYMENT_FAILED'] }, paymentMethod: 'ONLINE', createdAt: { lt: cutoff } },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
      take,
    });
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
      include: latestPayment,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  // vendor's own order list/detail — same scoping pattern as the *ForUser pair above
  listForVendor(vendorId) {
    return prisma.order.findMany({
      where: { vendorId },
      include: latestPayment,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  findByIdForVendor(orderId, vendorId) {
    return prisma.order.findFirst({ where: { id: orderId, vendorId }, include: orderItemInclude });
  },

  // ---- admin console ----

  listForAdmin(where, { skip, take }) {
    return prisma.order.findMany({
      where,
      include: {
        ...latestPayment,
        user: { select: { name: true, phone: true, email: true } },
        vendor: { select: { storeName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  },

  countForAdmin(where) {
    return prisma.order.count({ where });
  },

  findByIdForAdmin(orderId) {
    return prisma.order.findUnique({ where: { id: orderId }, include: adminOrderInclude });
  },
};
