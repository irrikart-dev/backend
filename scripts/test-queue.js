// manual smoke test: publish a fake event, watch the worker terminal pick it up.
// run with: node scripts/test-queue.js
import { publish } from '../src/events/eventBus.js';
import eventNames from '../src/events/eventNames.js';

await publish('notifications', eventNames.ORDER_PLACED, { orderId: 'test-123' });
console.log('published order.placed to notifications queue');
process.exit(0);
