import { evaluate, evaluateWeek, scoreText, band, isGolden, sensibleDefault } from './scoring.js';
import { fetchForecast, geocode, roundCoord } from './weather.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in (attrs || {})) e.setAttribute(k, attrs[k]); return e; };

const DEFAULT_LOC = { lat: 40.71, lon: -74.01, name: 'New York, NY' };
const SKY = { sunny: ['☀️', 'Sunny'], partlyCloudy: ['⛅️', 'Partly cloudy'], cloudy: ['☁️', 'Cloudy'], rainy: ['🌧️', 'Rainy'], snowy: ['❄️', 'Snowy'], wintryMix: ['🌨️', 'Wintry mix'] };
const bandClass = (d) => 'band-' + band(d).toLowerCase();

function fmtTime(ms) {
  const d = new Date(ms); let h = d.getUTCHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; const m = d.getUTCMinutes();
  return m === 0 ? `${h} ${ap}` : `${h}:${String(m).padStart(2, '0')} ${ap}`;
}
const windowRange = (w) => `${fmtTime(w.startTime)}–${fmtTime(w.endTime)}`;

function ring(displayed) {
  const svg = svgEl('svg', { viewBox: '0 0 120 120', class: 'ring' });
  const golden = isGolden(displayed);
  if (golden) {
    const defs = svgEl('defs'); const g = svgEl('linearGradient', { id: 'gold', x1: '0', y1: '0', x2: '1', y2: '1' });
    [['0', '#F6CC5A'], ['0.55', '#F2B544'], ['1', '#C6870F']].forEach(([o, c]) => g.appendChild(svgEl('stop', { offset: o, 'stop-color': c })));
    defs.appendChild(g); svg.appendChild(defs);
  }
  svg.appendChild(svgEl('circle', { cx: 60, cy: 60, r: 52, class: 'ring-track' }));
  const circ = 2 * Math.PI * 52, frac = Math.max(0, Math.min(1, displayed / 10));
  const arc = svgEl('circle', { cx: 60, cy: 60, r: 52, class: 'ring-arc ' + bandClass(displayed), 'stroke-dasharray': `${circ * frac} ${circ}`, transform: 'rotate(-90 60 60)' });
  if (golden) arc.setAttribute('stroke', 'url(#gold)');
  svg.appendChild(arc);
  return svg;
}

function timeline(hourly, best, bandCls) {
  const W = 560, H = 150, P = 10, BOT = H - 4;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'timeline', preserveAspectRatio: 'none' });
  const t0 = hourly[0].time, t1 = hourly[hourly.length - 1].time, span = Math.max(1, t1 - t0);
  const x = (t) => P + (t - t0) / span * (W - 2 * P);
  const y = (c) => P + (1 - c / 100) * (H - 2 * P - 8);
  const defs = svgEl('defs'); const g = svgEl('linearGradient', { id: 'area', x1: '0', y1: '0', x2: '0', y2: '1' });
  g.appendChild(svgEl('stop', { offset: '0', 'stop-color': 'var(--io-muted)', 'stop-opacity': '0.18' }));
  g.appendChild(svgEl('stop', { offset: '1', 'stop-color': 'var(--io-muted)', 'stop-opacity': '0' }));
  defs.appendChild(g); svg.appendChild(defs);
  let line = '';
  hourly.forEach((h, i) => { line += (i ? 'L' : 'M') + x(h.time).toFixed(1) + ' ' + y(h.comfort).toFixed(1) + ' '; });
  const area = `M${x(hourly[0].time).toFixed(1)} ${BOT} ` + hourly.map(h => `L${x(h.time).toFixed(1)} ${y(h.comfort).toFixed(1)}`).join(' ') + ` L${x(t1).toFixed(1)} ${BOT} Z`;
  if (best) {
    const bx = x(best.startTime), bw = Math.max(3, x(best.endTime) - bx);
    svg.appendChild(svgEl('rect', { x: bx, y: P - 4, width: bw, height: H - 2 * P, rx: 12, class: 'tl-window ' + bandCls }));
  }
  svg.appendChild(svgEl('path', { d: area, class: 'tl-area' }));
  svg.appendChild(svgEl('path', { d: line, class: 'tl-line' }));
  return svg;
}

function block(labelText, cardEl) { const b = el('div', 'block'); b.appendChild(el('div', 'section-label', labelText)); b.appendChild(cardEl); return b; }

function weekdayName(dateKey, isToday) {
  if (isToday) return 'Today';
  const d = new Date(dateKey + 'T12:00:00Z');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
}
function weekStrip(week) {
  const wrap = el('div', 'week');
  week.forEach(d => {
    const card = el('div', 'card week-day');
    card.appendChild(el('div', 'wd-name', weekdayName(d.dateKey, d.isToday)));
    const [emoji] = SKY[d.daySky] || ['☁️'];
    card.appendChild(el('div', 'wd-emoji', emoji));
    const badge = el('div', 'wd-badge ' + bandClass(d.displayed));
    badge.appendChild(el('span', 'serif', scoreText(d.displayed) + (isGolden(d.displayed) ? ' ✦' : '')));
    card.appendChild(badge);
    card.appendChild(el('div', 'wd-band ' + bandClass(d.displayed), d.band));
    card.appendChild(el('div', 'wd-window', d.bestWindow ? windowRange(d.bestWindow) : 'No window'));
    card.appendChild(el('div', 'wd-hl', `${Math.round(d.high)}° / ${Math.round(d.low)}°`));
    wrap.appendChild(card);
  });
  return wrap;
}

function render(loc, result, current) {
  const root = $('#app'); root.innerHTML = '';
  const disp = result.displayedDayScore;

  const hero = el('section', 'card hero');
  const left = el('div', 'hero-left');
  const topRow = el('div', 'hero-eyebrow-row');
  topRow.appendChild(el('div', 'eyebrow', loc.name.toUpperCase()));
  if (result.now) {
    const nb = el('div', 'now-badge ' + bandClass(result.now.displayedScore));
    nb.appendChild(el('span', 'now-lbl', 'NOW'));
    nb.appendChild(el('span', 'now-num', scoreText(result.now.displayedScore)));
    nb.appendChild(el('span', 'now-band', result.now.band));
    topRow.appendChild(nb);
  }
  left.appendChild(topRow);
  const scoreRow = el('div', 'score-row');
  const rw = el('div', 'ring-wrap'); rw.appendChild(ring(disp));
  const rn = el('div', 'ring-num'); rn.appendChild(el('span', 'score serif', scoreText(disp))); rn.appendChild(el('span', 'score-denom', '/ 10'));
  rw.appendChild(rn); scoreRow.appendChild(rw);
  const vd = el('div', 'verdict');
  vd.appendChild(el('div', 'verdict-word serif ' + bandClass(disp), result.band + (isGolden(disp) ? ' ✦' : '')));
  vd.appendChild(el('div', 'verdict-sub', result.bestWindow ? `Best time ${windowRange(result.bestWindow)}` : 'No standout window today'));
  scoreRow.appendChild(vd); left.appendChild(scoreRow);
  hero.appendChild(left);

  const right = el('div', 'hero-right');
  right.appendChild(el('div', 'section-label tl-title', 'YOUR COMFORT THROUGH THE DAY'));
  const tlWrap = el('div', 'tl-wrap');
  if (result.bestWindow) {
    const co = el('div', 'tl-callout ' + bandClass(result.bestWindow.averageComfort / 10));
    co.appendChild(el('span', 'tl-callout-range', windowRange(result.bestWindow)));
    co.appendChild(el('span', 'tl-callout-phrase', ' · ' + band(result.bestWindow.averageComfort / 10) + ' conditions'));
    tlWrap.appendChild(co);
  }
  tlWrap.appendChild(timeline(result.hourly, result.bestWindow, bandClass(result.bestWindow ? result.bestWindow.averageComfort / 10 : disp)));
  const axis = el('div', 'tl-axis'); ['12a', '6a', '12p', '6p', '11p'].forEach(t => axis.appendChild(el('span', null, t)));
  tlWrap.appendChild(axis);
  right.appendChild(tlWrap);
  hero.appendChild(right);
  root.appendChild(hero);

  const grid = el('div', 'detailgrid');

  const now = el('section', 'card right-now');
  now.appendChild(el('div', 'rn-temp', Math.round(current.temperatureF) + '°'));
  now.appendChild(el('div', 'rn-cond', current.conditionText));
  now.appendChild(el('div', 'rn-meta', `Feels ${Math.round(current.apparentF)}° · High ${Math.round(result.high)}° · Low ${Math.round(result.low)}°`));
  grid.appendChild(block('RIGHT NOW', now));

  const glance = el('section', 'card glance');
  const [emoji, word] = SKY[result.daySky] || ['☁️', 'Cloudy'];
  glance.appendChild(el('div', 'glance-emoji', emoji));
  const gt = el('div', 'glance-txt'); gt.appendChild(el('div', 'glance-word', word)); gt.appendChild(el('div', 'glance-hl', `High ${Math.round(result.high)}° · Low ${Math.round(result.low)}°`));
  glance.appendChild(gt);
  grid.appendChild(block('DAY AT A GLANCE', glance));

  const brk = el('section', 'card breakdown');
  const maxMag = Math.max(0.0001, ...result.breakdown.map(b => b.magnitude));
  result.breakdown.forEach(b => {
    const row = el('div', 'brk-row');
    const head = el('div', 'brk-head');
    head.appendChild(el('div', 'brk-label', b.label));
    const big = b.magnitude / maxMag > 0.6;
    head.appendChild(el('div', 'brk-verdict ' + (b.helped ? 'good' : 'bad'), b.helped ? (big ? 'helped a lot' : 'helped a little') : (big ? 'held it back' : 'held it back a little')));
    row.appendChild(head);
    const bar = el('div', 'brk-bar'); const fill = el('div', 'brk-fill ' + (b.helped ? 'good' : 'bad')); fill.style.width = Math.round((b.magnitude / maxMag) * 100) + '%';
    bar.appendChild(fill); row.appendChild(bar); brk.appendChild(row);
  });
  grid.appendChild(block('WHAT SHAPES THE DAY', brk));

  root.appendChild(grid);
  root.appendChild(el('div', 'foot', 'A personal weather score and the best time to be outside · Weather data by Open-Meteo'));
}

async function load() {
  const root = $('#app'); root.innerHTML = '<div class="loading">Reading your forecast…</div>';
  let loc = getSavedLoc();
  try { if (!loc) loc = await getGeoLoc(); } catch { loc = null; }
  if (!loc) loc = DEFAULT_LOC;
  try {
    const forecast = await fetchForecast(roundCoord(loc.lat), roundCoord(loc.lon));
    const result = evaluate(forecast, getProfile(), forecast.updatedAt);
    render(loc, result, forecast.current);
  } catch (e) { root.innerHTML = `<div class="loading">Couldn't load the forecast.<br><small>${e.message}</small></div>`; }
}

function getSavedLoc() { try { return JSON.parse(localStorage.getItem('gw_loc')); } catch { return null; } }
function getProfile() { try { return { ...sensibleDefault, ...(JSON.parse(localStorage.getItem('gw_profile')) || {}) }; } catch { return sensibleDefault; } }
function getGeoLoc() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geo'));
    navigator.geolocation.getCurrentPosition(
      (pos) => { const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'Current location' }; localStorage.setItem('gw_loc', JSON.stringify(loc)); resolve(loc); },
      () => reject(new Error('denied')), { timeout: 8000 });
  });
}
window.gwSearch = async (q) => { const loc = await geocode(q); if (loc) { localStorage.setItem('gw_loc', JSON.stringify(loc)); load(); } };
window.gwUseLocation = () => { localStorage.removeItem('gw_loc'); load(); };
load();
