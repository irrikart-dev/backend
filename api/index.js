// Vercel entrypoint. app.js never calls .listen() itself — Vercel invokes this
// exported handler per request instead of running a persistent server. Local
// dev and the Fly worker each have their own entry (src/server.js, src/worker.js);
// this file exists only so Vercel has one.
export { default } from '../src/app.js';
