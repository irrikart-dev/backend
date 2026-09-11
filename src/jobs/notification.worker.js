import { Worker } from 'bullmq';
import { connection } from '../config/redis.js';
import eventNames from '../events/eventNames.js';
import * as pushChannel from '../modules/notifications/channels/push.channel.js';
import * as emailChannel from '../modules/notifications/channels/email.channel.js';
import logger from '../common/utils/logger.js';

const { ORDER_PLACED, PAYMENT_CONFIRMED, SHIPMENT_STATUS_UPDATED } = eventNames;

// consumes the 'notifications' queue only — best-effort push/email, retries handled
// by the queue's defaultJobOptions, permanent failures land in notifications-dlq
const notificationWorker = new Worker(
  'notifications',
  async (job) => {
    switch (job.name) {
      case ORDER_PLACED:
      case PAYMENT_CONFIRMED:
      case SHIPMENT_STATUS_UPDATED:
        // await pushChannel.send(...);
        // await emailChannel.send(...);
        break;
      default:
        break;
    }
  },
  { connection }
);

notificationWorker.on('failed', (job, err) => logger.error({ job: job?.name, err }, 'notification job failed'));

export default notificationWorker;
