import repository from './payments.repository.js';
import { paymentProvider } from './providers/index.js';
import env from '../../config/env.js';
import { prisma } from '../../config/db.js';
import ordersRepository from '../orders/orders.repository.js';
import cartRepository from '../cart/cart.repository.js';
import * as inventory from '../inventory/inventory.service.js';
import * as shipping from '../shipping/shipping.service.js';
import * as vendorsService from '../vendors/vendors.service.js';
import logger from '../../common/utils/logger.js';
import { BadRequestError, NotFoundError } from '../../common/errors/AppError.js';

// rupees -> paise boundary — nowhere else in the app deals in paise
export async function createPaymentOrder({ amount, receipt }) {
  try {
    return await paymentProvider.createOrder({ amount: amount * 100, currency: 'INR', receipt });
  } catch (err) {
    // The razorpay SDK throws a plain `{statusCode, error}` object (not an Error) on
    // an API-level rejection, and a bare TypeError if the request never got a response
    // at all (network blip) — neither is an AppError, so errorHandler was silently
    // downgrading both to a generic, undiagnosable 500. Surface the real reason.
    const reason = err?.error?.description || err?.message || 'Unknown gateway error';
    logger.error({ err, amount, receipt }, 'razorpay order creation failed');
    throw new BadRequestError(`Payment gateway rejected this order: ${reason}`);
  }
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
  const outcome = await prisma.$transaction(async (tx) => {
    // authoritative guard — closes the race the probe above can't (two deliveries in flight at once)
    const { count } = await repository.markCaptured(
      payment.id,
      { providerPaymentId: entity.id, method: entity.method ?? null },
      tx
    );
    if (count === 0) return 'duplicate';

    // the order may already be gone: expired unpaid, or cancelled by the customer, before
    // this money landed. Its stock hold was released then, so it can't be confirmed now.
    const { count: confirmed } = await ordersRepository.confirmIfPlaced(payment.orderId, tx);
    if (confirmed === 0) return 'late';

    for (const item of payment.order.items) {
      await inventory.commitReservedStock(tx, item.variantId, item.quantity, payment.orderId);
    }
    // checkout deliberately left the cart untouched (see orders.service.js) — convert it
    // now that payment is actually confirmed, not before
    await cartRepository.markConverted(payment.order.cartId, tx);
    return 'captured';
  });

  if (outcome === 'late') {
    logger.warn({ orderId: payment.orderId, paymentId: entity.id }, 'payment captured on a cancelled order — refunding');
    await refundPayment(
      { ...payment, status: 'CAPTURED', providerPaymentId: entity.id },
      { reason: 'Payment received after the order was cancelled' }
    );
    return;
  }
  if (outcome !== 'captured') return;

  // both outside the transaction — network calls (Shiprocket, Razorpay Route
  // transfer) that must never be allowed to undo or delay the payment
  // confirmation above. Each logs and swallows its own failures.
  void shipping.createShipmentForOrder(payment.orderId);
  await transferToVendor(payment, entity);
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

// one failed attempt doesn't end the order: it moves to PAYMENT_FAILED so the customer
// sees what happened, keeps its stock held, and can retry inside the same checkout sheet
// (or reopen it via POST /orders/:id/pay) against the same gateway order — until it's
// paid, cancelled, or expires (see orders.service.js expireStaleOrders).
async function failOrder(payment, entity) {
  await prisma.$transaction(async (tx) => {
    await repository.markFailed(payment.id, { providerPaymentId: entity.id }, tx);
    await ordersRepository.markPaymentFailed(payment.orderId, tx);
  });
}

/**
 * Full refund of an order's captured payment. Never throws — the caller has already
 * committed the cancellation, so a gateway error is logged and left visible on the
 * admin payments screen (captured, no refund row) for a manual retry.
 * reverse_all pulls back the vendor's Route transfer along with the refund.
 */
export async function refundPayment(payment, { reason }) {
  try {
    const amount = Number(payment.amount);
    const refund = await paymentProvider.refund(payment.providerPaymentId, {
      amount: Math.round(amount * 100),
      notes: { reason: reason.slice(0, 250) },
      ...(payment.transferId ? { reverse_all: 1 } : {}),
    });
    await repository.createRefund({
      paymentId: payment.id,
      orderId: payment.orderId,
      razorpayRefundId: refund.id,
      status: refund.status ?? 'pending',
      amount,
    });
    return { status: refund.status ?? 'pending' };
  } catch (err) {
    logger.error({ err, paymentId: payment.id, orderId: payment.orderId }, 'refund failed');
    return { status: 'failed' };
  }
}

export async function refundOrder(orderId, { reason }) {
  const payment = await repository.findCapturedForOrder(orderId);
  if (!payment) return null;
  return refundPayment(payment, { reason });
}

// ---- saved payment methods ----

/**
 * The caller's gateway customer id, created on first use. Returns null if the gateway
 * call fails — checkout still works, the customer just can't save a method this time.
 */
export async function ensureCustomer(user) {
  if (user.razorpayCustomerId) return user.razorpayCustomerId;
  try {
    const customerId = await paymentProvider.createCustomer({
      name: user.name,
      email: user.email,
      contact: user.phone,
    });
    await prisma.user.update({ where: { id: user.id }, data: { razorpayCustomerId: customerId } });
    return customerId;
  } catch (err) {
    logger.error({ err, userId: user.id }, 'payment customer creation failed');
    return null;
  }
}

export async function listSavedMethods(user) {
  if (!user.razorpayCustomerId) return [];
  return paymentProvider.listSavedMethods(user.razorpayCustomerId);
}

export async function deleteSavedMethod(user, methodId) {
  if (!user.razorpayCustomerId) throw new NotFoundError('Saved method not found');
  try {
    await paymentProvider.deleteSavedMethod(user.razorpayCustomerId, methodId);
  } catch (err) {
    if (err?.statusCode === 400 || err?.statusCode === 404) throw new NotFoundError('Saved method not found');
    throw err;
  }
}

// ---- admin reconciliation ----

function adminWhere({ status, transferStatus, from, to, search }) {
  const clauses = [];
  if (status) clauses.push({ status });
  if (transferStatus === 'none') clauses.push({ transferStatus: null });
  else if (transferStatus) clauses.push({ transferStatus });
  if (from) clauses.push({ createdAt: { gte: from } });
  if (to) clauses.push({ createdAt: { lte: to } });
  if (search) {
    clauses.push({
      OR: [
        { providerOrderId: { contains: search } },
        { providerPaymentId: { contains: search } },
        { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }
  return clauses.length ? { AND: clauses } : {};
}

export async function listPaymentsForAdmin({ page, limit, ...filter }) {
  const where = adminWhere(filter);
  const [rows, total, summary] = await Promise.all([
    repository.listForAdmin(where, { skip: (page - 1) * limit, take: limit }),
    repository.countForAdmin(where),
    repository.summaryForAdmin(where),
  ]);

  const statusTotals = Object.fromEntries(
    summary.byStatus.map((g) => [g.status, { count: g._count, amount: Number(g._sum.amount ?? 0) }])
  );

  return {
    items: rows.map((p) => {
      const refunded = p.refunds.reduce((sum, r) => sum + Number(r.amount), 0);
      return {
        id: p.id,
        orderId: p.order.id,
        orderNumber: p.order.orderNumber,
        orderStatus: p.order.status,
        customer: p.order.user.name ?? p.order.user.phone ?? p.order.user.email,
        vendor: p.order.vendor.storeName,
        amount: Number(p.amount),
        vendorAmount: Number(p.order.vendorAmount),
        platformAmount: Number(p.order.platformAmount),
        status: p.status,
        method: p.method,
        providerOrderId: p.providerOrderId,
        providerPaymentId: p.providerPaymentId,
        transferId: p.transferId,
        transferStatus: p.transferStatus,
        refunded,
        // money in that isn't backed by a live order and hasn't gone back out
        needsAttention:
          (p.status === 'CAPTURED' && p.order.status === 'CANCELLED' && refunded < Number(p.amount)) ||
          (p.status === 'CAPTURED' && p.transferStatus === 'failed'),
        createdAt: p.createdAt,
      };
    }),
    page,
    limit,
    total,
    summary: {
      captured: statusTotals.CAPTURED ?? { count: 0, amount: 0 },
      failed: statusTotals.FAILED ?? { count: 0, amount: 0 },
      pending: statusTotals.CREATED ?? { count: 0, amount: 0 },
      refunded: Number(summary.refunded ?? 0),
      transferFailed: summary.transferFailed,
    },
  };
}
