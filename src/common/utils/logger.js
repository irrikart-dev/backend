import pino from 'pino';
import env from '../../config/env.js';

export default pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
});
