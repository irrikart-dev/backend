// standalone process for Fly.io — workers only, no Express app.
// the API (Vercel) and this process share nothing but REDIS_URL.
import logger from './common/utils/logger.js';
import './jobs/notification.worker.js';
import './jobs/fulfillment.worker.js';

logger.info('workers listening');
