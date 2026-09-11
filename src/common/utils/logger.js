import { createRequire } from 'node:module';
import pino from 'pino';
import env from '../../config/env.js';

// pino-pretty is a devDependency, omitted from every deployed build (`npm ci
// --omit=dev`) — and NODE_ENV isn't reliably set to "production" by every
// deploy target this app runs on (Fly worker, serverless functions, ...), so
// checking NODE_ENV alone isn't enough to know it's safe to load. Check
// whether the package actually resolves instead; that's true in local dev
// (full install) and false everywhere pino-pretty was never installed.
const require = createRequire(import.meta.url);
let prettyAvailable = false;
try {
  require.resolve('pino-pretty');
  prettyAvailable = true;
} catch {
  // not installed — plain JSON logs, which pino always supports
}

export default pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: prettyAvailable && env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});
