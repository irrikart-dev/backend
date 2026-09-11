import { Queue, QueueEvents } from 'bullmq';
import { connection } from '../config/redis.js';
import logger from '../common/utils/logger.js';

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600 },
  removeOnFail: false, // kept until wireDlq below sweeps it into the DLQ
};

// notifications: best-effort side effects (push/email) — cheap to retry, fine to drop
export const notificationsQueue = new Queue('notifications', { connection, defaultJobOptions });

// fulfillment: operational side effects (shipment creation, restocking) — a permanent
// failure here needs a human, not just a log line, hence the DLQ below
export const fulfillmentQueue = new Queue('fulfillment', { connection, defaultJobOptions });

export const notificationsDlq = new Queue('notifications-dlq', { connection });
export const fulfillmentDlq = new Queue('fulfillment-dlq', { connection });

// moves a job into its queue's DLQ once BullMQ has exhausted all retry attempts
function wireDlq(queue, dlq) {
  const events = new QueueEvents(queue.name, { connection });
  events.on('failed', async ({ jobId, failedReason }) => {
    const job = await queue.getJob(jobId);
    if (!job) return;
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return; // retries remain, let BullMQ retry it

    await dlq.add(job.name, { data: job.data, failedReason, originalJobId: jobId });
    logger.error({ queue: queue.name, jobId, failedReason }, 'job exhausted retries, moved to DLQ');
  });
  return events;
}

wireDlq(notificationsQueue, notificationsDlq);
wireDlq(fulfillmentQueue, fulfillmentDlq);
