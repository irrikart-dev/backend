import repository from './returns.repository.js';
import env from '../../config/env.js';
import { prisma } from '../../config/db.js';
import * as inventory from '../inventory/inventory.service.js';
import * as payments from '../payments/payments.service.js';
import { uploadImage } from '../admin/admin.service.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/AppError.js';

// A return is one request per order covering some or all of its lines.
// REQUESTED → APPROVED (pickup arranged) → COMPLETED (goods back: restocked, refunded);
// staff may also complete straight from REQUESTED, or reject either open state.
// ponytail: reverse pickup is arranged by staff outside the app — book it through
// Shiprocket's return-order API here if volume makes that worth automating.

const OPEN = ['REQUESTED', 'APPROVED'];
const DAY_MS = 24 * 3600 * 1000;

/** When the customer's return window closes — null unless the order was delivered. */
export function returnableUntil(order) {
  if (order.status !== 'DELIVERED') return null;
  const from = order.deliveredAt ?? order.createdAt;
  return new Date(from.getTime() + env.RETURN_WINDOW_DAYS * DAY_MS);
}

// units of each order line already claimed by a return that wasn't rejected
function claimedQuantities(order, { onlyCompletedReturns = false } = {}) {
  const claimed = new Map();
  for (const r of order.returns) {
    if (onlyCompletedReturns ? r.status !== 'COMPLETED' || r.type !== 'RETURN' : r.status === 'REJECTED') continue;
    for (const i of r.items) claimed.set(i.orderItemId, (claimed.get(i.orderItemId) ?? 0) + i.quantity);
  }
  return claimed;
}

// goods value the customer actually paid for
const goodsPaid = (order) => Number(order.totalAmount) - Number(order.shippingAmount ?? 0);

/** The returned lines' share of what was paid — a coupon discount is spread across lines by value. */
export function proRataRefund(order, lines) {
  const byId = new Map(order.items.map((i) => [i.id, i]));
  const subtotal = order.items.reduce((sum, i) => sum + Number(i.totalPrice), 0);
  const value = lines.reduce((sum, l) => sum + Number(byId.get(l.orderItemId).unitPrice) * l.quantity, 0);
  return subtotal > 0 ? Math.round((value / subtotal) * goodsPaid(order)) : 0;
}

function toDto(r) {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    reason: r.reason,
    details: r.details,
    photoUrls: r.photoUrls,
    adminNote: r.adminNote,
    refundAmount: r.refundAmount == null ? null : Number(r.refundAmount),
    refundStatus: r.refundStatus,
    restocked: r.restocked,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    items: r.items.map((i) => ({
      orderItemId: i.orderItemId,
      quantity: i.quantity,
      name: i.orderItem.variant.product.title,
      sku: i.orderItem.variant.sku,
      image: i.orderItem.variant.product.images?.[0]?.url ?? null,
    })),
  };
}

function toAdminDto(r, extra = {}) {
  return {
    ...toDto(r),
    order: { ...r.order, totalAmount: Number(r.order.totalAmount) },
    customer: r.user,
    ...extra,
  };
}

// ---- customer ----

export async function uploadPhoto({ buffer, mimeType }) {
  return uploadImage({ buffer, mimeType, folder: 'returns' });
}

export async function requestReturn(userId, { orderId, type, reason, details, photoUrls, items }) {
  const order = await repository.findOrderForReturn(orderId, { userId });
  if (!order) throw new NotFoundError('Order not found');
  const until = returnableUntil(order);
  if (!until) throw new ConflictError('Only a delivered order can be returned');
  if (Date.now() > until.getTime()) {
    throw new ConflictError(`Returns are accepted within ${env.RETURN_WINDOW_DAYS} days of delivery`);
  }
  if (order.returns.some((r) => OPEN.includes(r.status))) {
    throw new ConflictError('A return for this order is already in progress');
  }

  const claimed = claimedQuantities(order);
  const left = (item) => item.quantity - (claimed.get(item.id) ?? 0);
  const lines = items?.length
    ? items
    : order.items.map((i) => ({ orderItemId: i.id, quantity: left(i) })).filter((l) => l.quantity > 0);
  if (!lines.length) throw new ConflictError('Everything on this order has already been returned');

  const byId = new Map(order.items.map((i) => [i.id, i]));
  for (const line of lines) {
    const item = byId.get(line.orderItemId);
    if (!item) throw new BadRequestError('That item is not on this order');
    if (line.quantity > left(item)) throw new BadRequestError(`Only ${left(item)} of that item can still be returned`);
  }
  if (new Set(lines.map((l) => l.orderItemId)).size !== lines.length) {
    throw new BadRequestError('List each item once');
  }

  const row = await repository.create({
    orderId,
    userId,
    type,
    reason,
    details: details || null,
    photoUrls,
    items: lines,
  });
  return toDto(row);
}

export async function listMine(userId) {
  return (await repository.listForUser(userId)).map(toDto);
}

export async function listForOrder(orderId) {
  return (await repository.listForOrder(orderId)).map(toDto);
}

// ---- admin ----

export async function listForAdmin({ status, search, page, limit }) {
  const contains = (field) => ({ [field]: { contains: search, mode: 'insensitive' } });
  const where = {
    ...(status ? { status } : {}),
    ...(search
      ? {
          OR: [
            contains('reason'),
            { order: contains('orderNumber') },
            { user: { OR: ['name', 'phone', 'email'].map(contains) } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    repository.listForAdmin(where, { skip: (page - 1) * limit, take: limit }),
    repository.countForAdmin(where),
  ]);
  return { items: rows.map((r) => toAdminDto(r)), page, limit, total };
}

async function findOrThrow(id) {
  const row = await repository.findById(id);
  if (!row) throw new NotFoundError('Return request not found');
  return row;
}

export async function getForAdmin(id) {
  const row = await findOrThrow(id);
  const order = await repository.findOrderForReturn(row.orderId);
  return toAdminDto(row, { suggestedRefund: row.type === 'RETURN' ? proRataRefund(order, row.items) : 0 });
}

async function decide(id, fromStatuses, data) {
  const row = await findOrThrow(id);
  if (!fromStatuses.includes(row.status)) {
    throw new ConflictError(`This return is already ${row.status.toLowerCase()}`);
  }
  const { count } = await repository.transition(id, fromStatuses, data);
  if (count === 0) throw new ConflictError('This return was just updated — refresh and try again');
  return getForAdmin(id);
}

export function approve(id, { note }) {
  return decide(id, ['REQUESTED'], { status: 'APPROVED', ...(note ? { adminNote: note } : {}) });
}

export function reject(id, { note }) {
  return decide(id, OPEN, { status: 'REJECTED', adminNote: note, resolvedAt: new Date() });
}

/**
 * Goods are back: optionally restock them, refund the customer (pro-rata by default,
 * or `refundAmount` if staff override it), and mark the order RETURNED once every
 * unit on it has come back. COD orders are paid back outside the gateway, so their
 * refund is recorded as "manual".
 */
export async function complete(id, { restock = true, refundAmount, note }) {
  const row = await findOrThrow(id);
  if (!OPEN.includes(row.status)) throw new ConflictError(`This return is already ${row.status.toLowerCase()}`);
  if (row.type === 'REPLACE' && refundAmount) throw new BadRequestError('A replacement is not refunded');

  const order = await repository.findOrderForReturn(row.orderId);
  const amount = row.type === 'RETURN' ? (refundAmount ?? proRataRefund(order, row.items)) : 0;
  if (amount > goodsPaid(order)) throw new BadRequestError(`At most ₹${goodsPaid(order)} can be refunded on this order`);

  await prisma.$transaction(async (tx) => {
    const { count } = await repository.transition(
      id,
      OPEN,
      { status: 'COMPLETED', restocked: restock, resolvedAt: new Date(), ...(note ? { adminNote: note } : {}) },
      tx
    );
    if (count === 0) throw new ConflictError('This return was just updated — refresh and try again');

    if (restock) {
      for (const i of row.items) {
        await inventory.restockReturnedStock(tx, i.orderItem.variantId, i.quantity, { refType: 'return', refId: id });
      }
    }

    if (row.type === 'RETURN') {
      const returned = claimedQuantities(order, { onlyCompletedReturns: true });
      for (const i of row.items) returned.set(i.orderItemId, (returned.get(i.orderItemId) ?? 0) + i.quantity);
      if (order.items.every((i) => (returned.get(i.id) ?? 0) >= i.quantity)) {
        await repository.transitionOrder(order.id, ['DELIVERED'], { status: 'RETURNED' }, tx);
      }
    }
  });

  let refundStatus = null;
  if (amount > 0) {
    if (order.paymentMethod === 'COD') refundStatus = 'manual';
    else refundStatus = (await payments.refundOrder(order.id, { reason: `Return: ${row.reason}`, amount }))?.status ?? 'failed';
    await repository.update(id, { refundAmount: amount, refundStatus });
  }
  return getForAdmin(id);
}

/**
 * The courier brought an undelivered parcel back (RTO): the whole order is returned,
 * its stock goes back on the shelf and a paid online order is refunded in full.
 */
export async function receiveRto(orderId) {
  const order = await repository.findOrderForReturn(orderId);
  if (!order) throw new NotFoundError('Order not found');
  const shipment = await prisma.shipment.findUnique({ where: { orderId } });
  if (!shipment || !['RTO', 'FAILED'].includes(shipment.status)) {
    throw new ConflictError('The courier has not reported this shipment as returned or failed');
  }
  const IN_TRANSIT = ['CONFIRMED', 'PACKED', 'SHIPPED'];
  if (!IN_TRANSIT.includes(order.status)) throw new ConflictError(`A ${order.status.toLowerCase()} order can't be marked as returned`);

  await prisma.$transaction(async (tx) => {
    const { count } = await repository.transitionOrder(orderId, IN_TRANSIT, { status: 'RETURNED' }, tx);
    if (count === 0) throw new ConflictError('This order was just updated — refresh and try again');
    for (const i of order.items) {
      await inventory.restockReturnedStock(tx, i.variantId, i.quantity, { refType: 'rto', refId: orderId });
    }
  });

  const refund =
    order.paymentMethod === 'ONLINE'
      ? await payments.refundOrder(orderId, { reason: 'Returned to origin — not delivered' })
      : null;
  return { orderId, status: 'RETURNED', refundStatus: refund?.status ?? null };
}
