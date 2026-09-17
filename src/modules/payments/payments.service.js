import repository from './payments.repository.js';
import { paymentProvider } from './providers/index.js';
import env from '../../config/env.js';
import { prisma } from '../../config/db.js';
import ordersRepository from '../orders/orders.repository.js';
import cartRepository from '../cart/cart.repository.js';
import * as inventory from '../inventory/inventory.service.js';
import * as discounts from '../discounts/discounts.service.js';
import * as vendorsService from '../vendors/vendors.service.js';
import logger from '../../common/utils/logger.js';
import { BadRequestError, NotFoundError } from '../../common/errors/AppError.js';

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

/**
 * Client-driven confirmation, for the app to call the moment the checkout SDK
 * reports success — so an order isn't hostage to webhook delivery latency.
 *
 * The webhook remains the source of truth for everything asynchronous (an
 * abandoned sheet, a payment captured minutes later, a refund). This path just
 * gets the common case confirmed immediately. Both funnel through the same
 * status-guarded capture/fail writes, so whichever arrives second is a no-op
 * rather than a double-commit.
 *
 * Trust chain: the caller's signature proves they hold this payment, and
 * fetchPayment() is then treated as authoritative for its actual status — a
 * valid signature alone never confirms an order.
 */
export async function verifyPayment({ orderId, providerPaymentId, signature, userId }) {
  const payment = await repository.findByOrderId(orderId);
  // same response for "not yours" as "doesn't exist" — don't leak order ids
  if (!payment || payment.order.userId !== userId) throw new NotFoundError('Order not found');

  const valid = (() => {
    try {
      return paymentProvider.verifyPaymentSignature({
        providerOrderId: payment.providerOrderId,
        providerPaymentId,
        signature,
      });
    } catch {
      return false;
    }
  })();
  if (!valid) {
    logger.warn({ orderId, providerPaymentId }, 'payment verify: bad signature');
    throw new BadRequestError('Payment signature verification failed');
  }

  const entity = await paymentProvider.fetchPayment(providerPaymentId);
  if (entity?.order_id !== payment.providerOrderId) {
    throw new BadRequestError('Payment does not belong to this order');
  }

  if (entity.status === 'captured') await captureOrder(payment, entity);
  else if (entity.status === 'failed') await failOrder(payment, entity);
  // authorized / created: money isn't settled yet — leave the order PLACED and
  // let the webhook finish it; the app keeps polling.

  const order = await ordersRepository.findByIdForUser(payment.orderId, userId);
  return { orderId: payment.orderId, status: order?.status ?? 'PLACED' };
}

async function captureOrder(payment, entity) {
  let captured = false;
  await prisma.$transaction(async (tx) => {
    // authoritative guard — closes the race the probe above can't (two deliveries in flight at once)
    const { count } = await repository.markCaptured(
      payment.id,
      { providerPaymentId: entity.id, method: entity.method ?? null },
      tx
    );
    if (count === 0) return;
    captured = true;

    await ordersRepository.updateStatus(payment.orderId, 'CONFIRMED', tx);
    for (const item of payment.order.items) {
      await inventory.commitReservedStock(tx, item.variantId, item.quantity, payment.orderId);
    }
    // checkout deliberately left the cart untouched (see orders.service.js) — convert it
    // now that payment is actually confirmed, not before
    await cartRepository.markConverted(payment.order.cartId, tx);
  });

  if (captured) await transferToVendor(payment, entity);
}

// splits the vendor's cut to their Razorpay Route account. Deliberately outside the
// capture transaction above — the customer's payment already succeeded either way, so a
// transfer failure shouldn't roll back a confirmed order, just leave transferStatus
// reflecting it for reconciliation. No-op for the platform's own system vendor (no
// razorpayAccountId to transfer to).
async function transferToVendor(payment, entity) {
  const vendor = payment.order.vendor;
  if (!vendor?.razorpayAccountId) return;

  try {
    const amountPaise = Math.round(Number(payment.order.vendorAmount) * 100);
    const result = await vendorsService.transferPayout(vendor.razorpayAccountId, entity.id, amountPaise);
    const transfer = result?.items?.[0];
    await repository.recordTransfer(payment.id, {
      transferId: transfer?.id ?? null,
      transferStatus: transfer?.status ?? 'processed',
    });
  } catch (err) {
    logger.error({ err, paymentId: payment.id }, 'route transfer to vendor failed after capture');
    await repository.recordTransfer(payment.id, { transferId: null, transferStatus: 'failed' });
  }
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
