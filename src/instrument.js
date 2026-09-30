import * as Sentry from "@sentry/node";
import env from "./config/env.js";

// Must run before express/@prisma/client are imported anywhere in the
// process — both entrypoints (api/index.js, src/server.js) import this
// as their literal first line.
Sentry.init({
  dsn: env.SENTRY_DSN,
  environment: env.NODE_ENV,
  // ponytail: 100% sampling fine at phase-1 traffic; lower if span quota runs out
  tracesSampleRate: 1.0,
});
