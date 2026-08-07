import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { climateComfort, dewPointF, band, sensibleDefault } from '../scoring.js';

const ROOT = '/Users/michaelbenson/golden-window-web';
const ORIGIN = 'https://thegoldenwindow.app';
const STYLES_V = 52, SCORING_V = 44, CITYJS_V = 2;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MSHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CITIES = [["New York",40.7,-74.0],["Los Angeles",34.0,-118.2],["Chicago",41.9,-87.6],["Mexico City",19.4,-99.1],["Vancouver",49.3,-123.1],["Miami",25.8,-80.2],["Denver",39.7,-105.0],["Havana",23.1,-82.4],["Phoenix",33.4,-112.1],["Toronto",43.7,-79.4],["San Francisco",37.8,-122.4],["Sao Paulo",-23.5,-46.6],["Rio de Janeiro",-22.9,-43.2],["Buenos Aires",-34.6,-58.4],["Lima",-12.0,-77.0],["Bogota",4.7,-74.1],["Santiago",-33.4,-70.6],["London",51.5,-0.1],["Paris",48.9,2.4],["Berlin",52.5,13.4],["Madrid",40.4,-3.7],["Rome",41.9,12.5],["Moscow",55.8,37.6],["Istanbul",41.0,28.9],["Barcelona",41.4,2.2],["Lisbon",38.7,-9.1],["Athens",38.0,23.7],["Stockholm",59.3,18.1],["Reykjavik",64.1,-21.9],["Cairo",30.0,31.2],["Lagos",6.5,3.4],["Johannesburg",-26.2,28.0],["Nairobi",-1.3,36.8],["Casablanca",33.6,-7.6],["Cape Town",-33.9,18.4],["Marrakesh",31.6,-8.0],["Dubai",25.2,55.3],["Riyadh",24.7,46.7],["Tehran",35.7,51.4],["Tel Aviv",32.1,34.8],["Tokyo",35.7,139.7],["Beijing",39.9,116.4],["Shanghai",31.2,121.5],["Delhi",28.6,77.2],["Mumbai",19.1,72.9],["Bangkok",13.8,100.5],["Singapore",1.35,103.8],["Hong Kong",22.3,114.2],["Seoul",37.6,127.0],["Jakarta",-6.2,106.8],["Kuala Lumpur",3.1,101.7],["Bengaluru",13.0,77.6],["Kathmandu",27.7,85.3],["Sydney",-33.9,151.2],["Melbourne",-37.8,145.0],["Perth",-31.95,115.9],["Auckland",-36.8,174.8]];

const nrm = JSON.parse(readFileSync(`${ROOT}/world-normals.json`, 'utf8'));
const M = nrm.meta, sc = M.scale;
const cellIndex = (lat, lon) => { const r = Math.round((lat - M.latMin) / M.step), c = Math.round((lon - M.lonMin) / M.step); if (r < 0 || r >= M.rows || c < 0 || c >= M.cols) return -1; return r * M.cols + c; };
function normalsFor(lat, lon, m) {
  const get = (la, lo) => { const j = cellIndex(la, lo); if (j < 0) return null; const b = j * 12 + m; if (nrm.t[b] <= -900) return null; return { tempC: nrm.t[b] / sc.t, rh: nrm.rh[b] / sc.rh, cloudPct: nrm.cloud[b] / sc.cloud, precipMMday: nrm.precip[b] / sc.precip }; };
  let n = get(lat, lon);
  for (let rad = 1; rad <= 3 && !n; rad++) for (let dr = -rad; dr <= rad && !n; dr++) for (let dc = -rad; dc <= rad && !n; dc++) n = get(lat + dr * M.step, lon + dc * M.step);
  return n;
}

const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clsOf = s => band(s).toLowerCase();
const f = c => Math.round(c * 9 / 5 + 32);
const tempWord = F => F < 38 ? 'cold' : F < 52 ? 'cool' : F < 66 ? 'mild' : F < 78 ? 'warm' : F < 90 ? 'hot' : 'very hot';
const skyWord = cl => cl < 25 ? 'mostly sunny' : cl < 50 ? 'partly cloudy' : cl < 75 ? 'often cloudy' : 'mostly overcast';
const skyShort = cl => cl < 25 ? 'Mostly sunny' : cl < 50 ? 'Partly cloudy' : cl < 75 ? 'Often cloudy' : 'Overcast';
const humShort = (F, d) => F < 70 || d < 58 ? 'Comfortable' : d < 66 ? 'A little humid' : d < 72 ? 'Muggy' : 'Oppressive';
const rainShort = mm => mm < 1 ? 'Rare' : mm < 3 ? 'Occasional' : mm < 6 ? 'Regular' : 'Frequent';
const rainClause = mm => mm < 1 ? 'very little rain' : mm < 3 ? 'the odd shower' : mm < 6 ? 'a fair bit of rain' : 'frequent rain';
const humClause = (F, d) => F < 70 || d < 58 ? 'comfortable humidity' : d < 66 ? 'a touch of humidity' : d < 72 ? 'muggy air' : 'oppressive humidity';
const verdict = s => s >= 8 ? 'a great time to be outside' : s >= 7 ? 'a good time to be out' : s >= 5 ? 'a decent time to visit' : s >= 3 ? 'a tougher month to be outside' : 'a rough month to be outside';

function summary(city, monthName, n, s) {
  const F = f(n.tempC), d = dewPointF(n.tempC, n.rh);
  return `${monthName} in ${city} is typically ${tempWord(F)} and ${skyWord(n.cloudPct)}, with ${humClause(F, d)} and ${rainClause(n.precipMMday)} — ${verdict(s)}.`;
}

const scoreCache = {};
function monthScores(city, lat, lon) {
  const key = city;
  if (scoreCache[key]) return scoreCache[key];
  const arr = MONTHS.map((_, m) => {
    const n = normalsFor(lat, lon, m);
    const s = n ? climateComfort(n, sensibleDefault) : null;
    return { n, s: s == null ? null : s };
  });
  scoreCache[key] = arr;
  return arr;
}

function head(title, desc, canonical) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canonical}"><meta property="og:site_name" content="Golden Window">
<meta name="theme-color" content="#F6F8FC"><meta name="color-scheme" content="light">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/styles.css?v=${STYLES_V}"></head><body>`;
}
function topbar() {
  return `<div class="cp-wrap"><div class="cp-top"><a class="cp-brand" href="/"><img src="/icon.svg" alt="">Golden Window</a><a class="cp-open" href="/#/today">Open the app →</a></div>`;
}
function foot() {
  return `<div class="cp-foot">Scores are a typical, sensible-default read from long-term climate normals (NASA POWER) — not a forecast, and personal to your own comfort once you set your preferences in the app. Weather history by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> and NASA POWER.</div></div></body></html>`;
}

function nearest(lat, lon, n) {
  const cl = Math.cos(lat * Math.PI / 180);
  return CITIES.map(c => ({ c, d: Math.pow((c[2] - lon) * cl, 2) + Math.pow(c[1] - lat, 2) })).filter(x => x.c[0] !== undefined).sort((a, b) => a.d - b.d).slice(1, n + 1).map(x => x.c);
}

let pageCount = 0;
const urls = [`${ORIGIN}/weather/`];

function writePage(path, html) { mkdirSync(path.replace(/\/index\.html$/, ''), { recursive: true }); writeFileSync(path, html); pageCount++; }

function monthPage(city, lat, lon, mi, scores) {
  const cs = slug(city), ms = MONTHS[mi].toLowerCase(), monthName = MONTHS[mi];
  const { n, s } = scores[mi];
  if (n == null || s == null) return;
  const cls = clsOf(s), F = f(n.tempC), d = dewPointF(n.tempC, n.rh);
  const title = `Weather in ${city} in ${monthName} — is it a good time to visit?`;
  const desc = `What's the weather like in ${city} in ${monthName}? Typically ${tempWord(F)} and ${skyWord(n.cloudPct)}, scoring ${s.toFixed(1)}/10 for being outside. See the month-by-month and day-by-day plan.`;
  const canonical = `${ORIGIN}/weather/${cs}/${ms}/`;
  const strip = MONTHS.map((mn, j) => {
    const sj = scores[j].s;
    return `<a class="cp-mo${j === mi ? ' on' : ''}" href="/weather/${cs}/${mn.toLowerCase()}/"><span class="m">${MSHORT[j]}</span><span class="s c-${sj == null ? 'muted' : clsOf(sj)}">${sj == null ? '–' : sj.toFixed(1)}</span></a>`;
  }).join('');
  const near = nearest(lat, lon, 6).map(c => `<a href="/weather/${slug(c[0])}/${ms}/">${esc(c[0])} in ${monthName}</a>`).join('');
  const data = JSON.stringify({ city, slug: cs, lat, lon, monthIndex: mi, monthName, normals: n, allNormals: scores.map(x => x.n) });
  const ld = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{ "@type": "Question", "name": `Is ${monthName} a good time to visit ${city}?`, "acceptedAnswer": { "@type": "Answer", "text": summary(city, monthName, n, s) } }] });
  const html = head(title, desc, canonical) + topbar() +
    `<nav class="cp-crumb"><a href="/weather/">Weather</a> · <a href="/weather/${cs}/">${esc(city)}</a> · ${monthName}</nav>
<h1 class="cp-h1">Weather in ${esc(city)} in ${monthName}</h1>
<p class="cp-lede">How good it typically feels to be outside in ${esc(city)} during ${monthName}, scored from long-term climate normals for a sensible default comfort. Sign in to the app and it tunes to you.</p>
<div class="cp-hero">
  <div class="cp-scorebox">
    <div class="cp-score c-${cls}"><span class="cs-num">${s.toFixed(1)}</span><span class="cs-of">/ 10</span></div>
    <div class="cp-band c-${cls}">${band(s)}</div>
    <div class="cp-tag">Typical ${monthName} · sensible defaults</div>
  </div>
  <div class="cp-expect">
    <div class="cp-erow"><span class="k">Average temperature</span><span class="v">${F}°F / ${Math.round(n.tempC)}°C</span></div>
    <div class="cp-erow"><span class="k">Sky</span><span class="v">${skyShort(n.cloudPct)}</span></div>
    <div class="cp-erow"><span class="k">Humidity</span><span class="v">${humShort(F, d)}</span></div>
    <div class="cp-erow"><span class="k">Rain</span><span class="v">${rainShort(n.precipMMday)}</span></div>
  </div>
</div>
<p class="cp-summary">${summary(city, monthName, n, s)}</p>
<div class="cp-mtitle">${esc(city)} — every month</div>
<div class="cp-months">${strip}</div>
<a class="cp-cta" id="cp-cta" href="/#/plan">See the full day-by-day plan for ${esc(city)} →</a>
<div class="cp-sec cp-links"><h2>${monthName} in other cities</h2>${near}</div>
<script id="gw-data" type="application/json">${data}</script>
<script type="application/ld+json">${ld}</script>
<script type="module" src="/city-page.js?v=${CITYJS_V}"></script>` + foot();
  writePage(`${ROOT}/weather/${cs}/${ms}/index.html`, html);
  urls.push(canonical);
}

function cityHub(city, lat, lon, scores) {
  const cs = slug(city);
  const valid = scores.map((x, i) => ({ i, s: x.s })).filter(x => x.s != null).sort((a, b) => b.s - a.s);
  const bestList = valid.slice(0, 3).map(x => MONTHS[x.i]).join(', ');
  const title = `${city} weather by month — the best time to visit | Golden Window`;
  const desc = `Month-by-month weather in ${city}: how good each month typically feels to be outside. Best months: ${bestList}. Pick the best time to visit.`;
  const canonical = `${ORIGIN}/weather/${cs}/`;
  const rows = MONTHS.map((mn, j) => {
    const sj = scores[j].s;
    return `<a class="cp-mo" href="/weather/${cs}/${mn.toLowerCase()}/"><span class="m">${MSHORT[j]}</span><span class="s c-${sj == null ? 'muted' : clsOf(sj)}">${sj == null ? '–' : sj.toFixed(1)}</span></a>`;
  }).join('');
  const html = head(title, desc, canonical) + topbar() +
    `<nav class="cp-crumb"><a href="/weather/">Weather</a> · ${esc(city)}</nav>
<h1 class="cp-h1">${esc(city)} weather, month by month</h1>
<p class="cp-lede">How good it typically feels to be outside in ${esc(city)} across the year, scored from long-term climate normals. The best months to visit are usually <b>${bestList}</b>. Tap a month for the detail.</p>
<div class="cp-months">${rows}</div>
<a class="cp-cta" href="/#/plan" onclick="try{localStorage.setItem('gw.planloc',JSON.stringify({lat:${lat},lon:${lon},name:'${esc(city).replace(/'/g, "\\'")}'}))}catch(e){}">See the full day-by-day plan for ${esc(city)} →</a>
<div class="cp-sec cp-links"><h2>More cities</h2>${nearest(lat, lon, 8).map(c => `<a href="/weather/${slug(c[0])}/">${esc(c[0])}</a>`).join('')}</div>
<script id="gw-data" type="application/json">${JSON.stringify({ city, slug: cs, lat, lon, monthIndex: 0, normals: null, allNormals: scores.map(x => x.n) })}</script>
<script type="module" src="/city-page.js?v=${CITYJS_V}"></script>` + foot();
  writePage(`${ROOT}/weather/${cs}/index.html`, html);
  urls.push(canonical);
}

function indexHub() {
  const title = `Weather by city and month — best time to visit anywhere | Golden Window`;
  const desc = `Browse how good the weather typically feels to be outside in ${CITIES.length} cities, month by month, and find the best time to visit.`;
  const canonical = `${ORIGIN}/weather/`;
  const sorted = [...CITIES].sort((a, b) => a[0].localeCompare(b[0]));
  const links = sorted.map(c => `<a href="/weather/${slug(c[0])}/">${esc(c[0])}</a>`).join('');
  const html = head(title, desc, canonical) + topbar() +
    `<nav class="cp-crumb">Weather by city &amp; month</nav>
<h1 class="cp-h1">Weather by city &amp; month</h1>
<p class="cp-lede">How good it typically feels to be outside in ${CITIES.length} cities, scored month by month — a quick way to find the best time to visit for the weather you enjoy. Open any city, then sign into the app to make the scores personal.</p>
<div class="cp-sec cp-links cp-grid">${links}</div>` + foot();
  writePage(`${ROOT}/weather/index.html`, html);
}

rmSync(`${ROOT}/weather`, { recursive: true, force: true });
for (const [city, lat, lon] of CITIES) {
  const scores = monthScores(city, lat, lon);
  for (let mi = 0; mi < 12; mi++) monthPage(city, lat, lon, mi, scores);
  cityHub(city, lat, lon, scores);
}
indexHub();

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${u}</loc></url>`).join('\n')}\n</urlset>`;
writeFileSync(`${ROOT}/sitemap.xml`, sitemap.replace('http://www.sitemap.org', 'http://www.sitemaps.org'));
writeFileSync(`${ROOT}/robots.txt`, `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);

console.log(`Generated ${pageCount} pages, ${urls.length} sitemap urls, for ${CITIES.length} cities.`);
