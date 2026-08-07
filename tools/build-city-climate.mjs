import { writeFileSync } from 'fs';

const MO = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const OUT = '/Users/michaelbenson/golden-window-web/city-climate.json';
const sleep = ms => new Promise(s => setTimeout(s, ms));

const CITIES = [["New York",40.7,-74.0],["Los Angeles",34.0,-118.2],["Chicago",41.9,-87.6],["Mexico City",19.4,-99.1],["Vancouver",49.3,-123.1],["Miami",25.8,-80.2],["Denver",39.7,-105.0],["Havana",23.1,-82.4],["Phoenix",33.4,-112.1],["Toronto",43.7,-79.4],["San Francisco",37.8,-122.4],["Sao Paulo",-23.5,-46.6],["Rio de Janeiro",-22.9,-43.2],["Buenos Aires",-34.6,-58.4],["Lima",-12.0,-77.0],["Bogota",4.7,-74.1],["Santiago",-33.4,-70.6],["London",51.5,-0.1],["Paris",48.9,2.4],["Berlin",52.5,13.4],["Madrid",40.4,-3.7],["Rome",41.9,12.5],["Moscow",55.8,37.6],["Istanbul",41.0,28.9],["Barcelona",41.4,2.2],["Lisbon",38.7,-9.1],["Athens",38.0,23.7],["Stockholm",59.3,18.1],["Reykjavik",64.1,-21.9],["Cairo",30.0,31.2],["Lagos",6.5,3.4],["Johannesburg",-26.2,28.0],["Nairobi",-1.3,36.8],["Casablanca",33.6,-7.6],["Cape Town",-33.9,18.4],["Marrakesh",31.6,-8.0],["Dubai",25.2,55.3],["Riyadh",24.7,46.7],["Tehran",35.7,51.4],["Tel Aviv",32.1,34.8],["Tokyo",35.7,139.7],["Beijing",39.9,116.4],["Shanghai",31.2,121.5],["Delhi",28.6,77.2],["Mumbai",19.1,72.9],["Bangkok",13.8,100.5],["Singapore",1.35,103.8],["Hong Kong",22.3,114.2],["Seoul",37.6,127.0],["Jakarta",-6.2,106.8],["Kuala Lumpur",3.1,101.7],["Bengaluru",13.0,77.6],["Kathmandu",27.7,85.3],["Sydney",-33.9,151.2],["Melbourne",-37.8,145.0],["Perth",-31.95,115.9],["Auckland",-36.8,174.8]];

async function fetchCity(lat, lon) {
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,T2M_MAX,T2M_MIN,RH2M,CLOUD_AMT,PRECTOTCORR&community=RE&latitude=${lat}&longitude=${lon}&format=JSON`;
  const waits = [3000, 6000, 12000, 24000, 48000, 90000];
  for (let a = 0; a < waits.length; a++) {
    try { const r = await fetch(url); if (r.ok) return await r.json(); if (r.status === 429 || r.status >= 500) { await sleep(waits[a]); continue; } return null; }
    catch { await sleep(waits[a]); }
  }
  return null;
}
const months = (p, key) => MO.map(m => { const v = p && p[key] ? p[key][m] : null; return v != null && v > -900 ? v : null; });

const out = {};
let ok = 0;
let idx = 0;
async function worker() {
  while (idx < CITIES.length) {
    const [name, lat, lon] = CITIES[idx++];
    const j = await fetchCity(lat, lon);
    const p = j && j.properties ? j.properties.parameter : null;
    if (p) {
      ok++;
      out[name] = MO.map((_, m) => ({
        tmean: months(p, 'T2M')[m], tmax: months(p, 'T2M_MAX')[m], tmin: months(p, 'T2M_MIN')[m],
        rh: months(p, 'RH2M')[m], cloud: months(p, 'CLOUD_AMT')[m], precip: months(p, 'PRECTOTCORR')[m],
      }));
    } else { out[name] = null; }
    console.log(`${idx}/${CITIES.length} ${name} ${p ? 'ok' : 'FAIL'}`);
    await sleep(160);
  }
}
await Promise.all([worker(), worker(), worker()]);
writeFileSync(OUT, JSON.stringify(out));
console.log(`DONE ${ok}/${CITIES.length} -> ${OUT}`);
