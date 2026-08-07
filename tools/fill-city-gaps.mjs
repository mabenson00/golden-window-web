import { readFileSync, writeFileSync } from 'fs';

const OUT = '/Users/michaelbenson/golden-window-web/city-climate.json';
const cur = JSON.parse(readFileSync(OUT, 'utf8'));
const sleep = ms => new Promise(s => setTimeout(s, ms));
const MO = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const CITIES = [["New York",40.7,-74.0],["Los Angeles",34.0,-118.2],["Chicago",41.9,-87.6],["Mexico City",19.4,-99.1],["Vancouver",49.3,-123.1],["Miami",25.8,-80.2],["Denver",39.7,-105.0],["Havana",23.1,-82.4],["Phoenix",33.4,-112.1],["Toronto",43.7,-79.4],["San Francisco",37.8,-122.4],["Sao Paulo",-23.5,-46.6],["Rio de Janeiro",-22.9,-43.2],["Buenos Aires",-34.6,-58.4],["Lima",-12.0,-77.0],["Bogota",4.7,-74.1],["Santiago",-33.4,-70.6],["London",51.5,-0.1],["Paris",48.9,2.4],["Berlin",52.5,13.4],["Madrid",40.4,-3.7],["Rome",41.9,12.5],["Moscow",55.8,37.6],["Istanbul",41.0,28.9],["Barcelona",41.4,2.2],["Lisbon",38.7,-9.1],["Athens",38.0,23.7],["Stockholm",59.3,18.1],["Reykjavik",64.1,-21.9],["Cairo",30.0,31.2],["Lagos",6.5,3.4],["Johannesburg",-26.2,28.0],["Nairobi",-1.3,36.8],["Casablanca",33.6,-7.6],["Cape Town",-33.9,18.4],["Marrakesh",31.6,-8.0],["Dubai",25.2,55.3],["Riyadh",24.7,46.7],["Tehran",35.7,51.4],["Tel Aviv",32.1,34.8],["Tokyo",35.7,139.7],["Beijing",39.9,116.4],["Shanghai",31.2,121.5],["Delhi",28.6,77.2],["Mumbai",19.1,72.9],["Bangkok",13.8,100.5],["Singapore",1.35,103.8],["Hong Kong",22.3,114.2],["Seoul",37.6,127.0],["Jakarta",-6.2,106.8],["Kuala Lumpur",3.1,101.7],["Bengaluru",13.0,77.6],["Kathmandu",27.7,85.3],["Sydney",-33.9,151.2],["Melbourne",-37.8,145.0],["Perth",-31.95,115.9],["Auckland",-36.8,174.8]];

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
