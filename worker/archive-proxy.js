const ORIGIN = 'https://archive-api.open-meteo.com';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function withCors(resp, extra) {
  const r = new Response(resp.body, resp);
  for (const k in CORS) r.headers.set(k, CORS[k]);
  if (extra) for (const k in extra) r.headers.set(k, extra[k]);
  return r;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'GET') return withCors(new Response('Method not allowed', { status: 405 }));

    const url = new URL(request.url);
    if (url.pathname !== '/v1/archive') return withCors(new Response('Not found', { status: 404 }));

    const target = ORIGIN + '/v1/archive' + url.search;
    const cache = caches.default;
    const cacheKey = new Request(target);

    const hit = await cache.match(cacheKey);
    if (hit) return withCors(hit, { 'X-GW-Cache': 'HIT' });

    const origin = await fetch(target);
    if (!origin.ok) return withCors(origin, { 'X-GW-Cache': 'BYPASS' });

    const cached = new Response(origin.body, origin);
    cached.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    ctx.waitUntil(cache.put(cacheKey, cached.clone()));
    return withCors(cached, { 'X-GW-Cache': 'MISS' });
  },
};
