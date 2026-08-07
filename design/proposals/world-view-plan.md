# World View — implementation plan

A spin-the-Earth mode where the **land itself is tinted** by how good each place feels to be outside, for *you*, in the selected month — a continuous comfort choropleth over the continents, with a season scrubber, a "best places for you" list, and click-through to the existing month-by-month Plan.

## Guiding principle (this is what makes it cheap)
Separate the **universal weather** from the **personal score**:
- The weather (monthly climate normals per location) is the same for everyone and stable year to year → **precompute once, offline; ship as a static asset.** Zero live API calls for the globe, for anyone.
- The score is personal → **compute client-side in a Web Worker** from those normals, cached per profile. Recompute only when the profile changes.
- Drill-down (click a place) reuses the existing per-city Plan, which already goes through the Cloudflare Worker cache.

Net: one static download (~a few hundred KB) + local math. Nothing touches Open-Meteo at browse time.

---

## 1. Data layer — the precomputed grid

### Variables (must match our scoring inputs)
Per grid cell, per month, we need enough to run the comfort components:
- **Apparent temperature** (daytime representative) — drives the temperature curve + the mugginess heat-gate. Derive from 2m temp + humidity if not available directly.
- **Dew point** (or relative humidity, to derive it) — mugginess.
- **Cloud cover** (or downward solar radiation as a proxy) — sun/sky.
- **Precipitation** — a rain-frequency signal (wet-day fraction or monthly total).

Optional later: wind, a diurnal range (day high vs mean) for a better "daytime" value.

### Resolution
- **~1.5°–2° land-only grid** for the wash (≈ 4,000–8,000 land cells). Smooth enough once the score texture is bilinearly interpolated; small file; fast to score.
- Store land cells only (skip ocean) via a land mask.

### Source (decision to lock — see §9)
Two viable paths:
- **A — Gridded monthly normals (recommended): ERA5 monthly means** (Copernicus CDS, free account). Global, 0.25°, has 2m temp, 2m dew point, total cloud cover, total precipitation — exactly our fields, **no per-point API calls** (download a handful of global rasters, process offline). Downside: needs a CDS account + a NetCDF-reading build script (Python is easiest for the one-off tool).
- **B — Per-point climatology: NASA POWER API.** One small request per grid point returns monthly long-term means (T2M, RH2M, cloud/insolation, precip). ~4–8k small requests, run once offline and throttled. No account/NetCDF, but many requests and we derive dew point + apparent temp from T2M+RH.
- (Not recommended: Open-Meteo archive per-cell — hourly requests are far too heavy at grid scale.)

### Build pipeline (offline, one-time + occasional refresh)
A standalone script (`tools/build-world-normals`) that:
1. Loads the source data (rasters for A, or fetches points for B).
2. Applies the land mask; for each land cell computes the monthly normals + derived fields (dew point from RH, apparent temp).
3. Quantizes to bytes and writes a compact binary: a header (grid bounds, resolution, cell count, index→lat/lon scheme) + per-cell 12×N quantized values.
4. Emits a small `world-normals.meta.json` (version, resolution, variable scaling).

**Output size budget:** ~6,000 cells × 12 months × 4 vars × 1 byte ≈ 290 KB raw → ~100–200 KB gzipped. Shipped as a static asset (browser + CDN cached). **Regenerate rarely** (normals barely move); bump a `dataVersion`.

---

## 2. Scoring layer — client, in a Web Worker

- On first load and on profile change, the worker loads `world-normals.bin` and computes a **climate score (0–10)** per cell per month using the *existing* comfort component functions (temperature curve, hot-gated mugginess, sun/cloud, precip) fed the monthly normals — no hourly resampling, so it's cheap.
- Output: a Float/quantized score array (cells × 12). ~6k×12 ≈ 72k values.
- **Cache in IndexedDB** keyed by `profileHash + dataVersion`. Recompute only when the profile changes. Sub-second in a worker; the main thread never blocks.

---

## 3. Render layer — the land-tint globe

### Score → equirectangular texture
- The worker (or main thread) builds an **equirectangular RGBA image** (e.g., 1024×512) per month: for each texel, bilinearly interpolate the grid score, map score→comfort color, set **alpha 0 over ocean** (land mask). Smooth interpolation gives the continuous wash.
- Keep all 12 month textures cached in memory so scrubbing/animating months is instant. Rebuild on profile change.

### Globe
Two-phase to de-risk:
- **Phase 1 — canvas reproject (ship the look fast):** draw the globe by inverse-projecting screen pixels of the sphere and sampling the equirect texture (at reduced resolution / on a throttled redraw). Proves the choropleth end-to-end with real data. Good enough static; a little janky mid-drag.
- **Phase 2 — minimal WebGL textured sphere (smooth, gorgeous):** a UV-sphere + fragment shader sampling the score texture by lat/lon, plus a subtle ocean, atmosphere rim, and optional day/night terminator. ~100 lines of raw WebGL (no three.js needed), 60fps during drag, GPU-cheap. Cross-fade textures for the season sweep.

### Overlay (2D canvas on top)
- Coastline outlines (or bake into the texture), a faint graticule, **city markers** for pickable detail, hover tooltips, and click picking (using the same orthographic math). The dots read as "pins" over the wash; the wash gives the at-a-glance picture.

---

## 4. Feature & UX scope
- **Placement:** a new top-level **"Explore"** mode (or an "Explore the world" entry from the Plan screen). TBD (§9).
- **Interactions:** drag to spin (no auto-rotate), month scrubber with a **season cross-fade** animation, hover a place → score, **click → the existing city Plan** (real 6-year data via the Worker cache).
- **Best places for you · this month:** ranked list from a curated city set scored the same way — instant travel inspiration; click flies the globe there.
- **Personalization:** the whole globe is tuned to the user's profile; two users see two globes. Great onboarding/share hook ("your world in July").
- **Skin:** dark "space" reads best for a globe; offer a light variant to match the app, or keep Explore intentionally darker as a distinct mode.

---

## 5. Caching & rate-limit story (explicit)
- Globe: **zero live calls** — static normals asset + local scoring + cached month textures.
- Per-user scores: computed once per profile change, cached in IndexedDB.
- Drill-down: the existing per-city Worker cache (fetched once per city, shared).
- Only offline cost is the one-time data build; only per-user network cost is the ~150 KB normals download (cached).

---

## 6. Phased delivery
- **P0 — Data:** lock the source (§9), build `world-normals.bin` + meta, validate a few known cities against the Plan. *(The main effort.)*
- **P1 — Choropleth MVP:** worker scoring + equirect texture + canvas-reproject globe + month scrubber. Prove the look with real data, one skin.
- **P2 — WebGL globe:** smooth textured sphere, season cross-fade, atmosphere.
- **P3 — Overlay + drill-down:** city markers, hover/click → Plan, "best places for you."
- **P4 — Polish & ship:** light/dark skin, mobile/touch, accessibility, perf pass, integrate into nav + SEO.

---

## 7. Risks & mitigations
- **Data source friction (ERA5/CDS + NetCDF).** Mitigate: fall back to NASA POWER per-point (no account/NetCDF) at coarser grid; or a one-off Python build tool just for ingest.
- **Globe score ≠ Plan score (normals vs 6-yr hourly).** It's a discovery approximation by design; the click-through Plan is the source of truth. Calibrate the climate-score so bands roughly agree for sample cities.
- **WebGL adds a rendering path.** Mitigate: P1 canvas-reproject ships without it; WebGL is an upgrade, with canvas fallback for old devices.
- **Score saturation / poor spread.** Tune the climate-score curve so the top differentiates (the prototype's flat 9.6s were the fake model).
- **Bundle/dep creep** (app is intentionally tiny/vanilla). Mitigate: self-host any coastline/geo data; raw WebGL instead of three.js; the whole feature can be lazy-loaded only when Explore opens.

---

## 8. Rough effort
- P0 data pipeline: the biggest single chunk (source wrangling + build script + validation).
- P1 choropleth MVP: moderate.
- P2 WebGL: moderate.
- P3 overlay + drill-down: small–moderate (reuses Plan + Worker).
- P4 polish: moderate.

---

## 9. Decisions to lock before building
1. **Data source:** ERA5 gridded (recommended, needs CDS + build tool) vs NASA POWER per-point (simpler, more requests). 
2. **Grid resolution:** 1.5° vs 2° (size/detail trade-off).
3. **Placement:** new "Explore" tab vs entry from Plan.
4. **Skin:** dark-only Explore vs light variant to match the app.
5. **Render target for P1:** ship canvas-reproject first (recommended) vs jump straight to WebGL.
