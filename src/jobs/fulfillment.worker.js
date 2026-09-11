import { Worker } from 'bullmq';
import { connection } from '../config/redis.js';
import eventNames from '../events/eventNames.js';
import * as shiprocket from '../modules/shipping/providers/shiprocket.provider.js';
import logger from '../common/utils/logger.js';

const { ORDER_PLACED, RETURN_APPROVED } = eventNames;

// consumes the 'fulfillment' queue only — operational side effects where a permanent
// failure is a real incident, not best-effort; exhausted retries land in fulfillment-dlq
// and belong on an alert, not just a log line
const fulfillmentWorker = new Worker(
  'fulfillment',
  async (job) => {
    switch (job.name) {
      case ORDER_PLACED:
        // await shiprocket.createOrder(...) for the order
        break;
      case RETURN_APPROVED:
        // restock inventory
        break;
      default:
        break;
    }
  },
  { connection }
);

fulfillmentWorker.on('failed', (job, err) => logger.error({ job: job?.name, err }, 'fulfillment job failed'));

export default fulfillmentWorker;
