import repository from './shipping.repository.js';
import * as provider from './providers/shiprocket.provider.js';
import env from '../../config/env.js';
import * as notifications from '../notifications/notifications.service.js';
import logger from '../../common/utils/logger.js';
import { AppError, ConflictError, NotFoundError } from '../../common/errors/AppError.js';

// Shiprocket's status strings -> our ShipmentStatus enum. Best-effort mapping
// from their documented webhook status values; anything unrecognised keeps
// the shipment's current status rather than guessing wrong.
const STATUS_MAP = {
  'PICKED UP': 'IN_TRANSIT',
  'IN TRANSIT': 'IN_TRANSIT',
  'OUT FOR DELIVERY': 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  RTO: 'RTO',
  'RTO DELIVERED': 'RTO',
  CANCELLED: 'FAILED',
  UNDELIVERED: 'FAILED',
};

/**
 * Creates the Shiprocket order + assigns an AWB for a just-confirmed order.
 * Called from payments.service.captureOrder right after CONFIRMED — never
 * lets a shipping failure surface to the payment-confirmation caller; a
 * missing Shipment row is how a failure here shows up, and staff retry it
 * from the shipping-issues queue (bookShipmentForAdmin).
 */
export async function createShipmentForOrder(orderId) {
  try {
    await bookShipment(orderId);
  } catch (err) {
    logger.error({ err, orderId }, 'shiprocket order creation failed');
  }
}

async function bookShipment(orderId) {
  const order = await repository.findOrderForShipment(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (!order.address) throw new ConflictError('This order has no delivery address');
  if (await repository.findByOrderId(orderId)) return; // already shipped, don't double-create

  const totalWeightKg = order.items.reduce(
    (sum, item) => sum + item.variant.weightKg * item.quantity,
    0
  );
  // Adhoc orders take one package's dimensions, not per-item — using the
  // largest single item's box as a stand-in. Fine for now; revisit if
  // multi-item orders start needing real packed-box dimensions.
  const dims = order.items.reduce(
    (max, item) => ({
      lengthCm: Math.max(max.lengthCm, item.variant.lengthCm),
      widthCm: Math.max(max.widthCm, item.variant.widthCm),
      heightCm: Math.max(max.heightCm, item.variant.heightCm),
    }),
    { lengthCm: 10, widthCm: 10, heightCm: 10 }
  );

  const payload = {
    order_id: order.orderNumber,
    order_date: order.createdAt.toISOString().slice(0, 10),
    pickup_location: env.SHIPROCKET_PICKUP_LOCATION,
    billing_customer_name: order.address.name,
    billing_last_name: '',
    billing_address: order.address.line1,
    billing_address_2: order.address.line2 ?? '',
    billing_city: order.address.city,
    billing_state: order.address.state,
    billing_pincode: order.address.pincode,
    billing_country: 'India',
    billing_phone: order.address.phone,
    shipping_is_billing: true,
    order_items: order.items.map((item) => ({
      name: item.variant.product.title,
      sku: item.variant.sku,
      units: item.quantity,
      selling_price: Number(item.unitPrice),
    })),
    payment_method: order.paymentMethod === 'COD' ? 'COD' : 'Prepaid',
    // items after discount; the delivery fee charged to the customer goes separately
    sub_total: Number(order.totalAmount) - Number(order.shippingAmount ?? 0),
    shipping_charges: Number(order.shippingAmount ?? 0),
    length: dims.lengthCm,
    breadth: dims.widthCm,
    height: dims.heightCm,
    weight: Math.max(totalWeightKg, 0.1),
  };

  const { data } = await provider.createOrder(payload);
  const shiprocketShipmentId = String(data.shipment_id);

  const shipment = await repository.create({ orderId, shiprocketShipmentId });

  try {
    const awbResult = await provider.assignAwb(shiprocketShipmentId);
    const awbNumber = awbResult?.data?.response?.data?.awb_code;
    if (awbNumber) await repository.setAwb(shipment.id, String(awbNumber));
  } catch (err) {
    // order creation succeeded even if AWB assignment didn't — a Shipment
    // row without an AWB is a visible, fixable-later state, not silent data loss
    logger.error({ err, orderId }, 'shiprocket AWB assignment failed');
  }
}

/** Staff retry of a booking that failed at confirmation — unlike createShipmentForOrder, failures reach the caller. */
export async function bookShipmentForAdmin(orderId) {
  try {
    await bookShipment(orderId);
  } catch (err) {
    if (err instanceof AppError) throw err;
    const reason = err?.response?.data?.message || err?.message || 'Unknown courier error';
    logger.error({ err, orderId }, 'shiprocket booking retry failed');
    throw new AppError(`Shiprocket rejected the booking: ${reason}`, 502);
  }
  return getForOrder(orderId);
}

// courier status → the order status it implies; only ever moves an order forward
const ORDER_FROM_COURIER = {
  IN_TRANSIT: { from: ['CONFIRMED', 'PACKED'], to: 'SHIPPED', event: 'ORDER_SHIPPED' },
  DELIVERED: { from: ['CONFIRMED', 'PACKED', 'SHIPPED'], to: 'DELIVERED', event: 'ORDER_DELIVERED' },
};

export async function recordWebhookEvent(payload) {
  const shiprocketShipmentId = payload?.shipment_id ? String(payload.shipment_id) : null;
  const awbNumber = payload?.awb ? String(payload.awb) : null;
  const rawStatus = (payload?.current_status || payload?.status || '').toUpperCase();

  const shipment = shiprocketShipmentId
    ? await repository.findByShiprocketId(shiprocketShipmentId)
    : awbNumber
      ? await repository.findByAwb(awbNumber)
      : null;

  if (!shipment) {
    logger.warn({ payload }, 'shiprocket webhook: no matching shipment');
    return;
  }

  await repository.addTrackingEvent(shipment.id, {
    status: rawStatus || 'UPDATE',
    description: payload?.status_detail ?? payload?.remark ?? null,
    occurredAt: new Date(),
  });

  const mapped = STATUS_MAP[rawStatus];
  if (!mapped) return;
  await repository.updateStatus(shipment.id, mapped);

  const move = ORDER_FROM_COURIER[mapped];
  if (move) {
    const now = new Date();
    const { count } = await repository.advanceOrder(shipment.orderId, move.from, {
      status: move.to,
      ...(move.to === 'DELIVERED' ? { deliveredAt: now } : {}),
    });
    // a parcel on the move was obviously accepted, even if the vendor never clicked it
    await repository.markAcceptedIfUnset(shipment.orderId, now);
    if (count) await notifications.notifyOrderEvent(shipment.orderId, move.event);
  }
}

/** Admin queue: undeliverable parcels (RTO/failed) and paid orders that never got booked. */
export async function listIssuesForAdmin() {
  const [problems, unbooked] = await Promise.all([
    repository.listProblemShipments(),
    // give the async booking at confirmation a few minutes before calling it failed
    repository.listUnbookedOrders(new Date(Date.now() - 10 * 60 * 1000)),
  ]);
  const order = (o) => ({ ...o, totalAmount: Number(o.totalAmount) });
  return {
    shipments: problems.map((s) => ({
      id: s.id,
      status: s.status,
      awbNumber: s.awbNumber,
      lastEvent: s.trackingEvents[0] ?? null,
      order: order(s.order),
      createdAt: s.createdAt,
    })),
    unbooked: unbooked.map(order),
  };
}

export async function getForOrder(orderId) {
  const shipment = await repository.findByOrderId(orderId);
  if (!shipment) return null;
  return {
    status: shipment.status,
    awbNumber: shipment.awbNumber,
    trackingEvents: shipment.trackingEvents
      .sort((a, b) => a.occurredAt - b.occurredAt)
      .map((e) => ({ status: e.status, description: e.description, occurredAt: e.occurredAt })),
  };
}

// ---- pincode serviceability / delivery estimate ----

// ponytail: per-instance memory cache — each serverless instance warms its own. Move to
// a shared store if Shiprocket's rate limit ever bites.
const serviceabilityCache = new Map();
const SERVICEABILITY_TTL_MS = 6 * 3600 * 1000;

async function fetchCouriers({ pincode, weightKg, cod }) {
  if (!env.SHIPROCKET_PICKUP_PINCODE) throw new AppError('Delivery checks are not set up yet', 503);
  try {
    const { data } = await provider.checkServiceability({
      pickup_postcode: env.SHIPROCKET_PICKUP_PINCODE,
      delivery_postcode: pincode,
      weight: weightKg,
      cod: cod ? 1 : 0,
    });
    return {
      couriers: data?.data?.available_courier_companies ?? [],
      recommendedId: data?.data?.recommended_courier_company_id ?? null,
    };
  } catch (err) {
    const status = err.response?.status;
    // Shiprocket answers an unserviceable pincode with a 4xx rather than an empty list
    if (status >= 400 && status < 500 && status !== 401 && status !== 403) return { couriers: [], recommendedId: null };
    logger.error({ err, pincode }, 'shiprocket serviceability check failed');
    throw new AppError('Could not check delivery right now — please try again', 502);
  }
}

/** Can we deliver to this pincode, and roughly when? For the PDP/cart pincode check. */
export async function checkServiceability({ pincode, weightKg, cod }) {
  const key = `${pincode}:${Math.ceil(weightKg)}:${cod}`;
  const hit = serviceabilityCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  const { couriers, recommendedId } = await fetchCouriers({ pincode, weightKg, cod });
  const best =
    couriers.find((c) => c.courier_company_id === recommendedId) ??
    [...couriers].sort((a, b) => Number(a.estimated_delivery_days) - Number(b.estimated_delivery_days))[0];
  const value = {
    pincode,
    serviceable: Boolean(best),
    estimatedDays: best ? Number(best.estimated_delivery_days) || null : null,
    // courier's own date string, e.g. "Oct 24, 2026"
    estimatedDelivery: best?.etd || null,
    codAvailable: couriers.some((c) => Number(c.cod) === 1),
  };
  serviceabilityCache.set(key, { value, expires: Date.now() + SERVICEABILITY_TTL_MS });
  return value;
}

/** Every courier Shiprocket offers for a parcel, cheapest first — what the platform would pay. */
export async function courierRatesForAdmin({ pincode, weightKg, cod }) {
  const { couriers, recommendedId } = await fetchCouriers({ pincode, weightKg, cod });
  return couriers
    .map((c) => ({
      courierId: c.courier_company_id,
      name: c.courier_name,
      rate: Number(c.rate),
      estimatedDays: Number(c.estimated_delivery_days) || null,
      estimatedDelivery: c.etd || null,
      cod: Number(c.cod) === 1,
      recommended: c.courier_company_id === recommendedId,
    }))
    .sort((a, b) => a.rate - b.rate);
}

