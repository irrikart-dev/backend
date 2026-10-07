import { randomBytes } from 'node:crypto';
import repository from './orders.repository.js';
import { prisma } from '../../config/db.js';
import env from '../../config/env.js';
import cartRepository from '../cart/cart.repository.js';
import * as cartService from '../cart/cart.service.js';
import * as inventory from '../inventory/inventory.service.js';
import * as discounts from '../discounts/discounts.service.js';
import * as payments from '../payments/payments.service.js';
import * as addresses from '../addresses/addresses.service.js';
import * as shipping from '../shipping/shipping.service.js';
import * as vendorsService from '../vendors/vendors.service.js';
import logger from '../../common/utils/logger.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/AppError.js';

function available(variant) {
  return variant.stock - variant.reserved;
}

function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `ORD-${date}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export async function checkout(user, { couponCode, addressId, paymentMethod = 'ONLINE' } = {}) {
  const userId = user.id;
  if (!addressId) throw new BadRequestError('A delivery address is required');
  const address = await addresses.findOwnedByUser(addressId, userId);
  if (!address) throw new NotFoundError('Address not found');

  // free up stock held by abandoned online orders before checking availability
  await expireStaleOrders();

  const cart = await cartRepository.findActiveCartWithItems(userId);
  if (!cart || cart.items.length === 0) throw new BadRequestError('Cart is empty');

  // a cart only ever holds one vendor's items (see cart.service.js addItem), so
  // cart.vendorId is guaranteed set here
  const vendor = await vendorsService.getVendorById(cart.vendorId);
  if (!vendor || vendor.status !== 'ACTIVE') throw new BadRequestError('This seller is no longer available');

  // re-validate against current stock/price — the cart's own include already joins the
  // live variant row, so this is the same read, not a second query
  const lineItems = [];

  for (const item of cart.items) {
    const { variant } = item;
    if (item.quantity > available(variant)) {
      throw new ConflictError(`Only ${available(variant)} of ${variant.sku} available`);
    }
    const unitPrice = Number(variant.price);
    lineItems.push({
      variantId: variant.id,
      quantity: item.quantity,
      unitPrice,
      totalPrice: unitPrice * item.quantity,
    });
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);

  let coupon = null;
  let discount = 0;
  if (couponCode) {
    coupon = await discounts.validateCoupon(couponCode, { userId, cartSubtotal: subtotal });
    discount = discounts.calculateDiscount(coupon, subtotal);
  }

  const totalAmount = Math.max(Math.round(subtotal - discount), 0);
  // Razorpay rejects sub-₹1 orders outright — without this guard a coupon
  // that fully (or near-fully) offsets the subtotal sends amount:0 straight
  // to the gateway, which throws in a way the SDK mishandles (see
  // RazorpayProvider/payments.service.createPaymentOrder) and surfaced as an
  // unexplained 500 with the real reason discarded.
  if (totalAmount < 1) {
    throw new BadRequestError('Order total must be at least ₹1 — adjust your coupon or cart');
  }

  if (paymentMethod === 'COD') assertCodEligible(totalAmount);

  const orderNumber = generateOrderNumber();

  // split at the vendor's commission rate as of checkout time, so a later commission
  // change never retroactively changes an already-placed order's numbers
  const commissionPercent = Number(vendor.commissionPercent);
  const vendorAmount = Math.round(totalAmount * (1 - commissionPercent / 100));
  const platformAmount = totalAmount - vendorAmount;

  const orderFields = {
    orderNumber,
    userId,
    cartId: cart.id,
    vendorId: cart.vendorId,
    addressId,
    paymentMethod,
    totalAmount,
    vendorAmount,
    platformAmount,
    items: lineItems,
  };

  if (paymentMethod === 'COD') return placeCodOrder(orderFields, coupon);

  // gateway call stays outside the DB transaction: Payment.providerOrderId is unique and
  // non-nullable, so it must exist before Payment can be created, and keeping this network
  // call out of the transaction means a gateway outage never leaves a half-reserved order
  const providerOrder = await payments.createPaymentOrder({ amount: totalAmount, receipt: orderNumber });

  const { order } = await prisma.$transaction(async (tx) => {
    const createdOrder = await repository.createOrder(orderFields, tx);

    for (const item of lineItems) {
      await inventory.reserveStock(tx, item.variantId, item.quantity, createdOrder.id);
    }

    const payment = await payments.recordPayment(tx, {
      orderId: createdOrder.id,
      providerOrderId: providerOrder.id,
      amount: totalAmount,
    });

    if (coupon) {
      await discounts.recordUsage(tx, { couponId: coupon.id, userId, orderId: createdOrder.id });
    }

    return { order: createdOrder, payment };
  });

  // cart is deliberately left untouched here — it's only converted once payment actually
  // confirms (payments.service.js captureOrder), so a failed/abandoned payment leaves the
  // cart exactly as the user left it, ready to retry checkout
  return paymentSheet(user, order, providerOrder.id);
}

// everything the app needs to open (or reopen) the gateway's checkout sheet
async function paymentSheet(user, order, providerOrderId) {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentMethod: 'ONLINE',
    amount: Number(order.totalAmount),
    currency: 'INR',
    providerOrderId,
    // pass to the sheet so it can offer saved methods and to save new ones; null if
    // the gateway couldn't create a customer — checkout still works without it
    customerId: await payments.ensureCustomer(user),
    ...payments.getClientConfig(),
  };
}

function assertCodEligible(totalAmount) {
  if (!env.COD_ENABLED) throw new BadRequestError('Cash on delivery is not available right now');
  if (totalAmount > env.COD_MAX_ORDER_AMOUNT) {
    throw new BadRequestError(`Cash on delivery is available on orders up to ₹${env.COD_MAX_ORDER_AMOUNT}`);
  }
}

// COD skips the gateway: the order is confirmed and its stock taken immediately, the
// cart converted, and the shipment booked — the same end state a captured online
// payment reaches in payments.service.js captureOrder.
// ponytail: COD orders get no Route transfer — the vendor's share of cash collected by
// the courier is settled manually until payout settlement (week 8) handles it.
async function placeCodOrder(orderFields, coupon) {
  const order = await prisma.$transaction(async (tx) => {
    const created = await repository.createOrder({ ...orderFields, status: 'CONFIRMED' }, tx);
    for (const item of orderFields.items) {
      await inventory.reserveStock(tx, item.variantId, item.quantity, created.id);
      await inventory.commitReservedStock(tx, item.variantId, item.quantity, created.id);
    }
    if (coupon) {
      await discounts.recordUsage(tx, { couponId: coupon.id, userId: orderFields.userId, orderId: created.id });
    }
    await cartRepository.markConverted(orderFields.cartId, tx);
    return created;
  });

  void shipping.createShipmentForOrder(order.id);

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentMethod: 'COD',
    status: order.status,
    amount: Number(order.totalAmount),
    currency: 'INR',
  };
}

// unpaid online orders: stock is only held, not taken, and the order can still be paid
const AWAITING_PAYMENT = ['PLACED', 'PAYMENT_FAILED'];

/** Reopen the payment sheet for an online order still waiting on payment (or whose last attempt failed). */
export async function payOrder(user, orderId) {
  const order = await repository.findByIdForUser(orderId, user.id);
  if (!order) throw new NotFoundError('Order not found');
  if (order.paymentMethod !== 'ONLINE' || !AWAITING_PAYMENT.includes(order.status)) {
    throw new ConflictError(
      order.status === 'CANCELLED'
        ? 'This order was cancelled — place it again from your cart'
        : 'This order is already paid'
    );
  }
  const payment = await prisma.payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
  return paymentSheet(user, order, payment.providerOrderId);
}

// ---- cancellation ----

/**
 * Cancels an order and undoes its side effects: an unpaid order's stock hold is
 * released, a paid order's sold stock goes back on the shelf and its payment is
 * refunded in full; a coupon use is given back either way. Callers decide *whether*
 * an order may be cancelled — this only does it.
 *
 * ponytail: a Shiprocket shipment already booked for the order isn't cancelled here —
 * cancel it in the Shiprocket dashboard until the shipping module grows a cancel call.
 */
async function cancel(order, { by, reason }) {
  const stockCommitted = !AWAITING_PAYMENT.includes(order.status);

  const { count } = await prisma.$transaction(async (tx) => {
    const result = await repository.transition(
      order.id,
      order.status,
      { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: by, cancelReason: reason },
      tx
    );
    if (result.count === 0) return result;

    for (const item of order.items) {
      if (stockCommitted) await inventory.restockCancelledStock(tx, item.variantId, item.quantity, order.id);
      else await inventory.releaseReservedStock(tx, item.variantId, item.quantity, order.id);
    }
    await discounts.releaseUsage(tx, order.id);
    return result;
  });
  if (count === 0) throw new ConflictError('This order was just updated — refresh and try again');

  const refund =
    stockCommitted && order.paymentMethod === 'ONLINE' ? await payments.refundOrder(order.id, { reason }) : null;
  return { refundStatus: refund?.status ?? null };
}

export async function cancelOrderByCustomer(userId, orderId, { reason }) {
  const order = await repository.findByIdForUser(orderId, userId);
  if (!order) throw new NotFoundError('Order not found');
  if (![...AWAITING_PAYMENT, 'CONFIRMED'].includes(order.status)) {
    throw new ConflictError(`A ${order.status.toLowerCase()} order can't be cancelled`);
  }
  const windowEnds = order.createdAt.getTime() + env.ORDER_CANCEL_WINDOW_HOURS * 3600 * 1000;
  if (order.status === 'CONFIRMED' && Date.now() > windowEnds) {
    throw new ConflictError(`Orders can only be cancelled within ${env.ORDER_CANCEL_WINDOW_HOURS} hours of placing them`);
  }
  const result = await cancel(order, { by: 'customer', reason });
  return { ...(await getOrder(userId, orderId)), ...result };
}

export async function cancelOrderByAdmin(orderId, { reason }) {
  const order = await repository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (![...AWAITING_PAYMENT, 'CONFIRMED', 'PACKED'].includes(order.status)) {
    throw new ConflictError(`A ${order.status.toLowerCase()} order can't be cancelled`);
  }
  const result = await cancel(order, { by: 'admin', reason });
  return { ...(await getOrderForAdmin(orderId)), ...result };
}

/**
 * Auto-cancels online orders left unpaid past the payment timeout so their stock
 * hold goes back on sale. A payment that still lands afterwards is refunded by
 * payments.service.js captureOrder.
 *
 * ponytail: runs lazily (on checkout and when admin opens orders), not on a timer —
 * fine while every stock read goes through checkout; add a Vercel cron hitting it
 * if held stock ever needs to free up between checkouts.
 */
export async function expireStaleOrders() {
  try {
    const cutoff = new Date(Date.now() - env.ORDER_PAYMENT_TIMEOUT_MINUTES * 60 * 1000);
    const stale = await repository.listStaleUnpaid(cutoff, 50);
    for (const order of stale) {
      await cancel(order, { by: 'system', reason: 'Payment not completed in time' }).catch((err) => {
        if (!(err instanceof ConflictError)) throw err;
      });
    }
  } catch (err) {
    logger.error({ err }, 'expiring stale orders failed');
  }
}

// ---- fulfilment: vendor accepts, then pack -> ship -> deliver ----

const NEXT_STATUS = { CONFIRMED: 'PACKED', PACKED: 'SHIPPED', SHIPPED: 'DELIVERED' };

async function advance(order, target) {
  if (NEXT_STATUS[order.status] !== target) {
    throw new ConflictError(`Can't move a ${order.status.toLowerCase()} order to ${target.toLowerCase()}`);
  }
  const { count } = await repository.transition(order.id, order.status, { status: target });
  if (count === 0) throw new ConflictError('This order was just updated — refresh and try again');
}

export async function acceptOrder(vendorId, orderId) {
  const order = await repository.findByIdForVendor(orderId, vendorId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== 'CONFIRMED' || order.acceptedAt) throw new ConflictError('Only a new, paid order can be accepted');
  const { count } = await repository.transition(orderId, 'CONFIRMED', { acceptedAt: new Date() });
  if (count === 0) throw new ConflictError('This order was just updated — refresh and try again');
  return getOrderForVendor(vendorId, orderId);
}

export async function rejectOrder(vendorId, orderId, { reason }) {
  const order = await repository.findByIdForVendor(orderId, vendorId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== 'CONFIRMED' || order.acceptedAt) {
    throw new ConflictError('Only a new order you haven\'t accepted yet can be rejected');
  }
  const result = await cancel(order, { by: 'vendor', reason });
  return { ...(await getOrderForVendor(vendorId, orderId)), ...result };
}

// vendors pack and ship; delivery is confirmed by admin (or the courier feed)
export async function advanceOrderForVendor(vendorId, orderId, target) {
  const order = await repository.findByIdForVendor(orderId, vendorId);
  if (!order) throw new NotFoundError('Order not found');
  if (!order.acceptedAt) throw new ConflictError('Accept the order first');
  await advance(order, target);
  return getOrderForVendor(vendorId, orderId);
}

export async function advanceOrderForAdmin(orderId, target) {
  const order = await repository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  await advance(order, target);
  return getOrderForAdmin(orderId);
}

/** Puts a past order's lines back in the cart — see cart.service.js mergeItems. */
export async function reorder(userId, orderId) {
  const order = await repository.findByIdForUser(orderId, userId);
  if (!order) throw new NotFoundError('Order not found');
  return cartService.mergeItems(
    userId,
    order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }))
  );
}

// ---- read side ----

function toOrderItemDto(item) {
  const { variant } = item;
  const { product } = variant;

  return {
    // OrderItem's own id — distinct from variantId/productId, and what a
    // review submission (POST /reviews) needs as orderItemId.
    id: item.id,
    variantId: variant.id,
    productId: product.id,
    name: product.title,
    slug: product.slug,
    image: product.images?.[0]?.url ?? null,
    sku: variant.sku,
    unit: variant.unit,
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
    totalPrice: Number(item.totalPrice),
  };
}

function toOrderAddressDto(address) {
  if (!address) return null;
  return {
    name: address.name,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
  };
}

function toOrderSummaryDto(order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    // latest gateway attempt for online orders (CREATED / CAPTURED / FAILED); null for COD
    paymentStatus: order.payments?.[0]?.status ?? null,
    accepted: Boolean(order.acceptedAt),
    amount: Number(order.totalAmount),
    currency: 'INR',
    createdAt: order.createdAt,
  };
}

function toOrderDto(order) {
  const items = order.items.map(toOrderItemDto);
  const subtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
  return {
    ...toOrderSummaryDto(order),
    subtotal,
    // not stored separately — whatever the coupon took off the line totals
    discount: Math.max(subtotal - Number(order.totalAmount), 0),
    vendorAmount: Number(order.vendorAmount),
    platformAmount: Number(order.platformAmount),
    acceptedAt: order.acceptedAt,
    cancelledAt: order.cancelledAt,
    cancelledBy: order.cancelledBy,
    cancelReason: order.cancelReason,
    items,
    address: toOrderAddressDto(order.address),
  };
}

export async function getOrder(userId, orderId) {
  const order = await repository.findByIdForUser(orderId, userId);
  if (!order) throw new NotFoundError('Order not found');
  const shipment = await shipping.getForOrder(orderId);
  return { ...toOrderDto(order), shipment };
}

export async function listOrders(userId) {
  const orders = await repository.listForUser(userId);
  return orders.map(toOrderSummaryDto);
}

export async function listOrdersForVendor(vendorId) {
  const orders = await repository.listForVendor(vendorId);
  return orders.map(toOrderSummaryDto);
}

export async function getOrderForVendor(vendorId, orderId) {
  const order = await repository.findByIdForVendor(orderId, vendorId);
  if (!order) throw new NotFoundError('Order not found');
  return toOrderDto(order);
}

function adminOrderWhere({ status, vendorId, search }) {
  const clauses = [];
  if (status) clauses.push({ status });
  if (vendorId) clauses.push({ vendorId });
  if (search) {
    clauses.push({
      OR: [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { phone: { contains: search } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }
  return clauses.length ? { AND: clauses } : {};
}

function customerName(user) {
  return user.name ?? user.phone ?? user.email ?? 'Customer';
}

export async function listOrdersForAdmin({ page, limit, ...filter }) {
  await expireStaleOrders();
  const where = adminOrderWhere(filter);
  const [rows, total] = await Promise.all([
    repository.listForAdmin(where, { skip: (page - 1) * limit, take: limit }),
    repository.countForAdmin(where),
  ]);
  return {
    items: rows.map((o) => ({
      ...toOrderSummaryDto(o),
      customer: customerName(o.user),
      customerPhone: o.user.phone,
      vendor: o.vendor.storeName,
    })),
    page,
    limit,
    total,
  };
}

export async function getOrderForAdmin(orderId) {
  const order = await repository.findByIdForAdmin(orderId);
  if (!order) throw new NotFoundError('Order not found');
  const shipment = await shipping.getForOrder(orderId);
  return {
    ...toOrderDto(order),
    customer: { id: order.user.id, name: customerName(order.user), phone: order.user.phone, email: order.user.email },
    vendor: order.vendor,
    payments: order.payments.map((p) => ({
      id: p.id,
      status: p.status,
      method: p.method,
      amount: Number(p.amount),
      providerOrderId: p.providerOrderId,
      providerPaymentId: p.providerPaymentId,
      transferStatus: p.transferStatus,
      refunds: p.refunds.map((r) => ({
        id: r.razorpayRefundId,
        status: r.status,
        amount: Number(r.amount),
        createdAt: r.createdAt,
      })),
      createdAt: p.createdAt,
    })),
    shipment,
  };
}

const INVOICEABLE = ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED'];

// invoice data — only for an order that was actually confirmed and not cancelled
// (unpaid orders have nothing to bill; cancelled ones were refunded). userId scopes
// it to the caller's own orders; admin passes none.
export async function getOrderForInvoice(orderId, { userId } = {}) {
  const order = userId ? await repository.findByIdForUser(orderId, userId) : await repository.findByIdForAdmin(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (!INVOICEABLE.includes(order.status)) throw new ConflictError(`No invoice for a ${order.status.toLowerCase()} order`);
  const vendor = await vendorsService.getVendorById(order.vendorId);
  return { order: toOrderDto(order), vendor };
}
