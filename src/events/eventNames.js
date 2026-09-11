// central catalog of cross-module event names — avoids string-literal drift between publishers and consumers
export default {
  ORDER_PLACED: 'order.placed',
  ORDER_CANCELLED: 'order.cancelled',
  PAYMENT_CONFIRMED: 'payment.confirmed',
  PAYMENT_FAILED: 'payment.failed',
  SHIPMENT_CREATED: 'shipment.created',
  SHIPMENT_STATUS_UPDATED: 'shipment.status_updated',
  RETURN_APPROVED: 'return.approved',
  USER_SIGNED_UP: 'user.signed_up',
};
