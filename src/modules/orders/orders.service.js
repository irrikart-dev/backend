import { randomBytes } from 'node:crypto';
import repository from './orders.repository.js';
import { prisma } from '../../config/db.js';
import cartRepository from '../cart/cart.repository.js';
import * as inventory from '../inventory/inventory.service.js';
import * as discounts from '../discounts/discounts.service.js';
import * as payments from '../payments/payments.service.js';
import { BadRequestError, ConflictError } from '../../common/errors/AppError.js';

function available(variant) {
  return variant.stock - variant.reserved;
}

function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `ORD-${date}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export async function checkout(userId, { couponCode } = {}) {
  const cart = await cartRepository.findActiveCartWithItems(userId);
  if (!cart || cart.items.length === 0) throw new BadRequestError('Cart is empty');

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
  const orderNumber = generateOrderNumber();

  // gateway call stays outside the DB transaction: Payment.providerOrderId is unique and
  // non-nullable, so it must exist before Payment can be created, and keeping this network
  // call out of the transaction means a gateway outage never leaves a half-reserved order
  const providerOrder = await payments.createPaymentOrder({ amount: totalAmount, receipt: orderNumber });

  const { order } = await prisma.$transaction(async (tx) => {
    const createdOrder = await repository.createOrder({ orderNumber, userId, totalAmount, items: lineItems }, tx);

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

  // outside the transaction: if this fails after commit, the cart is merely stale, harmless
  await cartRepository.deleteAllCartItems(cart.id);

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amount: totalAmount,
    currency: 'INR',
    providerOrderId: providerOrder.id,
    ...payments.getClientConfig(),
  };
}
