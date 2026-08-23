import { start_mongo } from '$services/mongo.js';
import { globalLimiter, getLimiterForRoute } from '$lib/server/rateLimiter.js';
import { error } from '@sveltejs/kit';

/** @type {import('@sveltejs/kit').ServerInit} */
export async function init() {
  await start_mongo();
}

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
  const { pathname } = event.url;

  // Get the actual host from the request header (not event.url.host which may be overridden)
  const requestHost = event.request.headers.get('host') || '';

  // 1. PRIMARY DOMAIN REDIRECT
  if (requestHost.includes('cipher-arena.fly.dev')) {
    return new Response(null, {
      status: 301,
      headers: {
        Location: `https://www.cipherarena.com${pathname}${event.url.search}`,
        'Cache-Control': 'public, max-age=31536000',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  }

  if (requestHost.includes('www.cipherarena.com')) {
    return new Response(null, {
      status: 301,
      headers: {
        Location: `https://cipherarena.com${pathname}${event.url.search}`,
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  }

  // 2. STATIC ASSET PASS-THROUGH
  if (
    pathname.startsWith('/_app') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api/health') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.js')
  ) {
    return resolve(event);
  }

  // 3. GLOBAL RATE LIMITING
  const globalStatus = await globalLimiter.check(event);
  if (globalStatus.limited) {
    return new Response(
      `Too many requests. Please try again after ${globalStatus.retryAfter} seconds.`,
      {
        status: 429,
        headers: { 'Retry-After': globalStatus.retryAfter.toString() },
      }
    );
  }

  // 4. ROUTE-SPECIFIC RATE LIMITING (FOR POST REQUESTS)
  if (event.request.method === 'POST') {
    const routeLimiter = getLimiterForRoute(pathname);
    if (routeLimiter) {
      const isLimited = await routeLimiter.limiter.isLimited(event);
      if (isLimited) {
        throw error(429, `Too many requests to ${routeLimiter.name} endpoint. Please slow down.`);
      }
    }
  }

  return resolve(event);
}
