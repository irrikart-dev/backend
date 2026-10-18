import { prisma } from '../../config/db.js';

export default {
  createPayment({ orderId, provider, providerOrderId, amount }, client = prisma) {
    return client.payment.create({
      data: { orderId, provider, providerOrderId, amount, status: 'CREATED' },
    });
  },

  findByProviderPaymentId(providerPaymentId) {
    return prisma.payment.findUnique({ where: { providerPaymentId } });
  },

  // webhook only carries the gateway's order id, not our internal orderId — this is the
  // lookup that maps back, and it also pulls the line items reserve/release needs plus
  // the order's vendor (captureOrder needs its razorpayAccountId for the Route transfer)
  findByProviderOrderId(providerOrderId) {
    return prisma.payment.findUnique({
      where: { providerOrderId },
      include: { order: { include: { items: true, vendor: true } } },
    });
  },

  // the app's verify call knows our own orderId, not the gateway's — same include
  // as findByProviderOrderId so both paths can drive capture/fail identically.
  // userId comes along for the ownership check in verifyPayment.
  findByOrderId(orderId) {
    return prisma.payment.findFirst({
      where: { orderId },
      include: { order: { include: { items: true, vendor: true } } },
    });
  },

  // guarded by status: a second delivery of the same webhook event gets count:0, no-op.
  // FAILED is capturable too — a customer retrying inside the same checkout sheet pays
  // against the same gateway order after an earlier attempt failed.
  markCaptured(paymentId, { providerPaymentId, method }, client = prisma) {
    return client.payment.updateMany({
      where: { id: paymentId, status: { in: ['CREATED', 'FAILED'] } },
      data: { status: 'CAPTURED', providerPaymentId, method },
    });
  },

  markFailed(paymentId, { providerPaymentId }, client = prisma) {
    return client.payment.updateMany({
      where: { id: paymentId, status: 'CREATED' },
      data: { status: 'FAILED', providerPaymentId },
    });
  },

  recordTransfer(paymentId, { transferId, transferStatus }) {
    return prisma.payment.update({ where: { id: paymentId }, data: { transferId, transferStatus } });
  },

  findCapturedForOrder(orderId) {
    return prisma.payment.findFirst({ where: { orderId, status: 'CAPTURED' } });
  },

  createRefund({ paymentId, orderId, razorpayRefundId, status, amount }) {
    return prisma.refund.create({ data: { paymentId, orderId, razorpayRefundId, status, amount } });
  },

  // ---- admin reconciliation ----

  listForAdmin(where, { skip, take }) {
    return prisma.payment.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            vendorAmount: true,
            platformAmount: true,
            vendor: { select: { storeName: true } },
            user: { select: { name: true, phone: true, email: true } },
          },
        },
        refunds: { select: { amount: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  },

  countForAdmin(where) {
    return prisma.payment.count({ where });
  },

  async summaryForAdmin(where) {
    const [byStatus, refunded, transferFailed] = await Promise.all([
      prisma.payment.groupBy({ by: ['status'], where, _sum: { amount: true }, _count: true }),
      prisma.refund.aggregate({ where: { payment: where }, _sum: { amount: true } }),
      prisma.payment.count({ where: { AND: [where, { status: 'CAPTURED', transferStatus: 'failed' }] } }),
    ]);
    return { byStatus, refunded: refunded._sum.amount, transferFailed };
  },
};
