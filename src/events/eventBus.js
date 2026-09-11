import { notificationsQueue, fulfillmentQueue } from './queues.js';

const QUEUES = { notifications: notificationsQueue, fulfillment: fulfillmentQueue };

// modules publish an event onto whichever queue(s) care about it — call publish() once
// per concerned queue when one event has more than one downstream consumer
// e.g. order.placed goes to both 'notifications' (email the customer) and
// 'fulfillment' (create the shipment), as two separate publish calls at the call site
export function publish(queueKey, eventName, payload) {
  return QUEUES[queueKey].add(eventName, payload);
}
