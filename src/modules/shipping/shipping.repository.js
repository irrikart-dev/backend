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

  // courier feed moves the order along — compare-and-set so a manual move wins any race
  advanceOrder(orderId, fromStatuses, data) {
    return prisma.order.updateMany({ where: { id: orderId, status: { in: fromStatuses } }, data });
  },

  markAcceptedIfUnset(orderId, at) {
    return prisma.order.updateMany({ where: { id: orderId, acceptedAt: null }, data: { acceptedAt: at } });
  },

  // admin "shipping issues" queue: parcels the courier couldn't deliver
  listProblemShipments() {
    return prisma.shipment.findMany({
      where: { status: { in: ['RTO', 'FAILED'] }, order: { status: { in: ['CONFIRMED', 'PACKED', 'SHIPPED'] } } },
      include: {
        order: { select: { id: true, orderNumber: true, status: true, paymentMethod: true, totalAmount: true } },
        trackingEvents: { orderBy: { occurredAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },

  // paid orders whose Shiprocket booking never happened (createShipmentForOrder failed)
  listUnbookedOrders(placedBefore) {
    return prisma.order.findMany({
      where: { status: { in: ['CONFIRMED', 'PACKED'] }, shipment: null, createdAt: { lt: placedBefore } },
      select: { id: true, orderNumber: true, status: true, paymentMethod: true, totalAmount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
  },

  addTrackingEvent(shipmentId, { status, description, occurredAt }) {
    return prisma.shipmentTrackingEvent.create({
      data: { shipmentId, status, description: description ?? null, occurredAt },
    });
  },
};
