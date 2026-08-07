import { readFileSync, writeFileSync } from 'fs';
import { CITIES } from './cities.mjs';

const OUT = '/Users/michaelbenson/golden-window-web/city-climate.json';
const cur = JSON.parse(readFileSync(OUT, 'utf8'));
const sleep = ms => new Promise(s => setTimeout(s, ms));
const MO = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];


async function get(url, waits) {
  for (let a = 0; a < waits.length; a++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); if (r.status === 429 || r.status >= 500) { await sleep(waits[a]); continue; } return null; }
    catch { await sleep(waits[a]); }
  }
  return null;
}
async function om(lat, lon) {
  const j = await get(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2019-01-01&end_date=2024-12-31&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_sum&timezone=auto`, [5000, 15000, 40000, 80000]);
  if (!j || !j.daily) return null;
  const d = j.daily, t = d.time, acc = Array.from({ length: 12 }, () => ({ tmax: 0, tmin: 0, amax: 0, amin: 0, precip: 0, n: 0 }));
  for (let i = 0; i < t.length; i++) {
    const m = parseInt(t[i].slice(5, 7), 10) - 1, tx = d.temperature_2m_max[i], tn = d.temperature_2m_min[i], ax = d.apparent_temperature_max[i], an = d.apparent_temperature_min[i], pr = d.precipitation_sum[i];
    if (tx == null || tn == null || ax == null || an == null) continue;
    const a = acc[m]; a.tmax += tx; a.tmin += tn; a.amax += ax; a.amin += an; a.precip += (pr == null ? 0 : pr); a.n++;
  }
  return acc.map(a => a.n ? { tMaxC: a.tmax / a.n, tMinC: a.tmin / a.n, feelsMaxC: a.amax / a.n, feelsMinC: a.amin / a.n, precipMMday: a.precip / a.n } : null);
}
async function nasa(lat, lon) {
  const j = await get(`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=RH2M,CLOUD_AMT&community=RE&latitude=${lat}&longitude=${lon}&format=JSON`, [4000, 12000, 30000, 60000]);
  const p = j && j.properties ? j.properties.parameter : null;
  if (!p) return null;
  return MO.map(m => ({ rh: p.RH2M && p.RH2M[m] > -900 ? p.RH2M[m] : 65, cloud: p.CLOUD_AMT && p.CLOUD_AMT[m] > -900 ? p.CLOUD_AMT[m] : 45 }));
}

const missing = CITIES.filter(([name]) => !cur[name] || !cur[name][7] || cur[name][7].feelsMaxC == null);
console.log('filling:', missing.map(c => c[0]).join(', '));
for (const [name, lat, lon] of missing) {
  const o = await om(lat, lon); await sleep(500);
  const nz = await nasa(lat, lon); await sleep(500);
  if (!o) { console.log(name, 'OM FAIL'); continue; }
  cur[name] = o.map((x, m) => {
    if (!x) return null;
    const n = (nz && nz[m]) || { rh: 65, cloud: 45 };
    return { feelsMaxC: x.feelsMaxC, feelsMinC: x.feelsMinC, tMaxC: x.tMaxC, tMinC: x.tMinC, daytimeFeelsC: x.feelsMaxC * 0.62 + x.feelsMinC * 0.38, precipMMday: x.precipMMday, rh: n.rh, cloud: n.cloud };
  });
  console.log(name, 'ok');
}
writeFileSync(OUT, JSON.stringify(cur));
console.log('done. cities ok:', Object.values(cur).filter(x => x && x[7] && x[7].feelsMaxC != null).length + '/57');
