import { prisma } from '../../config/db.js';

export default {
  findOrderForShipment(orderId) {
    return prisma.order.findUnique({
      where: { id: orderId },
      include: {
        address: true,
        items: { include: { variant: { include: { product: true } } } },
      },
    });
  },

  findByOrderId(orderId) {
    return prisma.shipment.findUnique({ where: { orderId }, include: { trackingEvents: true } });
  },

  // webhook payloads identify a shipment by Shiprocket's own id or the AWB —
  // whichever the payload carries
  findByShiprocketId(shiprocketShipmentId) {
    return prisma.shipment.findUnique({ where: { shiprocketShipmentId } });
  },

  findByAwb(awbNumber) {
    return prisma.shipment.findUnique({ where: { awbNumber } });
  },

  create({ orderId, shiprocketShipmentId }) {
    return prisma.shipment.create({ data: { orderId, shiprocketShipmentId } });
  },

  setAwb(shipmentId, awbNumber) {
    return prisma.shipment.update({ where: { id: shipmentId }, data: { awbNumber } });
  },

  updateStatus(shipmentId, status) {
    return prisma.shipment.update({ where: { id: shipmentId }, data: { status } });
  },

  addTrackingEvent(shipmentId, { status, description, occurredAt }) {
    return prisma.shipmentTrackingEvent.create({
      data: { shipmentId, status, description: description ?? null, occurredAt },
    });
  },
};
