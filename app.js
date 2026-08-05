import { fetchForecast, geocode, roundCoord, conditionText } from './weather.js';
import { evaluate, evaluateDay, scoreText, roundedScore, band, isGolden, sensibleDefault } from './scoring.js';

const NS = 'http://www.w3.org/2000/svg';
const DEFAULT_LOC = { lat: 40.71, lon: -74.01, name: 'New York, NY' };
const PLOT_LO = 5, PLOT_HI = 22;
const STALE_MS = 60 * 60 * 1000;
const VBW = 760, VBH = 200, PADL = 34, PADR = 14, PTOP = 14, PBOT = 168;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let profile = { ...sensibleDefault, ...store.get('gw.profile', {}) };
let location = store.get('gw.loc', null);
let units = store.get('gw.units', 'F');
let appearance = store.get('gw.appearance', 'system');
let cache = store.get('gw.cache', null);

let forecast = null;
let fetchedReal = 0;
let stale = false;
let loadError = null;

const $ = (s, r = document) => r.querySelector(s);
function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  }
  if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(c => c != null && e.append(c.nodeType ? c : document.createTextNode(c)));
  return e;
}
function E(tag, attrs) { const e = document.createElementNS(NS, tag); for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]); return e; }
const CSSV = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const localHour = ms => { const d = new Date(ms); return d.getUTCHours() + d.getUTCMinutes() / 60; };
const roundHour = ms => { const d = new Date(ms); return d.getUTCHours() + Math.round(d.getUTCMinutes() / 60); };
function fmtLong(ms) { let h = ((roundHour(ms) % 24) + 24) % 24; const ap = h < 12 ? 'AM' : 'PM'; return `${h % 12 || 12} ${ap}`; }
function fmtShort(ms) { let h = ((roundHour(ms) % 24) + 24) % 24; return `${h % 12 || 12}${h < 12 ? 'a' : 'p'}`; }
function fmtClock(ms) { const d = new Date(ms); const h = d.getUTCHours(), m = d.getUTCMinutes(); const ap = h < 12 ? 'AM' : 'PM'; const hh = h % 12 || 12; return m ? `${hh}:${String(m).padStart(2, '0')} ${ap}` : `${hh} ${ap}`; }
const rangeLong = w => `${fmtLong(w.startTime)} – ${fmtLong(w.endTime)}`;
const rangeShort = w => `${fmtShort(w.startTime)}–${fmtShort(w.endTime)}`;

const bandCls = displayed => band(displayed).toLowerCase();
const bandClsComfort = comfort => bandCls(comfort / 10);
const T = f => units === 'C' ? Math.round((f - 32) * 5 / 9) : Math.round(f);
const Ts = f => `${T(f)}°`;

function scoreCls(s) { if (s >= 0.66) return 'good'; if (s >= 0.45) return 'decent'; if (s >= 0.28) return 'poor'; return 'bad'; }
function tempWord(s, apparentF, ideal) {
  if (s >= 0.82) return 'Near ideal'; if (s >= 0.6) return 'Comfortable';
  if (s >= 0.38) return apparentF > ideal ? 'A bit warm' : 'A bit cool';
  if (s >= 0.22) return apparentF > ideal ? 'Too warm' : 'Too cool';
  return apparentF > ideal ? 'Hot' : 'Cold';
}
function cloudWord(pct) { if (pct < 15) return 'Clear'; if (pct < 35) return 'Mostly clear'; if (pct < 65) return 'Partly cloudy'; if (pct < 85) return 'Cloudy'; return 'Overcast'; }
function sunSkyWord(s) { if (s >= 0.8) return 'Great light'; if (s >= 0.55) return 'Good light'; if (s >= 0.35) return 'Some sun'; return 'Dim'; }
function humidWord(s, dewF) { if (s >= 0.8) return dewF < 55 ? 'Dry' : 'Comfortable'; if (s >= 0.6) return 'Comfortable'; if (s >= 0.42) return 'A little sticky'; if (s >= 0.25) return 'Humid'; return 'Muggy'; }
function rainWord(prob, type) { if (type === 'none' || prob < 10) return 'None'; if (prob < 35) return 'Slight'; if (prob < 65) return 'Chance'; return 'Likely'; }
function hourVerdict(comfort) { if (comfort >= 90) return 'Peak — ideal for you'; if (comfort >= 80) return 'Excellent right now'; if (comfort >= 70) return 'A good time to be out'; if (comfort >= 50) return 'Okay, not the best'; if (comfort >= 30) return 'Marginal'; return 'Not your time'; }

const SKY = {
  sunny: { emoji: '☀️', adj: 'Bright and clear', short: 'Clear skies' },
  partlyCloudy: { emoji: '⛅️', adj: 'Sun and clouds mixing', short: 'Some clouds' },
  cloudy: { emoji: '☁️', adj: 'Mostly cloudy', short: 'Overcast' },
  rainy: { emoji: '🌧️', adj: 'Wet much of the day', short: 'Showers likely' },
  snowy: { emoji: '❄️', adj: 'Snow around', short: 'Snow' },
  wintryMix: { emoji: '🌨️', adj: 'A wintry mix', short: 'Wintry mix' },
};
const sky = k => SKY[k] || SKY.cloudy;

const VERDICT_WORD = { golden: 'Golden', great: 'Great day', good: 'Good day', decent: 'Decent day', poor: 'Poor day', bad: 'Bad day' };
const FEEL_CLAUSE = { golden: 'a rare one for how you like it', great: 'close to perfect for you', good: 'a good one to get outside', decent: 'fine in patches', poor: 'a tough one out there', bad: 'not your kind of day' };

function nearestRaw(rawHours, t) { let b = rawHours[0]; for (const h of rawHours) if (Math.abs(h.time - t) < Math.abs(b.time - t)) b = h; return b; }

function dayMetrics(ev) {
  const raw = ev.rawHours.filter(h => { const lh = localHour(h.time); return lh >= 7 && lh < 21; });
  const pool = raw.length ? raw : ev.rawHours;
  const usable = ev.hourly.filter(h => h.isInOutdoorBand && h.isSafe);
  const cpool = usable.length ? usable : ev.hourly;
  const avg = (arr, f) => arr.reduce((a, x) => a + f(x), 0) / (arr.length || 1);
  const comp = k => avg(cpool, h => h.components[k] ?? 0);
  const apparent = avg(pool, h => h.apparentF);
  const cloudPct = Math.round(avg(pool, h => h.cloud) * 100);
  const humPct = Math.round(avg(pool, h => h.humidity) * 100);
  const dew = avg(pool, h => h.dewF);
  const rainProb = Math.round(Math.max(0, ...pool.map(h => h.precipProb)) * 100);
  const rainType = ev.daySky === 'snowy' ? 'snow' : ((ev.daySky === 'rainy' || ev.daySky === 'wintryMix' || rainProb >= 10) ? 'rain' : 'none');
  const cTemp = comp('temperature'), cSun = comp('sunSky'), cMug = comp('mugginess'), cRain = comp('precipitation');
  return [
    { k: 'Temp', v: Ts(apparent), d: tempWord(cTemp, apparent, profile.idealFeelsLikeF), cls: scoreCls(cTemp) },
    { k: 'Clouds', v: `${cloudPct}%`, d: cloudWord(cloudPct), cls: scoreCls(cSun) },
    { k: 'Humidity', v: `${humPct}%`, d: humidWord(cMug, dew), cls: scoreCls(cMug) },
    { k: 'Rain', v: `${rainProb}%`, d: rainWord(rainProb, rainType), cls: rainType === 'none' || rainProb < 10 ? 'muted' : scoreCls(cRain) },
  ];
}

function verdictSub(ev) { return `${sky(ev.daySky).adj} — ${FEEL_CLAUSE[bandCls(ev.displayedDayScore)]}.`; }

function applyAppearance() {
  document.documentElement.classList.remove('light', 'dark');
  if (appearance === 'light') document.documentElement.classList.add('light');
  else if (appearance === 'dark') document.documentElement.classList.add('dark');
}
function effectiveDark() {
  if (appearance === 'dark') return true;
  if (appearance === 'light') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const MI = { Temp: 'M14 14.8V5a2 2 0 10-4 0v9.8a4 4 0 104 0z', Clouds: 'M7 18a4 4 0 010-8 5 5 0 019.6-1.6A3.5 3.5 0 1117 18H7z', Humidity: 'M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z', Rain: 'M6 13a6 6 0 0111.7-2A4 4 0 1117 19H7' };
const metricIcon = k => `<svg class="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${MI[k]}"/></svg>`;

function ringSVG(displayed, golden) {
  const r = 54, circ = 2 * Math.PI * r, frac = Math.max(0, Math.min(1, displayed / 10));
  const stroke = golden ? 'url(#goldring)' : CSSV('--' + bandCls(displayed));
  const defs = golden ? `<defs><linearGradient id="goldring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${CSSV('--gold-bright')}"/><stop offset=".55" stop-color="${CSSV('--golden')}"/><stop offset="1" stop-color="${CSSV('--gold-deep')}"/></linearGradient></defs>` : '';
  return `<svg viewBox="0 0 128 128">${defs}<circle cx="64" cy="64" r="${r}" fill="none" stroke="${CSSV('--hair')}" stroke-width="10"/><circle cx="64" cy="64" r="${r}" fill="none" stroke="${stroke}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(circ * frac).toFixed(1)} ${circ.toFixed(1)}"/></svg>`;
}

function drawTimeline(ev, opts = {}) {
  let data = ev.hourly.filter(h => { const lh = localHour(h.time); return lh >= PLOT_LO && lh <= PLOT_HI; });
  if (data.length < 2) data = ev.hourly.slice();
  const domS = data[0].time, domE = data[data.length - 1].time, span = Math.max(1, domE - domS);
  const X = t => PADL + (t - domS) / span * (VBW - PADL - PADR);
  const Y = c => PBOT - Math.max(0, Math.min(1, c / 100)) * (PBOT - PTOP);
  const svg = E('svg', { viewBox: `0 0 ${VBW} ${VBH}`, preserveAspectRatio: 'none' });
  const muted = CSSV('--muted'), hair = CSSV('--hair'), faint = CSSV('--faint'), ink = CSSV('--ink');

  [0, 25, 50, 75, 100].forEach(g => svg.append(E('line', { x1: PADL, x2: VBW - PADR, y1: Y(g), y2: Y(g), stroke: hair, 'stroke-width': g % 50 === 0 ? 1 : 0.6, opacity: g % 50 === 0 ? 0.9 : 0.5 })));
  [[0, '0'], [50, '5'], [100, '10']].forEach(([g, lbl]) => { const t = E('text', { x: PADL - 7, y: Y(g) + 3.5, 'font-size': 10, fill: faint, 'text-anchor': 'end' }); t.textContent = lbl; svg.append(t); });

  const shade = (a, b) => { const xa = X(a), xb = X(b); if (xb > xa) svg.append(E('rect', { x: xa, y: PTOP - 4, width: xb - xa, height: PBOT - PTOP + 4, fill: ink, opacity: 0.045 })); };
  if (ev.sunrise && ev.sunrise > domS) shade(domS, ev.sunrise);
  if (ev.sunset && ev.sunset < domE) shade(ev.sunset, domE);

  const w = ev.bestWindow;
  if (w) {
    const wx = X(Math.max(domS, w.startTime)), wxe = X(Math.min(domE, w.endTime)), wcls = bandClsComfort(w.averageComfort);
    if (wcls === 'golden') {
      const d = E('defs', {}); d.innerHTML = `<linearGradient id="wgrad" x1="0" x2="1"><stop offset="0" stop-color="${CSSV('--gold-bright')}" stop-opacity=".30"/><stop offset="1" stop-color="${CSSV('--gold-deep')}" stop-opacity=".18"/></linearGradient>`; svg.append(d);
      svg.append(E('rect', { x: wx, y: PTOP - 4, width: Math.max(2, wxe - wx), height: PBOT - PTOP + 4, rx: 10, fill: 'url(#wgrad)', stroke: CSSV('--brand-gold'), 'stroke-width': 1.5 }));
    } else {
      svg.append(E('rect', { x: wx, y: PTOP - 4, width: Math.max(2, wxe - wx), height: PBOT - PTOP + 4, rx: 10, fill: CSSV('--' + wcls), opacity: 0.13, stroke: CSSV('--brand-gold'), 'stroke-width': 1.4, 'stroke-opacity': 0.55 }));
    }
  }

  const pts = data.map(h => `${X(h.time).toFixed(1)},${Y(h.comfort).toFixed(1)}`).join(' ');
  const ad = E('defs', {}); ad.innerHTML = `<linearGradient id="tlarea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${muted}" stop-opacity=".20"/><stop offset="1" stop-color="${muted}" stop-opacity="0"/></linearGradient>`; svg.append(ad);
  svg.append(E('polygon', { points: `${X(domS).toFixed(1)},${PBOT} ${pts} ${X(domE).toFixed(1)},${PBOT}`, fill: 'url(#tlarea)' }));
  svg.append(E('polyline', { points: pts, fill: 'none', stroke: muted, 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  [ev.sunrise, ev.sunset].forEach(t => { if (t && t >= domS && t <= domE) svg.append(E('line', { x1: X(t), x2: X(t), y1: PBOT, y2: PBOT + 6, stroke: CSSV('--brand-gold'), 'stroke-width': 2.2 })); });

  const base = domS - localHour(domS) * 3600e3;
  [6, 9, 12, 15, 18, 21].forEach(hr => {
    const t = base + hr * 3600e3; if (t < domS - 1e6 || t > domE + 1e6) return;
    const lbl = hr === 12 ? '12p' : (hr < 12 ? hr + 'a' : (hr - 12) + 'p');
    const tx = E('text', { x: X(t), y: VBH - 4, 'font-size': 10.5, fill: faint, 'text-anchor': 'middle' }); tx.textContent = lbl; svg.append(tx);
  });

  const hline = E('line', { stroke: ink, 'stroke-width': 1.2, 'stroke-dasharray': '3 3', opacity: 0.5, x1: -99, x2: -99, y1: PTOP - 4, y2: PBOT });
  const hdot = E('circle', { r: 6, fill: CSSV('--card'), stroke: ink, 'stroke-width': 2.5, cx: -99, cy: -99 });
  if (opts.nowTime != null && opts.nowTime >= domS && opts.nowTime <= domE) svg.append(E('line', { x1: X(opts.nowTime), x2: X(opts.nowTime), y1: PTOP - 4, y2: PBOT, stroke: CSSV('--accent'), 'stroke-width': 1.4, 'stroke-dasharray': '2 3', opacity: 0.55 }));
  svg.append(hline); svg.append(hdot);
  return { svg, data, X, Y, domS, domE, hline, hdot };
}

function hourDetailHTML(ev, s) {
  const raw = nearestRaw(ev.rawHours, s.time), c = s.components, cl = bandClsComfort(s.comfort);
  const cloudPct = Math.round(raw.cloud * 100), humPct = Math.round(raw.humidity * 100), rainP = Math.round(raw.precipProb * 100);
  const type = ev.daySky === 'snowy' ? 'snow' : (rainP >= 10 ? 'rain' : 'none');
  const isNow = forecast.current && Math.abs(s.time - forecast.current.time) < 30 * 60000;
  const m = [
    { k: 'Feels like', v: Ts(s.apparentF), d: tempWord(c.temperature, s.apparentF, profile.idealFeelsLikeF), cls: scoreCls(c.temperature) },
    { k: 'Sun & sky', v: cloudWord(cloudPct), d: sunSkyWord(c.sunSky), cls: scoreCls(c.sunSky) },
    { k: 'Humidity', v: `${humPct}%`, d: humidWord(c.mugginess, raw.dewF), cls: scoreCls(c.mugginess) },
    { k: 'Rain', v: `${rainP}%`, d: rainWord(rainP, type), cls: type === 'none' || rainP < 10 ? 'muted' : scoreCls(c.precipitation) },
  ];
  return `<div class="hp-top"><span class="hp-t">${fmtClock(s.time)}</span><span class="hp-s c-${cl}">${scoreText(s.comfort / 10)} · ${band(s.comfort / 10)}</span><button class="hp-close" aria-label="Close">×</button></div>
    <div class="hp-verdict">${hourVerdict(s.comfort)}${isNow ? ' · right now' : ''}.</div>
    <div class="hp-metrics">${m.map(x => `<div class="hm"><div class="k">${x.k}</div><div class="v">${x.v}</div><div class="d c-${x.cls}">${x.d}</div></div>`).join('')}</div>`;
}

function tooltipHTML(ev, s) {
  const cl = bandClsComfort(s.comfort), isNow = forecast.current && Math.abs(s.time - forecast.current.time) < 30 * 60000;
  return `<div class="tt">${fmtClock(s.time)}${isNow ? ' · now' : ''}</div><div class="tr"><span>${s.conditionText}</span><b>${Ts(s.apparentF)}</b></div><div class="tr"><span>Your score</span><b>${scoreText(s.comfort / 10)}</b></div><div class="flag c-${cl}">${hourVerdict(s.comfort)}</div>`;
}

function timelineCard(ev, opts = {}) {
  const tl = drawTimeline(ev, opts);
  const w = ev.bestWindow, golden = w && bandClsComfort(w.averageComfort) === 'golden', wcls = w ? bandClsComfort(w.averageComfort) : 'muted';
  const tag = w
    ? `<div class="tl-window-tag win-sel" style="border-color:var(--brand-gold)"><div class="rng ${golden ? 'gold-text' : 'c-' + wcls}">${rangeLong(w)}</div><div class="phr ${golden ? 'gold-text' : 'c-' + wcls}">${golden ? 'Golden conditions ✦' : band(w.averageComfort / 10) + ' conditions'}</div></div>`
    : `<div class="tl-window-tag" style="border-color:var(--hair)"><div class="rng c-muted">No standout window</div><div class="phr c-muted">Nothing clearly best today</div></div>`;

  const wrap = el('div', { class: 'tl-wrap', tabindex: '0', role: 'slider', 'aria-label': 'Hourly comfort timeline' });
  const tip = el('div', { class: 'tip' });
  wrap.append(tl.svg, tip);
  const pin = el('div', { class: 'hourpin' });
  const main = el('div', { class: 'tl-main' }, [el('div', { class: 'tl-plot' }, [wrap]), pin]);
  const card = el('section', { class: 'card tl-card' }, [
    el('div', { class: 'tl-head' }, [el('div', { html: tag })]),
    main,
    el('div', { class: 'tl-hint' }, [opts.isToday ? 'Your comfort through the day · hover to inspect, click a point to pin an hour' : 'Forecast comfort through the day · hover or click a point for detail']),
  ]);

  let pinned = null;
  const near = clientX => { const r = wrap.getBoundingClientRect(); const vbx = (clientX - r.left) / r.width * VBW; let b = 0, bd = 1e9; tl.data.forEach((h, i) => { const d = Math.abs(tl.X(h.time) - vbx); if (d < bd) { bd = d; b = i; } }); return b; };
  const place = i => {
    const h = tl.data[i], x = tl.X(h.time), y = tl.Y(h.comfort);
    tl.hline.setAttribute('x1', x); tl.hline.setAttribute('x2', x);
    tl.hdot.setAttribute('cx', x); tl.hdot.setAttribute('cy', y); tl.hdot.setAttribute('stroke', CSSV('--' + bandClsComfort(h.comfort)));
  };
  const hover = i => {
    place(i); const x = tl.X(tl.data[i].time);
    tip.innerHTML = tooltipHTML(ev, tl.data[i]);
    const px = x / VBW * wrap.clientWidth; tip.style.left = Math.max(82, Math.min(wrap.clientWidth - 82, px)) + 'px'; tip.style.top = '0px'; tip.classList.add('on');
  };
  const rest = () => { tip.classList.remove('on'); if (pinned != null) place(pinned); else if (opts.nowIndex != null) place(opts.nowIndex); };
  const showPin = i => {
    pinned = i; pin.innerHTML = hourDetailHTML(ev, tl.data[i]); pin.classList.add('on'); main.classList.add('pinned');
    $('.hp-close', pin).addEventListener('click', e => { e.stopPropagation(); pinned = null; pin.classList.remove('on'); main.classList.remove('pinned'); rest(); });
    hover(i);
  };
  wrap.addEventListener('pointermove', e => { const i = near(e.clientX); if (e.buttons && pinned != null) showPin(i); else hover(i); });
  wrap.addEventListener('pointerdown', e => { e.preventDefault(); wrap.focus(); showPin(near(e.clientX)); });
  wrap.addEventListener('pointerleave', rest);
  wrap.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const cur = pinned != null ? pinned : (opts.nowIndex ?? 0); showPin(Math.max(0, Math.min(tl.data.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)))); }
  });
  if (opts.nowIndex != null) requestAnimationFrame(() => place(opts.nowIndex));
  return card;
}

function scoreCard(ev, opts = {}) {
  const golden = isGolden(ev.displayedDayScore), cls = bandCls(ev.displayedDayScore), now = ev.now;
  const nowBadge = now ? `<span class="now-badge c-${bandCls(now.displayedScore)}" style="border-color:color-mix(in srgb,var(--${bandCls(now.displayedScore)}) 40%,transparent);background:color-mix(in srgb,var(--${bandCls(now.displayedScore)}) 12%,transparent)"><span class="nl">NOW</span><span class="nn">${scoreText(now.displayedScore)}</span><span>${band(now.displayedScore)}</span></span>` : '';
  const vw = golden ? `<span class="gold-text">Golden</span> <span class="spark">✦</span>` : `<span class="c-${cls}">${VERDICT_WORD[cls]}</span>`;
  const w = ev.bestWindow, bestCls = w ? bandClsComfort(w.averageComfort) : cls;
  const bestLine = w
    ? `${golden && bestCls === 'golden' ? 'Golden window' : 'Best time'} <span class="rng ${bestCls === 'golden' ? 'gold-text' : 'c-' + bestCls}">${rangeLong(w)}</span>`
    : `<span class="c-muted">No standout window ${opts.eyebrow && !now ? 'this day' : 'today'}</span>`;
  const eyebrow = golden && !now ? 'Your Golden Window' : (opts.eyebrow || 'Today · your day score');
  return el('section', { class: 'card scorecard' + (golden ? ' gold-glow' : ''), html:
    `<div class="eyebrow-row"><span class="eyebrow ${golden ? 'gold-text' : ''}">${eyebrow}</span>${nowBadge}</div>
     <div class="score-row"><div class="ring-wrap">${ringSVG(ev.displayedDayScore, golden)}<div class="ring-num"><span class="s ${golden ? 'gold-text' : ''}">${scoreText(ev.displayedDayScore)}</span><span class="d">/ 10</span></div></div>
       <div class="verdict"><div class="vw">${vw}</div><div class="vsub">${verdictSub(ev)}</div></div></div>
     <div class="besttime">${bestLine}</div>` });
}

function metricsCard(ev, label) {
  return el('section', { class: 'card span4', html:
    `<div class="lab">${label}</div><div class="metrics">${dayMetrics(ev).map(x => `<div class="metric">${metricIcon(x.k)}<div class="k">${x.k}</div><div class="v">${x.v}</div><div class="d c-${x.cls}">${x.d}</div></div>`).join('')}</div>` });
}

function breakdownCard(ev) {
  const rows = ev.breakdown.filter(r => r.helped || r.score < 0.9).slice(0, 4);
  const verb = r => r.helped ? (r.magnitude > 0.06 ? 'helped a lot' : 'helped') : (r.magnitude > 0.06 ? 'held it back' : 'a minor drag');
  const body = rows.length ? rows.map(r => { const cls = r.helped ? 'good' : 'poor'; return `<div class="brk-row"><div class="brk-head"><span class="brk-l">${r.label}</span><span class="brk-v c-${cls}">${verb(r)}</span></div><div class="brk-bar"><div class="brk-fill fill-${cls}" style="width:${Math.round(Math.max(8, Math.min(100, r.score * 100)))}%"></div></div></div>`; }).join('')
    : `<div class="c-muted" style="font-size:14px">A balanced day — nothing stands out either way.</div>`;
  return el('section', { class: 'card span4', html: `<div class="card-head"><span class="ch-t">What shapes the day</span></div><div class="brk">${body}</div>` });
}

function weekdayName(ev) { return ev.isToday ? 'Today' : new Date(ev.rawHours[0].time).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }); }

function weekMiniCard(week) {
  const rows = week.slice(0, 4).map(d => { const cls = bandCls(d.displayedDayScore), g = isGolden(d.displayedDayScore);
    return `<a href="#/week/${d.index}"><span class="d">${weekdayName(d)}</span><span class="b ${g ? 'gold-badge' : 'bg-' + cls}">${scoreText(d.displayedDayScore)}${g ? ' <span class="spark">✦</span>' : ''}</span><span class="w">${sky(d.daySky).short}</span><span class="hl">${T(d.high)}/${T(d.low)}</span></a>`; }).join('');
  return el('section', { class: 'card span2', html: `<div class="card-head"><span class="ch-t">This week</span><a href="#/week">All 7 →</a></div><div class="wk-mini">${rows}</div>` });
}

function rightNowCard() {
  const c = forecast.current, d = forecast.days[0];
  return el('section', { class: 'card span2 rn', html:
    `<div><div class="lab">Right now</div><div class="rn-t">${Ts(c.temperatureF)}</div><div class="rn-c">${c.conditionText}</div><div class="rn-m">Feels ${Ts(c.apparentF)} · High ${Ts(d.high)} · Low ${Ts(d.low)}</div></div>
     <svg class="sun" viewBox="0 0 64 64" fill="none"><circle cx="32" cy="30" r="12" fill="var(--brand-gold)"/><g stroke="var(--brand-gold)" stroke-width="3" stroke-linecap="round"><path d="M32 8v6M32 46v6M8 30h6M50 30h6M15 13l4 4M45 43l4 4M49 13l-4 4M19 43l-4 4"/></g></svg>` });
}

function nowIndexFor(ev) {
  if (!forecast.current) return null;
  let plot = ev.hourly.filter(h => { const lh = localHour(h.time); return lh >= PLOT_LO && lh <= PLOT_HI; });
  if (plot.length < 2) plot = ev.hourly.slice();
  let b = null, bd = 1e9; plot.forEach((h, i) => { const dd = Math.abs(h.time - forecast.current.time); if (dd < bd) { bd = dd; b = i; } });
  return bd < 90 * 60000 ? b : null;
}

function nowMs() { return forecast.updatedAt + Math.max(0, Date.now() - fetchedReal); }

function viewToday(root) {
  const ev = evaluate(forecast, profile, nowMs());
  if (isSafetyOverride()) return viewSafety(root, ev);
  const wrap = el('div', { class: 'wrap' });
  if (stale) wrap.append(staleBanner());
  const grid = el('div', { class: 'hero-grid' }, [scoreCard(ev), timelineCard(ev, { isToday: true, nowTime: forecast.current && forecast.current.time, nowIndex: nowIndexFor(ev) })]);
  const week = evaluateWeekCached();
  const dash = el('div', { class: 'dash' }, [rightNowCard(), metricsCard(ev, 'What today feels like — for you'), breakdownCard(ev), weekMiniCard(week)]);
  wrap.append(stale ? el('div', { class: 'muteall' }, [grid, dash]) : el('div', {}, [grid, dash]), footer());
  root.append(wrap);
}

function viewWeek(root) {
  const week = evaluateWeekCached();
  const wrap = el('div', { class: 'wrap' });
  if (stale) wrap.append(staleBanner());
  wrap.append(el('div', { class: 'lab' }, ['Next 7 days · your personal score & best window']));
  const grid = el('div', { class: 'week7' });
  week.forEach(d => {
    const cls = bandCls(d.displayedDayScore), g = isGolden(d.displayedDayScore);
    const win = d.bestWindow ? rangeShort(d.bestWindow) : 'No good window';
    grid.append(el('a', { href: `#/week/${d.index}`, class: 'wday' + (g ? ' sel gold-glow' : ''), html:
      `<div class="wn">${weekdayName(d)}</div><div class="wsky">${sky(d.daySky).emoji}</div>
       <div class="wbadge ${g ? 'gold-badge' : 'bg-' + cls}">${scoreText(d.displayedDayScore)}${g ? ' <span class="spark">✦</span>' : ''}</div>
       <div class="wband ${g ? 'gold-text' : 'c-' + cls}">${g ? 'Golden' : band(d.displayedDayScore)}</div>
       <div class="wwin">${win}</div><div class="wchar">${sky(d.daySky).short}</div><div class="whl">${T(d.high)}° / ${T(d.low)}°</div>` }));
  });
  wrap.append(grid, el('div', { class: 'tl-hint', style: 'text-align:left;margin-top:16px' }, ['Click any day to open its full detail. A day with nothing good honestly says “No good window.”']), footer());
  root.append(wrap);
}

function viewDay(root, i) {
  if (!(i >= 0 && i < forecast.days.length)) return void navigate('#/week');
  const ev = evaluateDay(forecast, i, profile, nowMs());
  const name = i === 0 ? 'Today' : new Date(ev.rawHours[0].time).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const wrap = el('div', { class: 'wrap' });
  wrap.append(el('div', { class: 'crumb', html: `<a href="#/week">← Week</a> · ${name}` }));
  const grid = el('div', { class: 'hero-grid' }, [scoreCard(ev, { eyebrow: `${name} · day score` }), timelineCard(ev, { nowTime: i === 0 && forecast.current ? forecast.current.time : null, nowIndex: i === 0 ? nowIndexFor(ev) : null })]);
  const dash = el('div', { class: 'dash' }, [metricsCard(ev, `What ${name} feels like — for you`), el('section', { class: 'card span2', html: `<div class="lab">Day character</div><div style="font-size:14px;line-height:1.6;color:var(--muted)">${sky(ev.daySky).adj} — ${FEEL_CLAUSE[bandCls(ev.displayedDayScore)]}.</div>` })]);
  wrap.append(grid, dash, footer());
  root.append(wrap);
}

function viewSettings(root) {
  const wrap = el('div', { class: 'wrap' });
  const save = () => store.set('gw.profile', profile);
  const grid = el('div', { class: 'set-grid' });

  const prof = el('section', { class: 'card set-card', style: 'grid-row:span 2' });
  prof.append(el('h3', {}, ['Your comfort profile']));
  const pref = (label, valFn, min, max, step, get, set) => {
    const v = el('span', { class: 'sv' }, [valFn()]);
    const inp = el('input', { type: 'range', min, max, step, value: get(), oninput: e => { set(parseFloat(e.target.value)); v.textContent = valFn(); save(); } });
    prof.append(el('div', { class: 'set-row' }, [el('span', {}, [label]), inp, v]));
  };
  pref('Ideal feels-like', () => `${T(profile.idealFeelsLikeF)}°`, 55, 95, 1, () => profile.idealFeelsLikeF, x => profile.idealFeelsLikeF = Math.round(x));
  pref('Sun & sky', () => profile.sunPreference >= 0.66 ? 'Loves sun' : profile.sunPreference >= 0.33 ? 'Likes sun' : 'Clouds ok', 0, 1, 0.01, () => profile.sunPreference, x => profile.sunPreference = x);
  pref('Humidity sensitivity', () => profile.mugginessSensitivity >= 0.66 ? 'High' : profile.mugginessSensitivity >= 0.33 ? 'Medium' : 'Low', 0, 1, 0.01, () => profile.mugginessSensitivity, x => profile.mugginessSensitivity = x);
  pref('Rain tolerance', () => profile.rainTolerance <= 0.33 ? 'Low' : profile.rainTolerance <= 0.66 ? 'Medium' : 'High', 0, 1, 0.01, () => profile.rainTolerance, x => profile.rainTolerance = x);
  pref('Snow tolerance', () => profile.snowTolerance <= 0.33 ? 'Low' : profile.snowTolerance <= 0.66 ? 'Medium' : 'High', 0, 1, 0.01, () => profile.snowTolerance, x => profile.snowTolerance = x);
  const windSeg = el('div', { class: 'seg' });
  const mkWind = () => { windSeg.innerHTML = ''; ['Off', 'On'].forEach((t, idx) => windSeg.append(el('button', { class: (idx === 1) === (profile.importanceWind > 0) ? 'on' : '', onclick: () => { profile.importanceWind = idx; save(); mkWind(); } }, [t]))); };
  mkWind();
  prof.append(el('div', { class: 'set-row' }, [el('span', { html: 'Count wind <span class="sv" style="display:inline">optional</span>' }), windSeg]));
  grid.append(prof);

  const unitsCard = el('section', { class: 'card set-card' });
  unitsCard.append(el('h3', {}, ['Units']));
  const uSeg = el('div', { class: 'seg' });
  ['F', 'C'].forEach(u => uSeg.append(el('button', { class: units === u ? 'on' : '', onclick: () => { units = u; store.set('gw.units', u); route(); } }, ['°' + u])));
  unitsCard.append(el('div', { class: 'set-row' }, [el('span', {}, ['Temperature']), uSeg]));
  grid.append(unitsCard);

  const locCard = el('section', { class: 'card set-card' });
  locCard.append(el('h3', {}, ['Location']));
  locCard.append(el('div', { class: 'set-row' }, [el('span', {}, ['Use my location']), el('button', { class: 'btn sm', onclick: useMyLocation }, ['Use current'])]));
  const err = el('div', { class: 'err-inline' });
  const inp = el('input', { placeholder: 'Search a city or ZIP…', onkeydown: async e => { if (e.key === 'Enter' && e.target.value.trim()) { err.textContent = ''; const ok = await doSearch(e.target.value.trim()); if (!ok) err.textContent = 'No match — try another name.'; } } });
  locCard.append(el('div', { class: 'set-row', style: 'display:block' }, [el('div', { class: 'search', style: 'width:100%' }, [el('span', { html: '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>' }), inp]), err]));
  locCard.append(el('div', { class: 'set-row' }, [el('span', {}, ['Current place']), el('span', { class: 'sv' }, [(location || DEFAULT_LOC).name])]));
  grid.append(locCard);

  const about = el('section', { class: 'card set-card' });
  about.append(el('h3', {}, ['About']));
  about.append(el('div', { class: 'about', html: `Golden Window — a personal weather score and the best time to be outside. Scores and explanations are relative to your local weather; safety warnings are absolute.<div style="margin-top:10px">Weather data by <b>Open-Meteo</b>.</div><div class="ver">Version 1.0 (web) · No account, no tracking</div>` }));
  about.append(el('div', { style: 'margin-top:14px' }, [el('button', { class: 'btn ghost', style: 'color:var(--poor);border-color:color-mix(in srgb,var(--poor) 40%,transparent)', onclick: () => { profile = { ...sensibleDefault }; store.set('gw.profile', profile); route(); } }, ['Reset preferences'])]));
  grid.append(about);

  wrap.append(grid, footer());
  root.append(wrap);
}

function isSafetyOverride() {
  const c = forecast.current; if (!c) return false;
  return [95, 96, 99].includes(c.weatherCode) || (c.windGustMph && c.windGustMph >= 50);
}
function viewSafety(root, ev) {
  const wrap = el('div', { class: 'wrap' });
  const grid = el('div', { class: 'hero-grid' }, [
    el('section', { class: 'safety-card', html: `<div class="sk"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg> Severe weather nearby</div><div class="sbig">Not a good time to be outside</div><div class="ssub">${forecast.current.conditionText} with hazardous conditions right now. The usual score is set aside while it's dangerous — it returns once conditions ease.</div>` }),
    timelineCard(ev, { isToday: true, nowTime: forecast.current.time, nowIndex: nowIndexFor(ev) }),
  ]);
  wrap.append(grid, footer());
  root.append(wrap);
}

function staleBanner() {
  const hrs = Math.max(1, Math.round((Date.now() - fetchedReal) / 3600e3));
  return el('div', { class: 'banner stale', html: `<svg class="icon sm" viewBox="0 0 24 24" style="stroke:var(--stale)" fill="none"><path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5"/></svg> Showing weather from about ${hrs} hour${hrs > 1 ? 's' : ''} ago — couldn't refresh.` });
}
function footer() { return el('div', { class: 'foot', html: 'Weather by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> · Golden Window · no account, no tracking' }); }

let _weekCache = null, _weekKey = '';
function evaluateWeekCached() {
  const key = JSON.stringify(profile) + forecast.updatedAt + units;
  if (_weekKey === key && _weekCache) return _weekCache;
  const n = nowMs();
  _weekCache = forecast.days.map((_, i) => evaluateDay(forecast, i, profile, n));
  _weekKey = key;
  return _weekCache;
}

function topbar() {
  const path = locationHash();
  const bar = el('header', { class: 'topbar' });
  bar.append(el('a', { class: 'brand', href: '#/today', html: `<img src="icon.svg" alt=""><span class="name">Golden Window</span>` }));
  const nav = el('nav', { class: 'nav' });
  [['Today', '#/today'], ['Week', '#/week'], ['Settings', '#/settings']].forEach(([t, h]) => {
    const active = (h === '#/today' && isTodayPath(path)) || (h === '#/week' && path.startsWith('#/week')) || (h === '#/settings' && path.startsWith('#/settings'));
    nav.append(el('a', { href: h, class: active ? 'on' : '' }, [t]));
  });
  bar.append(nav, el('span', { class: 'grow' }));
  const loc = location || DEFAULT_LOC;
  const fresh = stale ? `${Math.max(1, Math.round((Date.now() - fetchedReal) / 3600e3))}h ago` : (forecast ? `Updated ${fmtClock(forecast.current ? forecast.current.time : forecast.updatedAt)}` : '');
  bar.append(el('button', { class: 'loc-chip', onclick: () => { const s = $('.search input'); if (s) s.focus(); }, html: `<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg><span><span class="lc-name">${loc.name}</span><br><span class="lc-time" style="color:${stale ? 'var(--stale)' : ''}">${fresh}</span></span>` }));
  const search = el('div', { class: 'search' }, [
    el('span', { html: '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>' }),
    el('input', { placeholder: 'City or ZIP', 'aria-label': 'Search location', onkeydown: async e => { if (e.key === 'Enter' && e.target.value.trim()) await doSearch(e.target.value.trim()); } }),
  ]);
  bar.append(search);
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Appearance' }), dark = effectiveDark();
  seg.append(el('button', { class: dark ? '' : 'on', onclick: () => setAppearance('light') }, ['Light']), el('button', { class: dark ? 'on' : '', onclick: () => setAppearance('dark') }, ['Dark']));
  bar.append(seg);
  return bar;
}

function setAppearance(a) { appearance = a; store.set('gw.appearance', a); applyAppearance(); route(); }
function locationHash() { return window.location.hash || '#/today'; }
function isTodayPath(p) { return p === '' || p === '#/' || p === '#/today'; }
function navigate(h) { if (window.location.hash === h) route(); else window.location.hash = h; }

function route() {
  const root = $('#root'); if (!root) return;
  root.innerHTML = '';
  if (!forecast && loadError) { root.append(topbarSafe(), errorState()); return; }
  if (!forecast) { root.append(topbarSafe(), loadingState()); return; }
  root.append(topbar());
  const path = locationHash();
  if (path.startsWith('#/week/')) return viewDay(root, parseInt(path.split('/')[2], 10));
  if (path.startsWith('#/week')) return viewWeek(root);
  if (path.startsWith('#/settings')) return viewSettings(root);
  return viewToday(root);
}
function topbarSafe() { try { return topbar(); } catch { return el('header', { class: 'topbar' }, [el('span', { class: 'brand', html: '<img src="icon.svg" alt=""><span class="name">Golden Window</span>' })]); } }

function loadingState() {
  const wrap = el('div', { class: 'wrap' });
  wrap.append(el('div', { class: 'hero-grid' }, [
    el('section', { class: 'card scorecard', html: `<div class="skel" style="width:55%;height:12px"></div><div class="score-row" style="margin-top:18px"><div class="skel" style="width:128px;height:128px;border-radius:50%"></div><div style="flex:1"><div class="skel" style="width:70%;height:28px"></div><div class="skel" style="width:95%;height:13px;margin-top:12px"></div><div class="skel" style="width:80%;height:13px;margin-top:7px"></div></div></div>` }),
    el('section', { class: 'card tl-card', html: `<div class="skel" style="width:160px;height:34px;border-radius:12px"></div><div class="skel" style="width:100%;height:170px;margin-top:16px"></div>` }),
  ]));
  wrap.append(el('div', { style: 'text-align:center;color:var(--faint);font-size:13px;margin-top:20px' }, ['Reading your forecast…']));
  return wrap;
}
function errorState() {
  const wrap = el('div', { class: 'wrap' });
  wrap.append(el('div', { class: 'state-center err', html: `<div class="sic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5"/></svg></div><h2>Couldn't reach the forecast</h2><p>Open-Meteo didn't respond. Check your connection and try again.</p>` }));
  wrap.append(el('div', { style: 'text-align:center' }, [el('button', { class: 'btn', onclick: () => load() }, ['Try again'])]));
  return wrap;
}

async function doSearch(q) {
  try { const r = await geocode(q); if (!r) return false; location = { lat: r.lat, lon: r.lon, name: r.name }; store.set('gw.loc', location); await load(); return true; } catch { return false; }
}
function useMyLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => { location = { lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude), name: 'Current location' }; store.set('gw.loc', location); load(); },
    () => {}, { timeout: 8000 });
}

async function load() {
  const loc = location || DEFAULT_LOC;
  try {
    forecast = await fetchForecast(roundCoord(loc.lat), roundCoord(loc.lon));
    fetchedReal = Date.now(); stale = false; loadError = null; _weekCache = null;
    cache = { forecast, fetchedReal, loc }; store.set('gw.cache', cache);
  } catch (e) {
    if (cache && cache.forecast) { forecast = cache.forecast; fetchedReal = cache.fetchedReal; stale = (Date.now() - fetchedReal) > STALE_MS; loadError = null; }
    else { forecast = null; loadError = e; }
  }
  route();
}

function init() {
  applyAppearance();
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (appearance === 'system') route(); });
  window.addEventListener('hashchange', route);
  if (cache && cache.forecast) { forecast = cache.forecast; fetchedReal = cache.fetchedReal || 0; stale = (Date.now() - fetchedReal) > STALE_MS; }
  route();
  load();
  if (!location && navigator.geolocation) navigator.geolocation.getCurrentPosition(
    pos => { location = { lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude), name: 'Current location' }; store.set('gw.loc', location); load(); },
    () => {}, { timeout: 8000 });
}

init();
