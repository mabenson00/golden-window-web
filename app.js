import { evaluate, scoreText, band, isGolden, sensibleDefault, CONFIG } from './scoring.js';
import { fetchForecast, geocode, roundCoord, conditionText } from './weather.js';

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

const DEFAULT_LOC = { lat: 40.71, lon: -74.01, name: 'New York, NY' };

function bandClass(displayed) { return 'band-' + band(displayed).toLowerCase(); }

function fmtTime(ms) {
  const d = new Date(ms);
  let h = d.getUTCHours(); const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  const m = d.getUTCMinutes();
  return m === 0 ? `${h} ${ampm}` : `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}
function windowRange(w) { return `${fmtTime(w.startTime)}–${fmtTime(w.endTime)}`; }

const SKY = {
  sunny: ['☀️', 'Sunny'], partlyCloudy: ['⛅️', 'Partly cloudy'], cloudy: ['☁️', 'Cloudy'],
  rainy: ['🌧️', 'Rainy'], snowy: ['❄️', 'Snowy'], wintryMix: ['🌨️', 'Wintry mix'],
};

function ring(displayed) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120'); svg.setAttribute('class', 'ring');
  const golden = isGolden(displayed);
  if (golden) {
    const defs = document.createElementNS(svgNS, 'defs');
    const grad = document.createElementNS(svgNS, 'linearGradient');
    grad.setAttribute('id', 'goldsheen'); grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0'); grad.setAttribute('x2', '1'); grad.setAttribute('y2', '1');
    [['0', '#F6CC5A'], ['0.5', '#D89A1B'], ['1', '#C6870F']].forEach(([o, col]) => {
      const s = document.createElementNS(svgNS, 'stop'); s.setAttribute('offset', o); s.setAttribute('stop-color', col); grad.appendChild(s);
    });
    defs.appendChild(grad); svg.appendChild(defs);
  }
  const track = document.createElementNS(svgNS, 'circle');
  track.setAttribute('cx', '60'); track.setAttribute('cy', '60'); track.setAttribute('r', '52');
  track.setAttribute('class', 'ring-track'); svg.appendChild(track);
  const arc = document.createElementNS(svgNS, 'circle');
  arc.setAttribute('cx', '60'); arc.setAttribute('cy', '60'); arc.setAttribute('r', '52');
  arc.setAttribute('class', 'ring-arc ' + bandClass(displayed));
  const circ = 2 * Math.PI * 52; const frac = Math.max(0, Math.min(1, displayed / 10));
  arc.setAttribute('stroke-dasharray', `${circ * frac} ${circ}`);
  arc.setAttribute('transform', 'rotate(-90 60 60)');
  if (golden) arc.setAttribute('stroke', 'url(#goldsheen)');
  svg.appendChild(arc);
  return svg;
}

function timeline(hourly, bestWindow) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const W = 340, H = 150, PAD = 6;
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'timeline');
  const t0 = hourly[0].time, t1 = hourly[hourly.length - 1].time, span = Math.max(1, t1 - t0);
  const x = (t) => PAD + (t - t0) / span * (W - 2 * PAD);
  const y = (comfort) => PAD + (1 - comfort / 100) * (H - 2 * PAD);
  if (bestWindow) {
    const bx = x(bestWindow.startTime), bw = x(bestWindow.endTime) - bx;
    const rect = document.createElementNS(svgNS, 'rect');
    rect.setAttribute('x', bx); rect.setAttribute('y', PAD); rect.setAttribute('width', Math.max(2, bw)); rect.setAttribute('height', H - 2 * PAD);
    rect.setAttribute('rx', '10'); rect.setAttribute('class', 'tl-window'); svg.appendChild(rect);
  }
  let d = '';
  hourly.forEach((h, i) => { d += (i === 0 ? 'M' : 'L') + x(h.time).toFixed(1) + ' ' + y(h.comfort).toFixed(1) + ' '; });
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', d); path.setAttribute('class', 'tl-line'); svg.appendChild(path);
  return svg;
}

function block(labelText, cardEl) {
  const b = el('div', 'block');
  b.appendChild(el('div', 'section-label', labelText));
  b.appendChild(cardEl);
  return b;
}

function render(loc, result) {
  const root = $('#app'); root.innerHTML = '';
  const disp = result.displayedDayScore;
  const topgrid = el('div', 'topgrid');
  const detailgrid = el('div', 'detailgrid');

  const loca = el('div', 'location');
  loca.appendChild(el('div', 'loc-name', loc.name));
  loca.appendChild(el('div', 'loc-updated', 'Updated ' + fmtTime(currentCache.time)));
  root.appendChild(loca);

  const hero = el('section', 'card hero');
  const heroTop = el('div', 'hero-top');
  heroTop.appendChild(el('div', 'eyebrow', 'TODAY OVERALL'));
  if (result.now) {
    const nb = el('div', 'now-badge ' + bandClass(result.now.displayedScore));
    nb.appendChild(el('span', 'now-lbl', 'NOW'));
    nb.appendChild(el('span', 'now-num', scoreText(result.now.displayedScore)));
    nb.appendChild(el('span', 'now-band', result.now.band));
    heroTop.appendChild(nb);
  }
  hero.appendChild(heroTop);
  const heroBody = el('div', 'hero-body');
  const ringWrap = el('div', 'ring-wrap');
  ringWrap.appendChild(ring(disp));
  const ringNum = el('div', 'ring-num');
  ringNum.appendChild(el('span', 'score serif', scoreText(disp)));
  ringNum.appendChild(el('span', 'score-denom', '/ 10'));
  ringWrap.appendChild(ringNum);
  heroBody.appendChild(ringWrap);
  const verdict = el('div', 'verdict');
  verdict.appendChild(el('div', 'verdict-word serif ' + bandClass(disp), result.band + (isGolden(disp) ? ' ✦' : '')));
  const sub = result.bestWindow ? `Best window ${windowRange(result.bestWindow)}` : 'No standout window today';
  verdict.appendChild(el('div', 'verdict-sub', sub));
  heroBody.appendChild(verdict);
  hero.appendChild(heroBody);
  topgrid.appendChild(hero);

  const tlCard = el('section', 'card');
  if (result.bestWindow) {
    const callout = el('div', 'tl-callout ' + bandClass(result.bestWindow.averageComfort / 10));
    callout.appendChild(el('div', 'tl-callout-range', windowRange(result.bestWindow)));
    callout.appendChild(el('div', 'tl-callout-phrase', band(result.bestWindow.averageComfort / 10) + ' conditions'));
    tlCard.appendChild(callout);
  }
  tlCard.appendChild(timeline(result.hourly, result.bestWindow));
  tlCard.appendChild(el('div', 'tl-caption', 'Your personal comfort through the day'));
  topgrid.appendChild(block('BEST TIME TO GO OUTSIDE', tlCard));

  const now = el('section', 'card right-now');
  const cur = currentCache;
  now.appendChild(el('div', 'rn-temp', Math.round(cur.temperatureF) + '°'));
  now.appendChild(el('div', 'rn-cond', cur.conditionText));
  now.appendChild(el('div', 'rn-meta', `Feels ${Math.round(cur.apparentF)}° · High ${Math.round(result.high)}° · Low ${Math.round(result.low)}°`));
  detailgrid.appendChild(block('RIGHT NOW', now));

  const glance = el('section', 'card glance');
  const [emoji, word] = SKY[result.daySky] || ['☁️', 'Cloudy'];
  glance.appendChild(el('div', 'glance-emoji', emoji));
  const gtxt = el('div', 'glance-txt');
  gtxt.appendChild(el('div', 'glance-word', word));
  gtxt.appendChild(el('div', 'glance-hl', `High ${Math.round(result.high)}° · Low ${Math.round(result.low)}°`));
  glance.appendChild(gtxt);
  detailgrid.appendChild(block('DAY AT A GLANCE', glance));

  const brk = el('section', 'card breakdown');
  const maxMag = Math.max(0.0001, ...result.breakdown.map(b => b.magnitude));
  result.breakdown.forEach(b => {
    const row = el('div', 'brk-row');
    const head = el('div', 'brk-head');
    head.appendChild(el('div', 'brk-label', b.label));
    const verdictTxt = b.helped ? (b.magnitude / maxMag > 0.6 ? 'helped a lot' : 'helped a little') : (b.magnitude / maxMag > 0.6 ? 'held it back' : 'held it back a little');
    head.appendChild(el('div', 'brk-verdict ' + (b.helped ? 'good' : 'bad'), verdictTxt));
    row.appendChild(head);
    const bar = el('div', 'brk-bar');
    const fill = el('div', 'brk-fill ' + (b.helped ? 'good' : 'bad'));
    fill.style.width = Math.round((b.magnitude / maxMag) * 100) + '%';
    bar.appendChild(fill); row.appendChild(bar);
    brk.appendChild(row);
  });
  detailgrid.appendChild(block('WHAT SHAPES THE DAY', brk));

  root.appendChild(topgrid);
  root.appendChild(detailgrid);
  root.appendChild(el('div', 'foot', 'Weather data by Open-Meteo · v0'));
}

let currentCache = null;

async function load() {
  const root = $('#app');
  root.innerHTML = '<div class="loading">Reading your forecast…</div>';
  let loc = getSavedLoc();
  try {
    if (!loc) loc = await getGeoLoc();
  } catch { loc = null; }
  if (!loc) loc = DEFAULT_LOC;
  try {
    const forecast = await fetchForecast(roundCoord(loc.lat), roundCoord(loc.lon));
    currentCache = forecast.current;
    const profile = getProfile();
    const result = evaluate(forecast, profile, forecast.updatedAt);
    render(loc, result);
  } catch (e) {
    root.innerHTML = `<div class="loading">Couldn't load the forecast.<br><small>${e.message}</small></div>`;
  }
}

function getSavedLoc() { try { return JSON.parse(localStorage.getItem('gw_loc')); } catch { return null; } }
function getProfile() { try { return { ...sensibleDefault, ...(JSON.parse(localStorage.getItem('gw_profile')) || {}) }; } catch { return sensibleDefault; } }
function getGeoLoc() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geo'));
    navigator.geolocation.getCurrentPosition(
      (pos) => { const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, name: 'Current location' }; localStorage.setItem('gw_loc', JSON.stringify(loc)); resolve(loc); },
      () => reject(new Error('denied')), { timeout: 8000 }
    );
  });
}

window.gwSearch = async (q) => {
  const loc = await geocode(q);
  if (loc) { localStorage.setItem('gw_loc', JSON.stringify(loc)); load(); }
};

load();
