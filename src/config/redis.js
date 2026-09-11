import IORedis from 'ioredis';
import env from './env.js';

// shared connection for BullMQ queues/workers across all modules.
// Upstash requires TLS — REDIS_URL must use rediss:// (not redis://), ioredis
// enables TLS automatically from that scheme, no extra config needed.
export const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
