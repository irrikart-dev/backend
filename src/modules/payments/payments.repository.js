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
  // lookup that maps back, and it also pulls the line items reserve/release needs
  findByProviderOrderId(providerOrderId) {
    return prisma.payment.findUnique({
      where: { providerOrderId },
      include: { order: { include: { items: true } } },
    });
  },

  // guarded by status: a second delivery of the same webhook event gets count:0, no-op
  markCaptured(paymentId, { providerPaymentId, method }, client = prisma) {
    return client.payment.updateMany({
      where: { id: paymentId, status: 'CREATED' },
      data: { status: 'CAPTURED', providerPaymentId, method },
    });
  },

  markFailed(paymentId, { providerPaymentId }, client = prisma) {
    return client.payment.updateMany({
      where: { id: paymentId, status: 'CREATED' },
      data: { status: 'FAILED', providerPaymentId },
    });
  },
};
