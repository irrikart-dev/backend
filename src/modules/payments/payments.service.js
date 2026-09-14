import repository from './payments.repository.js';
import { paymentProvider } from './providers/index.js';
import env from '../../config/env.js';
import { prisma } from '../../config/db.js';
import ordersRepository from '../orders/orders.repository.js';
import * as inventory from '../inventory/inventory.service.js';
import * as discounts from '../discounts/discounts.service.js';
import logger from '../../common/utils/logger.js';
import { BadRequestError } from '../../common/errors/AppError.js';

// rupees -> paise boundary — nowhere else in the app deals in paise
export function createPaymentOrder({ amount, receipt }) {
  return paymentProvider.createOrder({ amount: amount * 100, currency: 'INR', receipt });
}

export function recordPayment(tx, { orderId, providerOrderId, amount }) {
  return repository.createPayment({ orderId, provider: env.PAYMENT_PROVIDER, providerOrderId, amount }, tx);
}

export function getClientConfig() {
  return { provider: env.PAYMENT_PROVIDER, ...paymentProvider.clientConfig() };
}

export async function handleWebhookEvent(rawBody, signature, body) {
  let valid = false;
  try {
    valid = Boolean(signature) && paymentProvider.verifyWebhookSignature(rawBody, signature);
  } catch {
    valid = false;
  }
  if (!valid) {
    logger.warn({ event: body?.event }, 'payment webhook: signature verification failed');
    throw new BadRequestError('Invalid webhook signature');
  }

  const entity = body?.payload?.payment?.entity;
  if (!entity?.id || !entity?.order_id) throw new BadRequestError('Malformed webhook payload');

  // cheap pre-transaction idempotency probe — gateways redeliver events, this short-circuits the common case
  if (await repository.findByProviderPaymentId(entity.id)) {
    logger.info({ paymentId: entity.id }, 'payment webhook: already processed, skipping');
    return;
  }

  const payment = await repository.findByProviderOrderId(entity.order_id);
  if (!payment) {
    logger.warn({ providerOrderId: entity.order_id }, 'payment webhook: no matching payment row');
    throw new BadRequestError('Unknown payment order');
  }

  if (body.event === 'payment.captured') return captureOrder(payment, entity);
  if (body.event === 'payment.failed') return failOrder(payment, entity);
  logger.info({ event: body.event }, 'payment webhook: unhandled event, ignoring');
}

async function captureOrder(payment, entity) {
  await prisma.$transaction(async (tx) => {
    // authoritative guard — closes the race the probe above can't (two deliveries in flight at once)
    const { count } = await repository.markCaptured(
      payment.id,
      { providerPaymentId: entity.id, method: entity.method ?? null },
      tx
    );
    if (count === 0) return;

    await ordersRepository.updateStatus(payment.orderId, 'CONFIRMED', tx);
    for (const item of payment.order.items) {
      await inventory.commitReservedStock(tx, item.variantId, item.quantity, payment.orderId);
    }
  });
}

async function failOrder(payment, entity) {
  await prisma.$transaction(async (tx) => {
    const { count } = await repository.markFailed(payment.id, { providerPaymentId: entity.id }, tx);
    if (count === 0) return;

    await ordersRepository.updateStatus(payment.orderId, 'CANCELLED', tx);
    for (const item of payment.order.items) {
      await inventory.releaseReservedStock(tx, item.variantId, item.quantity, payment.orderId);
    }
    await discounts.releaseUsage(tx, payment.orderId);
  });
}
