import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// ioredis emits 'error' on every failed connection attempt (DNS failure, connection refused,
// etc.) and keeps retrying in the background by default — an 'error' listener MUST be attached or
// each attempt surfaces as an unhandled event instead of a normal, loggable failure. Dedupe by
// message so a sustained outage logs once, not once per retry.
let lastLoggedError = null;

redis.on('error', (err) => {
  if (err.message === lastLoggedError) return;
  lastLoggedError = err.message;
  console.error('[redis] connection error:', err.message);
});

redis.on('connect', () => {
  if (!lastLoggedError) return;
  console.log('[redis] connection restored');
  lastLoggedError = null;
});

export default redis;
