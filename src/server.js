import app from './app.js';
import env from './config/env.js';
import logger from './common/utils/logger.js';
// workers run as their own process (src/worker.js) on Fly.io, not here

app.listen(env.PORT, () => {
  logger.info(`server listening on port ${env.PORT}`);
});
