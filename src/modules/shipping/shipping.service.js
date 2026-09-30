import repository from './shipping.repository.js';
import * as provider from './providers/shiprocket.provider.js';
import env from '../../config/env.js';
import logger from '../../common/utils/logger.js';

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
 * missing Shipment row is how a failure here shows up, fixable by retrying
 * this function later (no automatic retry built yet).
 */
export async function createShipmentForOrder(orderId) {
  try {
    const order = await repository.findOrderForShipment(orderId);
    if (!order) throw new Error(`Order ${orderId} not found`);
    if (!order.address) throw new Error(`Order ${orderId} has no delivery address`);
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
      payment_method: 'Prepaid', // no COD anywhere in this app — Razorpay only
      sub_total: Number(order.totalAmount),
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
  } catch (err) {
    logger.error({ err, orderId }, 'shiprocket order creation failed');
  }
}

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
  if (mapped) await repository.updateStatus(shipment.id, mapped);
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
