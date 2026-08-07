import { writeFileSync } from 'fs';

const MO = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const STEP = 5, LAT_MIN = -55, LAT_MAX = 75, LON_MIN = -180, LON_MAX = 175;
const ROWS = Math.round((LAT_MAX - LAT_MIN) / STEP) + 1;
const COLS = Math.round((LON_MAX - LON_MIN) / STEP) + 1;
const N = ROWS * COLS;
const t = new Float32Array(N * 12).fill(NaN), rh = new Float32Array(N * 12).fill(NaN), cl = new Float32Array(N * 12).fill(NaN), pr = new Float32Array(N * 12).fill(NaN);
const sleep = ms => new Promise(s => setTimeout(s, ms));

function pointInRing(x, y, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside; } return inside; }
function pointInPoly(x, y, poly) { if (!pointInRing(x, y, poly[0])) return false; for (let k = 1; k < poly.length; k++) if (pointInRing(x, y, poly[k])) return false; return true; }
let landFeats = [];
function isLand(lon, lat) { for (const f of landFeats) { const g = f.geometry; if (g.type === 'Polygon') { if (pointInPoly(lon, lat, g.coordinates)) return true; } else if (g.type === 'MultiPolygon') { for (const poly of g.coordinates) if (pointInPoly(lon, lat, poly)) return true; } } return false; }

async function fetchPoint(lat, lon) {
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,RH2M,CLOUD_AMT,PRECTOTCORR&community=RE&latitude=${lat}&longitude=${lon}&format=JSON`;
  const waits = [4000, 8000, 16000, 32000, 60000, 90000, 120000, 120000];
  for (let a = 0; a < waits.length; a++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); if (r.status === 429 || r.status >= 500) { await sleep(waits[a]); continue; } return null; }
    catch { await sleep(waits[a]); }
  }
  return null;
}
function store(arr, base, param) { if (!param) return; for (let m = 0; m < 12; m++) { const v = param[MO[m]]; if (v != null && v > -900) arr[base + m] = v; } }

const land = await fetch('https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/110m/physical/ne_110m_land.json').then(r => r.json());
landFeats = land.features;
const cells = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const lat = LAT_MIN + r * STEP, lon = LON_MIN + c * STEP; if (isLand(lon, lat)) cells.push([r, c, lat, lon]); }
console.log(`land cells: ${cells.length} / ${N} (grid ${ROWS}x${COLS} @ ${STEP} deg)`);

let idx = 0, done = 0, ok = 0;
async function worker() {
  while (idx < cells.length) {
    const [r, c, lat, lon] = cells[idx++];
    const j = await fetchPoint(lat, lon);
    done++;
    if (j && j.properties && j.properties.parameter) { ok++; const p = j.properties.parameter, base = (r * COLS + c) * 12; store(t, base, p.T2M); store(rh, base, p.RH2M); store(cl, base, p.CLOUD_AMT); store(pr, base, p.PRECTOTCORR); }
    if (done % 40 === 0 || done === cells.length) console.log(`cell ${done}/${cells.length} (ok ${ok})`);
    await sleep(180);
  }
}
await Promise.all([worker(), worker(), worker()]);

const q = (arr, scale) => Array.from(arr, v => Number.isNaN(v) ? -999 : Math.round(v * scale));
const out = { meta: { latMin: LAT_MIN, latMax: LAT_MAX, lonMin: LON_MIN, lonMax: LON_MAX, step: STEP, rows: ROWS, cols: COLS, months: 12, scale: { t: 10, rh: 1, cloud: 1, precip: 100 }, source: 'NASA POWER climatology' }, t: q(t, 10), rh: q(rh, 1), cloud: q(cl, 1), precip: q(pr, 100) };
writeFileSync('/Users/michaelbenson/golden-window-web/world-normals.json', JSON.stringify(out));
let filled = 0; for (const v of t) if (!Number.isNaN(v)) filled++;
console.log(`DONE. cells ok ${ok}/${cells.length}, temp filled ${filled}/${N * 12}`);
