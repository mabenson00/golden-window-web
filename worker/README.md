# Golden Window — archive cache proxy (Cloudflare Worker)

A tiny edge cache in front of Open-Meteo's historical archive API. It fetches
each place's history **once**, caches it at Cloudflare's edge (historical data
never changes, so it's cached ~forever), and serves every visitor from that
cache. Result: Open-Meteo is hit about once per city instead of once per user,
so the free-tier **daily request limit stops being a problem**.

- `archive-proxy.js` — the whole Worker (~35 lines).
- `wrangler.toml` — config for the CLI deploy method.

The app (`weather.js`) already tries this proxy first and **falls back to
calling Open-Meteo directly** if the proxy is unset or unreachable — so nothing
breaks before/without it.

---

## Deploy it (pick one method)

### Method A — Cloudflare dashboard (no CLI, ~10 min)

1. Go to **dash.cloudflare.com** and sign up / log in (free).
2. Left sidebar → **Workers & Pages** → **Create application** → **Create Worker**.
3. Name it **`gw-archive-proxy`** → **Deploy** (this makes a placeholder worker).
4. Click **Edit code**, delete the sample, and **paste the entire contents of
   `archive-proxy.js`** → **Deploy**.
5. Copy the worker URL shown at the top — it looks like
   `https://gw-archive-proxy.YOUR-SUBDOMAIN.workers.dev`.

### Method B — Wrangler CLI (~5 min)

```bash
cd worker
npx wrangler login       # opens a browser to authorize
npx wrangler deploy      # prints the worker URL when done
```

---

## Point the app at it

In `weather.js`, set the proxy constant (leave the trailing `/v1/archive`):

```js
const ARCHIVE_PROXY = 'https://gw-archive-proxy.YOUR-SUBDOMAIN.workers.dev/v1/archive';
```

Then bump the `?v=` in `index.html` (styles + app + internal imports), commit,
and push. (Or just send me the worker URL and I'll wire it up and bump.)

---

## Check it's working

Open a Plan for a place you haven't viewed. In DevTools → Network, the archive
request should go to your `workers.dev` URL and carry an **`X-GW-Cache`** header
(`MISS` the first time, `HIT` after). The second visitor to that city gets a
`HIT` instantly, with no Open-Meteo call.

## Optional hardening

- Lock CORS to your site: in `archive-proxy.js`, change
  `'Access-Control-Allow-Origin': '*'` to `'https://thegoldenwindow.app'`
  (note: this only affects browsers; direct calls ignore CORS).
- Free tier allows 100k Worker requests/day — far more than enough.
