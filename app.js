import { fetchForecast, fetchHistoricalYears, geocode, roundCoord, conditionText } from './weather.js?v=27';
import { evaluate, evaluateDay, scoreText, roundedScore, band, isGolden, sensibleDefault, precipType, CONFIG } from './scoring.js?v=27';

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
let cache = store.get('gw.cache', null);
let onboarded = store.get('gw.onboarded', false) || store.get('gw.profile', null) !== null;
let ob = null;
const PLAN_YEARS = [2019, 2020, 2021, 2022, 2023, 2024];
let plan = { loc: store.get('gw.planloc', null), month: store.get('gw.planmonth', new Date().getUTCMonth() + 1), scored: null, locKey: null, loading: false, error: null };

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

const compCls = c => { if (c == null) return 'muted'; const b = bandCls(c * 10); return b === 'golden' ? 'great' : b; };
function mvTemp(c) { if (c == null) return ['—', 'muted']; const col = compCls(c); if (c >= 0.8) return ['Near ideal', col]; if (c >= 0.6) return ['Comfortable', col]; if (c >= 0.35) return ['A bit off', col]; return ['Uncomfortable', col]; }
function mvClouds(frac, c) { const col = compCls(c); let t; if (frac < 0.20) t = 'Clear'; else if (frac < 0.50) t = 'Partly cloudy'; else if (frac < 0.80) t = 'Cloudy'; else t = 'Overcast'; return [t, col]; }
function mvMug(c) { if (c == null) return ['—', 'muted']; const col = compCls(c); if (c >= 0.75) return ['Comfortable', col]; if (c >= 0.5) return ['Slightly humid', col]; if (c >= 0.3) return ['Muggy', col]; return ['Oppressive', col]; }
function mvRain(prob, c) { if (prob <= 0.005) return ['None', 'muted']; const col = compCls(c); if (prob < 0.2) return ['Unlikely', col]; if (prob < 0.5) return ['Possible', col]; return ['Likely', col]; }
function mvPrecip(type, prob, c) { if (type === 'none' || prob <= 0.005) return ['None', 'muted']; const col = compCls(c); const noun = type === 'snow' ? 'Snow' : ((type === 'mixed' || type === 'freezing') ? 'Wintry mix' : 'Rain'); const lk = prob < 0.2 ? 'unlikely' : (prob < 0.5 ? 'possible' : 'likely'); return [`${noun} ${lk}`, col]; }
function mvWind(speed, c) { if (c == null) return ['—', 'muted']; const col = compCls(c); if (c >= 0.8) return ['Comfortable', col]; if (c >= 0.55) return ['Breezy', col]; if (c >= 0.3) return ['Windy', col]; return ['Strong wind', col]; }
function hourVerdict(displayed) { if (displayed >= 8) return 'A great hour to be outside'; if (displayed >= 7) return 'A good hour to be outside'; if (displayed >= 5) return 'A decent hour to be outside'; if (displayed >= 3) return 'A poor hour to be outside'; return 'Not a good hour to be outside'; }

const CAN_HELP = { temperature: true, sunSky: true, mugginess: true, precipitation: false, wind: false, airQuality: false };
function factorEffect(r) { const neutral = CAN_HELP[r.factor] ? 0.5 : 1.0; return r.weight * (r.score - neutral); }
function factorMag(r) { return Math.abs(factorEffect(r)); }
function factorTag(r) { const neutral = CAN_HELP[r.factor] ? 0.5 : 1.0; const norm = Math.min(1, Math.abs(r.score - neutral) / neutral); const intensity = norm >= 0.6 ? ' a lot' : (norm < 0.3 ? ' a little' : ''); return (r.helped ? 'helped' : 'held it back') + intensity; }

const CLOUD_G = '<g fill="var(--faint)"><circle cx="24" cy="27" r="10"/><circle cx="38" cy="23" r="12"/><rect x="20" y="26" width="27" height="12" rx="6"/></g>';
const GLYPHS = {
  sun: '<circle cx="32" cy="30" r="12" fill="var(--brand-gold)"/><g stroke="var(--brand-gold)" stroke-width="3" stroke-linecap="round"><path d="M32 8v6M32 46v6M8 30h6M50 30h6M15 13l4 4M45 43l4 4M49 13l-4 4M19 43l-4 4"/></g>',
  moon: '<path d="M46 38A16 16 0 1126 14a13 13 0 0020 24z" fill="var(--brand-gold)"/>',
  cloud: '<g fill="var(--faint)"><circle cx="24" cy="34" r="11"/><circle cx="39" cy="30" r="13"/><rect x="20" y="33" width="30" height="13" rx="6.5"/></g>',
  partly: '<circle cx="27" cy="25" r="9" fill="var(--brand-gold)"/><g stroke="var(--brand-gold)" stroke-width="2.6" stroke-linecap="round"><path d="M27 9v5M11 25h5M15 13l3.5 3.5M39 13l-3.5 3.5"/></g><g fill="var(--faint)"><circle cx="33" cy="40" r="10"/><circle cx="45" cy="37" r="12"/><rect x="29" y="40" width="24" height="11" rx="5.5"/></g>',
  rain: CLOUD_G + '<g stroke="var(--brand-sky)" stroke-width="3.2" stroke-linecap="round"><path d="M25 44l-2.5 7M35 44l-2.5 7M45 44l-2.5 7"/></g>',
  snow: CLOUD_G + '<g fill="var(--brand-sky)"><circle cx="25" cy="48" r="2.4"/><circle cx="35" cy="50" r="2.4"/><circle cx="45" cy="48" r="2.4"/></g>',
  storm: CLOUD_G + '<path d="M35 42l-9 11h7l-3 8 11-13h-7l3-6z" fill="var(--brand-gold)"/>',
};
function glyphSVG(kind) { return `<svg class="sun" viewBox="0 0 64 64" fill="none">${GLYPHS[kind] || GLYPHS.cloud}</svg>`; }

function currentSky(c) {
  const type = precipType(c.weatherCode), pct = c.cloud * 100;
  if ([95, 96, 99].includes(c.weatherCode)) return { text: 'Thunderstorms', kind: 'storm' };
  if (type !== 'none' && c.precipProb >= 0.35) {
    if (type === 'snow') return { text: 'Snow', kind: 'snow' };
    if (type === 'mixed' || type === 'freezing') return { text: 'Wintry mix', kind: 'snow' };
    return { text: 'Rain', kind: 'rain' };
  }
  if (pct < 20) return { text: 'Clear', kind: c.isDay ? 'sun' : 'moon' };
  if (pct < 50) return { text: 'Partly cloudy', kind: c.isDay ? 'partly' : 'cloud' };
  if (pct < 80) return { text: 'Cloudy', kind: 'cloud' };
  return { text: 'Overcast', kind: 'cloud' };
}

const DAY_SKY_TEXT = { sunny: 'Sunny', partlyCloudy: 'Partly cloudy', cloudy: 'Cloudy', rainy: 'Rainy', snowy: 'Snowy', wintryMix: 'Wintry mix' };
const DAY_SKY_EMOJI = { sunny: '☀️', partlyCloudy: '⛅️', cloudy: '☁️', rainy: '🌧️', snowy: '❄️', wintryMix: '🌨️' };
const skyText = k => DAY_SKY_TEXT[k] || 'Cloudy';
const skyEmoji = k => DAY_SKY_EMOJI[k] || '☁️';

const rangeApp = w => `${fmtLong(w.startTime)}–${fmtLong(w.endTime)}`;
function windowQualityPhrase(w) { const b = band(w.averageComfort / 10); if (b === 'Golden') return 'Golden conditions'; if (b === 'Poor' || b === 'Bad') return 'The least uncomfortable part of the day'; return `${b} conditions`; }
function noWindowPhrase(f) { return { temperature: 'Uncomfortable temperatures much of the day', mugginess: 'Muggy for much of the day', precipitation: 'Wet for much of the day', sunSky: 'Grey much of the day', wind: 'Windy much of the day', airQuality: 'Poor air much of the day' }[f] || 'No standout window'; }
function limitingFactor(ev) { const ranked = ev.breakdown.slice().sort((a, b) => factorMag(b) - factorMag(a)); const drag = ranked.find(r => !r.helped); return drag ? drag.factor : null; }
function headlineFor(ev) { const w = ev.bestWindow; if (!w) return noWindowPhrase(limitingFactor(ev)); if (w.isAllDay) return 'Good to be outside all day'; return `Best window ${rangeApp(w)}`; }
function bestTimeLine(ev, nowT) { const w = ev.bestWindow; if (w) { if (w.isAllDay) return { label: 'Best time to be outside', text: 'All day' }; if (w.endTime > nowT) return { label: 'Best window', text: rangeApp(w) }; } return null; }
function heroSubtitle(ev, nowT) { const l = bestTimeLine(ev, nowT); return l ? `${l.label} ${l.text}` : headlineFor(ev); }
function windowText(ev) { const w = ev.bestWindow; if (!w) return 'No good window'; if (w.isAllDay) return 'All day'; return rangeApp(w); }

function nearestRaw(rawHours, t) { let b = rawHours[0]; for (const h of rawHours) if (Math.abs(h.time - t) < Math.abs(b.time - t)) b = h; return b; }
function scoredNearest(ev, t) { let b = ev.hourly[0]; for (const h of ev.hourly) if (Math.abs(h.time - t) < Math.abs(b.time - t)) b = h; return b; }

function metricRow(ev) {
  let raw, comps;
  if (ev.isToday && forecast.current) { raw = forecast.current; comps = scoredNearest(ev, forecast.current.time).components; }
  else { const noonT = ev.rawHours.reduce((best, h) => Math.abs(localHour(h.time) - 13) < Math.abs(localHour(best.time) - 13) ? h : best, ev.rawHours[0]).time; raw = nearestRaw(ev.rawHours, noonT); comps = scoredNearest(ev, noonT).components; }
  const mk = (k, v, verdict) => ({ k, v, d: verdict[0], cls: verdict[1] });
  return [
    mk('Feels like', Ts(raw.apparentF), mvTemp(comps.temperature)),
    mk('Clouds', `${Math.round(raw.cloud * 100)}%`, mvClouds(raw.cloud, comps.sunSky)),
    comps.mugginess != null ? mk('Dew point', Ts(raw.dewF), mvMug(comps.mugginess)) : null,
    mk('Rain', `${Math.round(raw.precipProb * 100)}%`, mvRain(raw.precipProb, comps.precipitation)),
  ].filter(Boolean);
}

function dayAverages(ev) {
  const dl = ev.rawHours.filter(h => h.isDay); const pool = dl.length ? dl : ev.rawHours; if (!pool.length) return null;
  const n = pool.length;
  const wet = pool.filter(h => precipType(h.weatherCode) !== 'none' && h.precipProb >= CONFIG.daySummaryWetHourChance);
  let type = 'none';
  if (wet.length) { const hasSnow = wet.some(h => precipType(h.weatherCode) === 'snow'); const hasRain = wet.some(h => precipType(h.weatherCode) === 'rain'); type = (hasSnow && !hasRain) ? 'snow' : 'rain'; }
  return { apparentF: pool.reduce((a, h) => a + h.apparentF, 0) / n, cloud: pool.reduce((a, h) => a + h.cloud, 0) / n, dewF: pool.reduce((a, h) => a + h.dewF, 0) / n, precipType: type };
}
function clauseFor(r, avg) {
  switch (r.factor) {
    case 'temperature': if (r.helped) return ['comfortable', true]; if (avg.apparentF >= profile.idealFeelsLikeF) return [avg.apparentF - profile.idealFeelsLikeF > 12 ? 'too hot' : 'a bit warm', false]; return [profile.idealFeelsLikeF - avg.apparentF > 12 ? 'too cold' : 'a bit cool', false];
    case 'sunSky': if (avg.cloud < CONFIG.daySummarySunnyCloudCeiling) return ['sunny', true]; if (avg.cloud >= CONFIG.daySummaryCloudyCloudFloor) return ['cloudy', false]; return r.helped ? ['hazy sun', true] : ['gray skies', false];
    case 'mugginess': if (avg.dewF >= CONFIG.summaryMuggyDewF) return ['muggy', false]; if (avg.dewF <= CONFIG.summaryDryDewF) return avg.apparentF >= CONFIG.summaryDryMinFeelsF ? ['dry', true] : null; return r.helped ? null : ['humid', false];
    case 'precipitation': return [avg.precipType === 'snow' ? 'snowy' : 'rainy', false];
    case 'wind': return r.helped ? ['calm', true] : ['windy', false];
    case 'airQuality': return r.helped ? ['clean air', true] : ['hazy air', false];
    default: return null;
  }
}
function joinList(xs) { if (xs.length <= 1) return xs[0] || ''; if (xs.length === 2) return `${xs[0]} and ${xs[1]}`; return `${xs.slice(0, -1).join(', ')}, and ${xs[xs.length - 1]}`; }
function combineClauses(ranked, avg) {
  if (!ranked.length) return 'Comfortable and steady';
  if (factorMag(ranked[0]) < CONFIG.characterMaterialFloor) return 'Comfortable and steady';
  const picks = ranked
    .filter(r => factorMag(r) >= CONFIG.characterMaterialFloor)
    .slice(0, CONFIG.characterMaxClauses)
    .sort((a, b) => a.factor === b.factor ? 0 : a.factor === 'temperature' ? -1 : b.factor === 'temperature' ? 1 : factorMag(b) - factorMag(a));
  const clauses = picks.map(r => clauseFor(r, avg)).filter(Boolean);
  if (!clauses.length) return 'Comfortable and steady';
  const goods = clauses.filter(c => c[1]).map(c => c[0]); const bads = clauses.filter(c => !c[1]).map(c => c[0]);
  const phrase = (goods.length && bads.length) ? `${joinList(goods)} but ${joinList(bads)}` : joinList(goods.length ? goods : bads);
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}
function characterPhrase(ev) {
  const avg = dayAverages(ev); if (!avg) return headlineFor(ev);
  const ranked = ev.breakdown.slice().sort((a, b) => factorMag(b) - factorMag(a)).filter(r => factorMag(r) > 1e-6);
  if (!ranked.length) return headlineFor(ev);
  return combineClauses(ranked, avg);
}
function componentsBreakdown(c, p) {
  const rows = [];
  const consider = (factor, score, weight) => {
    if (score == null || weight <= 0) return;
    if (CAN_HELP[factor]) rows.push({ factor, score, weight, helped: score >= 0.5 });
    else if (score < CONFIG.breakdownSpoilerNeutralCeiling) rows.push({ factor, score, weight, helped: false });
  };
  consider('temperature', c.temperature, CONFIG.weightTemperature * p.importanceTemperature);
  consider('sunSky', c.sunSky, CONFIG.weightSunSky * p.importanceSunSky);
  consider('mugginess', c.mugginess, CONFIG.weightMugginess * p.importanceMugginess);
  consider('precipitation', c.precipitation, CONFIG.weightPrecipitation * p.importancePrecipitation);
  consider('wind', c.wind, CONFIG.weightWind * p.importanceWind);
  consider('airQuality', c.airQuality, CONFIG.weightAirQuality);
  return rows;
}
function nowCharacter(ev) {
  const c = forecast.current; if (!c) return currentSky(c).text;
  const comps = scoredNearest(ev, c.time).components;
  const wet = precipType(c.weatherCode) !== 'none' && c.precipProb >= CONFIG.daySummaryWetHourChance;
  const avg = { apparentF: c.apparentF, cloud: c.cloud, dewF: c.dewF, precipType: wet ? precipType(c.weatherCode) : 'none' };
  const ranked = componentsBreakdown(comps, { ...sensibleDefault, ...profile }).sort((a, b) => factorMag(b) - factorMag(a)).filter(r => factorMag(r) > 1e-6);
  if (!ranked.length) return currentSky(c).text;
  return combineClauses(ranked, avg);
}


const MI = { 'Feels like': 'M14 14.8V5a2 2 0 10-4 0v9.8a4 4 0 104 0z', Clouds: 'M7 18a4 4 0 010-8 5 5 0 019.6-1.6A3.5 3.5 0 1117 18H7z', 'Dew point': 'M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z', Rain: 'M6 13a6 6 0 0111.7-2A4 4 0 1117 19H7' };
const metricIcon = k => `<svg class="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${MI[k] || MI.Clouds}"/></svg>`;

function ringSVG(displayed, golden) {
  const r = 54, circ = 2 * Math.PI * r, frac = Math.max(0, Math.min(1, displayed / 10));
  const stroke = golden ? 'url(#goldring)' : CSSV('--' + bandCls(displayed));
  const defs = golden ? `<defs><linearGradient id="goldring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${CSSV('--gold-bright')}"/><stop offset=".55" stop-color="${CSSV('--golden')}"/><stop offset="1" stop-color="${CSSV('--gold-deep')}"/></linearGradient></defs>` : '';
  return `<svg viewBox="0 0 128 128">${defs}<circle cx="64" cy="64" r="${r}" fill="none" stroke="${CSSV('--hair')}" stroke-width="10"/><circle cx="64" cy="64" r="${r}" fill="none" stroke="${stroke}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(circ * frac).toFixed(1)} ${circ.toFixed(1)}"/></svg>`;
}

function smoothPath(pts) {
  if (pts.length < 2) return pts.length ? `M${pts[0].x},${pts[0].y}` : '';
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
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

  const P = data.map(h => ({ x: X(h.time), y: Y(h.comfort) }));
  const linePath = smoothPath(P);
  const ad = E('defs', {}); ad.innerHTML = `<linearGradient id="tlarea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${muted}" stop-opacity=".26"/><stop offset="1" stop-color="${muted}" stop-opacity="0"/></linearGradient>`; svg.append(ad);
  svg.append(E('path', { d: `${linePath} L${X(domE).toFixed(1)},${PBOT} L${X(domS).toFixed(1)},${PBOT} Z`, fill: 'url(#tlarea)' }));
  svg.append(E('path', { d: linePath, fill: 'none', stroke: muted, 'stroke-width': 2.9, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

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
  const type = precipType(raw.weatherCode), isSnow = type === 'snow';
  const isNow = forecast.current && Math.abs(s.time - forecast.current.time) < 30 * 60000;
  const mk = (k, v, verdict) => ({ k, v, d: verdict[0], cls: verdict[1] });
  const m = [
    mk('Feels like', Ts(s.apparentF), mvTemp(c.temperature)),
    mk('Sun & sky', `${Math.round(raw.cloud * 100)}% cloud`, mvClouds(raw.cloud, c.sunSky)),
    c.mugginess != null ? mk('Humidity', `${Ts(raw.dewF)} dew pt`, mvMug(c.mugginess)) : null,
    mk(isSnow ? 'Snow' : 'Rain', `${Math.round(raw.precipProb * 100)}%`, mvPrecip(type, raw.precipProb, c.precipitation)),
  ].filter(Boolean);
  return `<div class="hp-top"><span class="hp-t">${fmtClock(s.time)}</span><span class="hp-s c-${cl}">${scoreText(s.comfort / 10)} · ${band(s.comfort / 10)}</span><button class="hp-close" aria-label="Close">×</button></div>
    <div class="hp-verdict">${hourVerdict(roundedScore(s.comfort / 10))}${isNow ? ' · right now' : ''}.</div>
    <div class="hp-metrics">${m.map(x => `<div class="hm"><div class="k">${x.k}</div><div class="v">${x.v}</div><div class="d c-${x.cls}">${x.d}</div></div>`).join('')}</div>`;
}

function tooltipHTML(ev, s) {
  const cl = bandClsComfort(s.comfort), isNow = forecast.current && Math.abs(s.time - forecast.current.time) < 30 * 60000;
  return `<div class="tt">${fmtClock(s.time)}${isNow ? ' · now' : ''}</div><div class="tr"><span>Feels</span><b>${Ts(s.apparentF)}</b></div><div class="tr"><span>Your score</span><b>${scoreText(s.comfort / 10)} · ${band(s.comfort / 10)}</b></div><div class="flag c-${cl}">${hourVerdict(roundedScore(s.comfort / 10))}</div>`;
}

function timelinePlot(ev, opts = {}) {
  const tl = drawTimeline(ev, opts);
  const wrap = el('div', { class: 'tl-wrap', tabindex: '0', role: 'slider', 'aria-label': 'Hourly comfort timeline' });
  const tip = el('div', { class: 'tip' });
  wrap.append(tl.svg, tip);
  const pin = el('div', { class: 'hourpin' });
  const main = el('div', { class: 'tl-main' }, [el('div', { class: 'tl-plot' }, [wrap]), pin]);
  const body = el('div', { class: 'tl-body' }, [main, el('div', { class: 'tl-hint' }, [opts.isToday ? 'Your comfort through the day · hover to inspect, click a point to pin an hour' : 'Forecast comfort through the day · hover or click a point for detail'])]);

  let pinned = null;
  const near = clientX => { const r = wrap.getBoundingClientRect(); const vbx = (clientX - r.left) / r.width * VBW; let b = 0, bd = 1e9; tl.data.forEach((h, i) => { const d = Math.abs(tl.X(h.time) - vbx); if (d < bd) { bd = d; b = i; } }); return b; };
  const place = i => { const h = tl.data[i], x = tl.X(h.time), y = tl.Y(h.comfort); tl.hline.setAttribute('x1', x); tl.hline.setAttribute('x2', x); tl.hdot.setAttribute('cx', x); tl.hdot.setAttribute('cy', y); tl.hdot.setAttribute('stroke', CSSV('--' + bandClsComfort(h.comfort))); };
  const hover = i => { place(i); const x = tl.X(tl.data[i].time); tip.innerHTML = tooltipHTML(ev, tl.data[i]); const px = x / VBW * wrap.clientWidth; tip.style.left = Math.max(82, Math.min(wrap.clientWidth - 82, px)) + 'px'; tip.style.top = '0px'; tip.classList.add('on'); };
  const rest = () => { tip.classList.remove('on'); if (pinned != null) place(pinned); else if (opts.nowIndex != null) place(opts.nowIndex); };
  const showPin = i => { pinned = i; pin.innerHTML = hourDetailHTML(ev, tl.data[i]); pin.classList.add('on'); main.classList.add('pinned'); $('.hp-close', pin).addEventListener('click', e => { e.stopPropagation(); pinned = null; pin.classList.remove('on'); main.classList.remove('pinned'); rest(); }); hover(i); };
  wrap.addEventListener('pointermove', e => { const i = near(e.clientX); if (e.buttons && pinned != null) showPin(i); else hover(i); });
  wrap.addEventListener('pointerdown', e => { e.preventDefault(); wrap.focus(); showPin(near(e.clientX)); });
  wrap.addEventListener('pointerleave', rest);
  wrap.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const cur = pinned != null ? pinned : (opts.nowIndex ?? 0); showPin(Math.max(0, Math.min(tl.data.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)))); } });
  if (opts.nowIndex != null) requestAnimationFrame(() => place(opts.nowIndex));
  return body;
}

function timelineCard(ev, opts = {}) {
  const w = ev.bestWindow, golden = w && bandClsComfort(w.averageComfort) === 'golden', wcls = w ? bandClsComfort(w.averageComfort) : 'muted';
  const tag = w
    ? `<div class="tl-window-tag win-sel" style="border-color:var(--brand-gold)"><div class="rng ${golden ? 'gold-text' : 'c-' + wcls}">${rangeApp(w)}</div><div class="phr ${golden ? 'gold-text' : 'c-' + wcls}">${windowQualityPhrase(w)}</div></div>`
    : `<div class="tl-window-tag" style="border-color:var(--hair)"><div class="rng c-muted">No good window</div><div class="phr c-muted">${headlineFor(ev)}</div></div>`;
  return el('section', { class: 'card tl-card' }, [el('div', { class: 'tl-head' }, [el('div', { html: tag })]), timelinePlot(ev, opts)]);
}

function nowPill(now, label) {
  if (!now) return '';
  const cl = bandCls(now.displayedScore);
  return `<span class="now-badge c-${cl}" style="border-color:color-mix(in srgb,var(--${cl}) 40%,transparent);background:color-mix(in srgb,var(--${cl}) 12%,transparent)"><span class="nl">${label}</span><span class="nn">${scoreText(now.displayedScore)}</span><span>${band(now.displayedScore)}</span></span>`;
}

function heroCard(ev, opts = {}) {
  const golden = isGolden(ev.displayedDayScore), cls = bandCls(ev.displayedDayScore);
  const vw = golden ? `<span class="gold-text">Golden</span> <span class="spark">✦</span>` : `<span class="c-${cls}">${band(ev.displayedDayScore)}</span>`;
  const eyebrow = opts.eyebrow || 'TODAY';
  const w = ev.bestWindow, wcls = w ? bandClsComfort(w.averageComfort) : 'muted', wg = w && wcls === 'golden';
  const bestVal = w ? `${rangeApp(w)} · ${windowQualityPhrase(w)}` : headlineFor(ev);
  const bestCls = w ? (wg ? 'gold-text' : 'c-' + wcls) : 'c-muted';
  const rail = el('div', { class: 'hero-rail', html:
    `<div class="eyebrow ${golden ? 'gold-text' : ''}">${eyebrow}</div>
     <div class="score-row"><div class="ring-wrap">${ringSVG(ev.displayedDayScore, golden)}<div class="ring-num"><span class="s ${golden ? 'gold-text' : ''}">${scoreText(ev.displayedDayScore)}</span><span class="d">/ 10</span></div></div>
       <div class="verdict"><div class="vw">${vw}</div><div class="vsub">${characterPhrase(ev)}.</div></div></div>
     <div class="hero-divider"></div>
     <div class="hero-stat"><span class="hs-k">Best window</span><span class="hs-v ${bestCls}">${bestVal}</span></div>
     <div class="hero-stat"><span class="hs-k">The day</span><span class="hs-v">${skyText(ev.daySky)} · High ${Ts(ev.high)} · Low ${Ts(ev.low)}</span></div>` });
  return el('section', { class: 'card hero' + (golden ? ' gold-glow' : ''), 'data-golden': golden ? '1' : null }, [rail, timelinePlot(ev, opts)]);
}

function metricsInner(ev) {
  return `<div class="metrics">${metricRow(ev).map(x => `<div class="metric">${metricIcon(x.k)}<div class="k">${x.k}</div><div class="v">${x.v}</div><div class="d c-${x.cls}">${x.d}</div></div>`).join('')}</div>`;
}

function nowCard(ev) {
  const now = ev.now;
  const cls = now ? bandCls(now.displayedScore) : 'muted';
  const ring = now
    ? `<div class="score-row"><div class="ring-wrap">${ringSVG(now.displayedScore, false)}<div class="ring-num"><span class="s">${scoreText(now.displayedScore)}</span><span class="d">/ 10</span></div></div>
         <div class="verdict"><div class="vw"><span class="c-${cls}">${band(now.displayedScore)}</span></div><div class="vsub">${nowCharacter(ev)}.</div></div></div>`
    : '';
  return el('section', { class: 'card hero', html:
    `<div class="hero-rail"><div class="eyebrow">RIGHT NOW</div>${ring}</div>
     <div class="now-right"><div class="lab" style="margin:0 0 2px">How it feels — for you</div>${metricsInner(ev)}</div>` });
}

function metricsCard(ev, label, span = 'span4') {
  return el('section', { class: `card ${span}`, html: `<div class="lab">${label}</div>${metricsInner(ev)}` });
}

function breakdownCard(ev) {
  const rows = ev.breakdown.slice().sort((a, b) => factorMag(b) - factorMag(a));
  const maxMag = Math.max(1e-6, ...rows.map(factorMag));
  const body = rows.length ? rows.map(r => { const cls = r.helped ? 'good' : 'poor'; return `<div class="brk-row"><div class="brk-head"><span class="brk-l">${r.label}</span><span class="brk-v c-${cls}">${factorTag(r)}</span></div><div class="brk-bar"><div class="brk-fill fill-${cls}" style="width:${Math.round(Math.max(3, Math.min(100, factorMag(r) / maxMag * 100)))}%"></div></div></div>`; }).join('')
    : `<div class="c-muted" style="font-size:14px">Nothing stands out either way today.</div>`;
  return el('section', { class: 'card span4', html: `<div class="card-head"><span class="ch-t">What helped, what held it back</span><span style="font-size:12px;color:var(--faint)">across the day</span></div><div class="brk">${body}</div>` });
}

function weekdayName(ev) { return ev.isToday ? 'Today' : new Date(ev.rawHours[0].time).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }); }

function miniSpark(ev) {
  let data = ev.hourly.filter(h => { const lh = localHour(h.time); return lh >= PLOT_LO && lh <= PLOT_HI; });
  if (data.length < 2) data = ev.hourly.slice();
  const W = 150, H = 34, domS = data[0].time, domE = data[data.length - 1].time, span = Math.max(1, domE - domS);
  const X = t => 3 + (t - domS) / span * (W - 6), Y = c => H - 3 - Math.max(0, Math.min(1, c / 100)) * (H - 8);
  const P = data.map(h => ({ x: X(h.time), y: Y(h.comfort) }));
  const cls = isGolden(ev.displayedDayScore) ? 'golden' : bandCls(ev.displayedDayScore);
  return `<svg class="wspark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${smoothPath(P)}" fill="none" stroke="var(--${cls})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/></svg>`;
}

function weekMiniCard(week) {
  const rows = week.slice(0, 4).map(d => { const cls = bandCls(d.displayedDayScore), g = isGolden(d.displayedDayScore);
    return `<a href="#/week/${d.index}"><span class="d">${weekdayName(d)}</span><span class="b ${g ? 'gold-badge' : 'bg-' + cls}">${scoreText(d.displayedDayScore)}${g ? ' <span class="spark">✦</span>' : ''}</span><span class="w">${windowText(d)}</span><span class="hl">${T(d.high)}/${T(d.low)}</span></a>`; }).join('');
  return el('section', { class: 'card span2', html: `<div class="card-head"><span class="ch-t">This week</span><a href="#/week">All 7 →</a></div><div class="wk-mini">${rows}</div>` });
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
  const week = evaluateWeekCached();
  const body = el('div', { class: 'today-stack' + (stale ? ' muteall' : '') }, [
    nowCard(ev),
    heroCard(ev, { isToday: true, nowTime: forecast.current && forecast.current.time, nowIndex: nowIndexFor(ev) }),
    el('div', { class: 'dash', style: 'margin-top:0' }, [breakdownCard(ev), weekMiniCard(week)]),
  ]);
  wrap.append(body, footer());
  root.append(wrap);
}

function viewWeek(root) {
  const week = evaluateWeekCached();
  const wrap = el('div', { class: 'wrap' });
  if (stale) wrap.append(staleBanner());
  wrap.append(el('div', { class: 'lab' }, ['Next 7 days · your personal score & best window']));
  const bestIdx = week.reduce((b, d) => d.displayedDayScore > week[b].displayedDayScore ? d.index : b, 0);
  const grid = el('div', { class: 'week7' });
  week.forEach(d => {
    const cls = bandCls(d.displayedDayScore), g = isGolden(d.displayedDayScore), isBest = d.index === bestIdx && week.length > 1;
    grid.append(el('a', { href: `#/week/${d.index}`, class: 'wday' + (g ? ' sel gold-glow' : '') + (isBest && !g ? ' best' : ''), html:
      `<div class="wtop">${isBest ? 'Best day' : ''}</div>
       <div class="wn">${weekdayName(d)}</div><div class="wsky">${skyEmoji(d.daySky)}</div>
       <div class="wbadge ${g ? 'gold-badge' : 'bg-' + cls}">${scoreText(d.displayedDayScore)}${g ? ' <span class="spark">✦</span>' : ''}</div>
       <div class="wband ${g ? 'gold-text' : 'c-' + cls}">${band(d.displayedDayScore)}</div>
       ${miniSpark(d)}
       <div class="wwin">${windowText(d)}</div><div class="wchar">${characterPhrase(d)}</div><div class="whl">${T(d.high)}° / ${T(d.low)}°</div>` }));
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
  const body = el('div', { class: 'today-stack' }, [
    heroCard(ev, { eyebrow: name.toUpperCase(), nowTime: i === 0 && forecast.current ? forecast.current.time : null, nowIndex: i === 0 ? nowIndexFor(ev) : null }),
    metricsCard(ev, `What ${name} feels like — for you`, 'span6'),
  ]);
  wrap.append(body, footer());
  root.append(wrap);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const PLAN_ICON = '<svg class="icon sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>';

function planScore(days) {
  const p = { ...sensibleDefault, ...profile };
  return days.map(d => {
    const ev = evaluateDay({ updatedAt: d.hours[0].time, current: null, days: [d], latitude: 0, longitude: 0 }, 0, p, d.hours[0].time);
    return { month: d.month, dom: d.dom, score: ev.displayedDayScore, ev, day: d };
  });
}
function planYear(scored) {
  const byM = {}; for (const r of scored) (byM[r.month] = byM[r.month] || []).push(r.score);
  const out = []; for (let m = 1; m <= 12; m++) out.push({ month: m, score: byM[m] && byM[m].length ? mean(byM[m]) : null });
  return out;
}
function bestWindow(perDom) {
  const n = perDom.length, w = Math.min(12, Math.max(7, Math.round(n * 0.4)));
  let best = { start: 1, end: w, avg: -1 };
  for (let i = 0; i + w <= n; i++) { const seg = perDom.slice(i, i + w).filter(x => x != null); if (!seg.length) continue; const a = mean(seg); if (a > best.avg) best = { start: i + 1, end: i + w, avg: a }; }
  return best;
}
function planCharacter(rows) {
  const avgs = rows.map(r => dayAverages(r.ev)).filter(Boolean);
  if (!avgs.length) return 'A mixed month.';
  const wetDays = rows.filter(r => r.day.hours.reduce((a, h) => a + h.precipMM, 0) >= 2.5);
  const wetFrac = wetDays.length / rows.length;
  const wetHours = wetDays.flatMap(r => r.day.hours).filter(h => precipType(h.weatherCode) !== 'none');
  const snowy = wetHours.length > 0 && wetHours.filter(h => precipType(h.weatherCode) === 'snow').length / wetHours.length >= 0.5;
  const A = { apparentF: mean(avgs.map(a => a.apparentF)), cloud: mean(avgs.map(a => a.cloud)), dewF: mean(avgs.map(a => a.dewF)), precipType: snowy ? 'snow' : 'rain' };
  const agg = {};
  for (const r of rows) for (const b of r.ev.breakdown) { if (b.factor === 'precipitation') continue; const x = agg[b.factor] = agg[b.factor] || { factor: b.factor, label: b.label, weight: b.weight, s: [] }; x.s.push(b.score); }
  const ranked = Object.values(agg).map(x => ({ factor: x.factor, label: x.label, weight: x.weight, score: mean(x.s), helped: CAN_HELP[x.factor] ? mean(x.s) >= 0.5 : false }));
  if (wetFrac >= CONFIG.characterRainDayFraction) ranked.push({ factor: 'precipitation', label: 'Rain', weight: CONFIG.weightPrecipitation, score: 1 - wetFrac, helped: false });
  ranked.sort((a, b) => factorMag(b) - factorMag(a));
  const material = ranked.filter(r => factorMag(r) > 1e-6);
  return material.length ? combineClauses(material, A) : 'Comfortable and steady.';
}
function planExpect(rows, years) {
  const feelsHi = mean(rows.map(r => Math.max(...r.day.hours.filter(h => h.isDay).map(h => h.apparentF).concat([-99]))));
  const feelsLo = mean(rows.map(r => Math.min(...r.day.hours.map(h => h.apparentF))));
  const dl = r => { const d = r.day.hours.filter(h => h.isDay); return d.length ? d : r.day.hours; };
  const cloud = mean(rows.map(r => mean(dl(r).map(h => h.cloud))));
  const compAvg = f => { const vals = rows.flatMap(r => { const us = r.ev.hourly.filter(h => h.isInOutdoorBand && h.isSafe); const p = us.length ? us : r.ev.hourly; return p.map(h => h.components[f]).filter(v => v != null); }); return vals.length ? mean(vals) : null; };
  const cSun = compAvg('sunSky'), cMug = compAvg('mugginess');
  const dew = mean(rows.map(r => mean(r.day.hours.map(h => h.dewF))));
  const sunnyFrac = mean(rows.map(r => mean(dl(r).map(h => h.cloud)) < 0.4 ? 1 : 0));
  const sunWord = sunnyFrac >= 0.6 ? 'Generally sunny' : cloud < 0.45 ? 'Mostly sunny' : cloud < 0.65 ? 'Sun and clouds' : 'Often cloudy';
  const wetDays = rows.filter(r => r.day.hours.reduce((a, h) => a + h.precipMM, 0) >= 2.5);
  const isSoaker = r => { const tot = r.day.hours.reduce((a, h) => a + h.precipMM, 0); const wet = r.day.hours.filter(h => h.precipMM >= 0.2).length; return wet >= 5 || tot >= 10; };
  const rpm = wetDays.length / years, soakPm = wetDays.filter(isSoaker).length / years, showerPm = rpm - soakPm;
  const rainNote = rpm < 0.5 ? 'rarely' : Math.round(soakPm) === 0 ? 'brief showers' : Math.round(showerPm) === 0 ? 'soaking rain' : `${Math.round(soakPm)} soaking`;
  return {
    feelsHi: Math.round(feelsHi), feelsLo: Math.round(feelsLo),
    sun: { word: sunWord, cls: compCls(cSun) },
    mug: (feelsHi >= CONFIG.mugginessGateFeelsF && cMug != null) ? { word: dew >= CONFIG.summaryMuggyDewF ? 'Muggy afternoons' : dew <= CONFIG.summaryDryDewF ? 'Dry' : cMug >= 0.75 ? 'Comfortable' : 'Humid afternoons', cls: compCls(cMug) } : null,
    rain: { word: `~${Math.round(rpm)} days`, note: rainNote, cls: rpm <= 6 ? 'good' : rpm <= 10 ? 'decent' : 'poor' },
  };
}
function planHeads(rows, years) {
  const per = n => Math.max(1, Math.round(n / years));
  const hot = rows.filter(r => r.day.hours.some(h => h.isDay && h.apparentF >= 100)).length;
  const cold = rows.filter(r => r.day.hours.some(h => h.apparentF <= 15)).length;
  const storm = rows.filter(r => r.day.hours.some(h => [95, 96, 99].includes(h.weatherCode))).length;
  const maxFeels = Math.round(Math.max(...rows.flatMap(r => r.day.hours.map(h => h.apparentF))));
  if (hot >= years) return { warn: true, text: `Hot — about ${per(hot)} day${per(hot) > 1 ? 's' : ''} a month typically reach dangerous heat (felt as high as ${maxFeels}°). Plan indoor midday breaks.` };
  if (storm >= years) return { warn: true, text: `Thunderstorms on ~${per(storm)} days a month. Keep a flexible plan.` };
  if (cold >= years) return { warn: true, text: `Cold — around ${per(cold)} day${per(cold) > 1 ? 's' : ''} a month turn dangerously cold. Bundle up.` };
  return { warn: false, text: `Nothing extreme — no dangerous heat or cold in ${years} years. The hottest it ever felt was ${maxFeels}°.` };
}
function planMonth(scored, month) {
  const rows = scored.filter(r => r.month === month);
  if (!rows.length) return null;
  const scores = rows.map(r => r.score).sort((a, b) => a - b);
  const years = new Set(rows.map(r => r.day.dateKey.slice(0, 4))).size;
  const dim = DIM[month - 1];
  const dist = { golden: 0, great: 0, good: 0, decent: 0, poor: 0, bad: 0 };
  for (const r of rows) dist[bandCls(r.score)]++;
  const distMonth = {}; for (const k in dist) distMonth[k] = Math.round(dist[k] / years);
  const byDom = {}; for (const r of rows) (byDom[r.dom] = byDom[r.dom] || []).push(r.score);
  const perDom = []; for (let d = 1; d <= dim; d++) perDom.push(byDom[d] && byDom[d].length ? mean(byDom[d]) : null);
  return {
    month, typical: mean(scores), band: band(mean(scores)), dist: distMonth, perDom, dim, years,
    goodPct: Math.round(100 * scores.filter(s => s >= 7).length / scores.length),
    lo: scores[Math.floor(scores.length * 0.1)], hi: scores[Math.floor(scores.length * 0.9)],
    character: planCharacter(rows), expect: planExpect(rows, years), heads: planHeads(rows, years), sweet: bestWindow(perDom),
  };
}

async function planSearch(q) { try { const r = await geocode(q); if (!r) return false; loadPlan({ lat: r.lat, lon: r.lon, name: r.name }); return true; } catch { return false; } }
async function loadPlan(loc) {
  plan.loc = loc; store.set('gw.planloc', loc); store.set('gw.planmonth', plan.month);
  const key = `${roundCoord(loc.lat)},${roundCoord(loc.lon)}`;
  if (plan.locKey === key && plan.scored) { route(); return; }
  plan.loading = true; plan.error = null; plan.scored = null; plan.locKey = key; route();
  try {
    const days = await fetchHistoricalYears(roundCoord(loc.lat), roundCoord(loc.lon), PLAN_YEARS);
    if (plan.locKey !== key) return;
    plan.scored = planScore(days); plan.loading = false; route();
  } catch (e) { plan.loading = false; plan.error = e; route(); }
}
function setPlanMonth(m) { plan.month = m; store.set('gw.planmonth', m); route(); }

function planCalendar(a) {
  const cells = a.perDom.map((v, i) => {
    const d = i + 1; const sweet = d >= a.sweet.start && d <= a.sweet.end;
    if (v == null) return `<div class="pcell empty"><span class="d">${d}</span></div>`;
    const cls = bandCls(v), inten = Math.round(Math.max(0, Math.min(1, (v - 5) / 4)) * 34 + 8);
    return `<div class="pcell${sweet ? ' sweet' : ''}" style="background:color-mix(in srgb,var(--${cls}) ${inten}%,var(--card))"><span class="d">${d}</span><span class="sc c-${cls}">${scoreText(v)}</span></div>`;
  }).join('');
  return `<div class="pcal-head"><span class="t">Day by day — when to go</span><span class="pcal-leg"><i style="background:color-mix(in srgb,var(--great) 42%,#fff)"></i>Great <i style="background:color-mix(in srgb,var(--good) 26%,#fff)"></i>Good <i style="background:color-mix(in srgb,var(--decent) 22%,#fff)"></i>Decent</span></div>
    <div class="pcal">${cells}</div>
    <div class="pcal-note"><b>${MONTHS_SHORT[a.month - 1]} ${a.sweet.start}–${a.sweet.end} is your sweet spot</b> (outlined) — the best stretch of the month for you.</div>`;
}
function planOdds(a) {
  const order = ['golden', 'great', 'good', 'decent', 'poor', 'bad'], lbl = { golden: 'Gold', great: 'Great', good: 'Good', decent: 'Dec', poor: 'Poor', bad: 'Bad' };
  const max = Math.max(1, ...order.map(k => a.dist[k]));
  const bars = order.map(k => { const c = a.dist[k], h = Math.round(Math.max(4, c / max * 100)); const on = c > 0; return `<div class="pbar"><span class="v ${on ? 'c-' + k : 'c-muted'}">${c}</span><div class="pfill" style="height:${h}%;background:${on ? 'var(--' + k + ')' : 'var(--hair)'}"></div><span class="k">${lbl[k]}</span></div>`; }).join('');
  return `<div class="eyebrow">What are the odds</div><div class="pdist">${bars}</div><div class="psum"><b>About ${Math.round(a.goodPct / 10)} in 10 days are Good or better${a.goodPct >= 50 ? '' : ' — a mixed month'}.</b> Typical day lands ${scoreText(a.lo)}–${scoreText(a.hi)}.</div>`;
}
const SUN_IC = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
function planExpectCard(a) {
  const e = a.expect;
  const row = (inner, lab, val, cls) => `<div class="exprow"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg><span class="lab">${lab}</span><span class="val ${cls ? 'c-' + cls : ''}">${cls ? `<span class="dot" style="background:var(--${cls})"></span>` : ''}${val}</span></div>`;
  const p = d => `<path d="${d}"/>`;
  return `<div class="eyebrow">What to expect</div>
    ${row(p(MI['Feels like']), 'Feels-like high / low', `${Ts(e.feelsHi)} / ${Ts(e.feelsLo)}`, '')}
    ${row(SUN_IC, 'Sun', e.sun.word, e.sun.cls)}
    ${e.mug ? row(p(MI['Dew point']), 'Mugginess', e.mug.word, e.mug.cls) : ''}
    ${row(p(MI.Rain), 'Rain', `${e.rain.word}<span class="sub">· ${e.rain.note}</span>`, e.rain.cls)}`;
}
function planYearCard() {
  const yr = planYear(plan.scored), vals = yr.filter(m => m.score != null).map(m => m.score);
  const lo = Math.min(...vals) - 0.4, hi = Math.max(...vals) + 0.2;
  const bars = yr.map(m => {
    if (m.score == null) return `<div class="ybar"><span class="k">${MONTHS_SHORT[m.month - 1]}</span></div>`;
    const cls = bandCls(m.score), h = Math.round(Math.max(6, (m.score - lo) / (hi - lo) * 100)), sel = m.month === plan.month;
    return `<a class="ybar${sel ? ' sel' : ''}" href="#/plan" onclick="return false" data-m="${m.month}"><span class="v c-${cls}">${scoreText(m.score)}</span><div class="yfill" style="height:${h}%;background:var(--${cls})"></div><span class="k">${MONTHS_SHORT[m.month - 1]}</span></a>`;
  }).join('');
  const ranked = yr.filter(m => m.score != null).sort((a, b) => b.score - a.score);
  const rank = ranked.findIndex(m => m.month === plan.month) + 1;
  return { html: `<div class="eyebrow">Best months here · for you — the whole year</div><div class="pyear">${bars}</div><div class="pyear-note">${MONTHS[plan.month - 1]} ranks <b>#${rank} of 12</b> here${rank <= 3 ? ' — one of your best bets' : ''}. Tap a month to switch.</div>`, ranked };
}

function planHeader() {
  return el('div', { class: 'plan-topline' }, [
    el('div', { class: 'crumb', html: `<a href="#/plan" onclick="return false" id="plan-change">← Change place</a> · ${plan.loc.name}` }),
    el('div', { class: 'plan-monthpick' }, MONTHS_SHORT.map((m, i) => el('button', { class: 'pm' + (plan.month === i + 1 ? ' on' : ''), onclick: () => setPlanMonth(i + 1) }, [m]))),
  ]);
}
function planEntry() {
  const err = el('div', { class: 'err-inline', style: 'text-align:center' });
  const inp = el('input', { class: 'addr-in', placeholder: 'Search a city…', onkeydown: async e => { if (e.key === 'Enter' && e.target.value.trim()) { err.textContent = ''; const ok = await planSearch(e.target.value.trim()); if (!ok) err.textContent = 'No match — try another name.'; } } });
  const grid = el('div', { class: 'plan-months' }, MONTHS_SHORT.map((m, i) => el('button', { class: 'mo' + (plan.month === i + 1 ? ' on' : ''), onclick: () => { plan.month = i + 1; store.set('gw.planmonth', plan.month); route(); } }, [m])));
  return el('div', { class: 'plan-entry' }, [
    el('div', { class: 'plan-glyph' }, ['🧭']),
    el('h2', {}, ['Plan around your weather']),
    el('p', { class: 'plan-tag' }, ['See how good a place is likely to feel — for you — in any month, from years of history.']),
    el('div', { class: 'search plan-search', html: PLAN_ICON }, [inp]),
    err, grid,
    el('p', { class: 'plan-hint2' }, [`Pick a month, then search a place. Scored over ${PLAN_YEARS.length} years of history.`]),
  ]);
}
function planLoading() {
  return el('div', { class: 'plan-loading' }, [el('div', { class: 'plan-spin' }), el('div', {}, [`Reading ${PLAN_YEARS.length} years of ${MONTHS[plan.month - 1]} in ${plan.loc.name.split(',')[0]}…`]), el('div', { class: 'plan-sub' }, ['Scoring every historical day for you.'])]);
}

function planResults() {
  const a = planMonth(plan.scored, plan.month);
  if (!a) return el('div', { class: 'card' }, ['No data for this month.']);
  const golden = isGolden(a.typical), cls = bandCls(a.typical);
  const hero = el('section', { class: 'card hero' }, [
    el('div', { class: 'hero-rail', html:
      `<div class="eyebrow ${golden ? 'gold-text' : ''}">Typical ${MONTHS[a.month - 1]} · for you</div>
       <div class="score-row"><div class="ring-wrap">${ringSVG(a.typical, golden)}<div class="ring-num"><span class="s ${golden ? 'gold-text' : ''}">${scoreText(a.typical)}</span><span class="d">/ 10</span></div></div>
         <div class="verdict"><div class="vw"><span class="${golden ? 'gold-text' : 'c-' + cls}">${band(a.typical)}${golden ? ' <span class="spark">✦</span>' : ''}</span> <span class="now-badge c-${cls}" style="border-color:color-mix(in srgb,var(--${cls}) 40%,transparent);background:color-mix(in srgb,var(--${cls}) 12%,transparent);font-size:11px">TYPICAL</span></div><div class="vsub">${a.character}.</div></div></div>
       <div class="hero-divider"></div>
       <div class="hero-stat"><span class="hs-k">Usual range</span><span class="hs-v">${scoreText(a.lo)} – ${scoreText(a.hi)} · ${band(a.lo)} to ${band(a.hi)}</span></div>
       <div class="hero-stat"><span class="hs-k">Based on</span><span class="hs-v">${a.years} ${MONTHS_SHORT[a.month - 1]}s · ${PLAN_YEARS[0]}–${PLAN_YEARS[PLAN_YEARS.length - 1]}</span></div>` }),
    el('div', { class: 'pcalwrap', html: planCalendar(a) }),
  ]);
  const dash = el('div', { class: 'dash' }, [el('section', { class: 'card', html: planOdds(a) }), el('section', { class: 'card', html: planExpectCard(a) })]);
  const yc = planYearCard();
  const year = el('section', { class: 'card', style: 'margin-top:20px', html: yc.html });
  year.querySelectorAll('.ybar[data-m]').forEach(b => b.addEventListener('click', () => setPlanMonth(+b.dataset.m)));
  const heads = el('section', { class: 'card' + (a.heads.warn ? ' plan-warn' : ' calm'), html: `<span class="k">Heads up</span><p>${a.heads.text}</p>` });
  const foot = el('div', { class: 'footnote' }, ['Typical values from history — not a forecast. Plan the fine detail closer to your dates.']);
  return el('div', {}, [hero, dash, year, heads, foot]);
}

function viewPlan(root) {
  const wrap = el('div', { class: 'wrap' });
  if (!plan.loc) { wrap.append(planEntry(), footer()); root.append(wrap); return; }
  wrap.append(planHeader());
  if (plan.loading) { wrap.append(planLoading()); root.append(wrap); return; }
  if (plan.error) { wrap.append(el('div', { class: 'state-center err', html: `<h2>Couldn't load the history</h2><p>The weather archive didn't respond. Try again.</p>` }), el('div', { style: 'text-align:center' }, [el('button', { class: 'btn', onclick: () => loadPlan(plan.loc) }, ['Try again'])])); root.append(wrap); return; }
  if (!plan.scored) { wrap.append(planEntry()); root.append(wrap); return; }
  wrap.append(planResults(), footer());
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

  const about = el('section', { class: 'card set-card', style: 'grid-column:1/-1' });
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
function footer() { return el('div', { class: 'foot', html: '<div class="foot-tag">Golden Window finds the best time to be outside today — a personal weather score for how good it is to be out, tuned to how you like it, not a generic forecast.</div>Weather by <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> · Built by <a href="https://github.com/mabenson00" target="_blank" rel="noopener">Michael Benson</a> · no account, no tracking' }); }

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
  [['Today', '#/today'], ['Week', '#/week'], ['Plan', '#/plan'], ['Settings', '#/settings']].forEach(([t, h]) => {
    const active = (h === '#/today' && isTodayPath(path)) || (h === '#/week' && path.startsWith('#/week')) || (h === '#/plan' && path.startsWith('#/plan')) || (h === '#/settings' && path.startsWith('#/settings'));
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
  return bar;
}

function locationHash() { return window.location.hash || '#/today'; }
function isTodayPath(p) { return p === '' || p === '#/' || p === '#/today'; }
function navigate(h) { if (window.location.hash === h) route(); else window.location.hash = h; }

function route() {
  const root = $('#root'); if (!root) return;
  root.innerHTML = '';
  const path0 = locationHash();
  if (path0.startsWith('#/plan')) { root.append(topbarSafe()); return viewPlan(root); }
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

function obProfile() {
  return { ...sensibleDefault, idealFeelsLikeF: Math.round(ob.ideal), heatSensitivity: ob.tempSens, coldSensitivity: ob.tempSens, sunPreference: ob.sun, mugginessSensitivity: ob.mug, rainTolerance: ob.rain, snowTolerance: ob.snow, windSensitivity: ob.windSens, importanceWind: ob.windCares ? 1 : 0 };
}
function obSample(fields, forceWind) {
  const t = Date.UTC(2024, 5, 15, 12, 0, 0);
  const p = obProfile(); if (forceWind) p.importanceWind = 1;
  const mk = time => ({ time, dateKey: '2024-06-15', temperatureF: fields.apparentF, apparentF: fields.apparentF, dewF: fields.dewF, humidity: 0.5, cloud: fields.cloud, precipProb: fields.precipProb, precipMM: fields.precipMM, weatherCode: fields.code, windMph: fields.windMph ?? 4, windGustMph: 4, isDay: fields.daylight, aqi: 30, conditionText: '' });
  const day = { dateKey: '2024-06-15', sunrise: t - 6 * 3600e3, sunset: t + 6 * 3600e3, high: fields.apparentF + 4, low: fields.apparentF - 10, code: fields.code, hours: [mk(t), mk(t + 3600e3)] };
  const res = evaluate({ updatedAt: t, current: mk(t), days: [day], latitude: 0, longitude: 0 }, p, t);
  const s = res.hourly.reduce((b, h) => Math.abs(h.time - t) < Math.abs(b.time - t) ? h : b, res.hourly[0]);
  return s.components;
}
const obVerdict = (s, cond, opts) => ({ text: opts.find(o => s >= o[0])[1], cls: compCls(s), condition: cond });
function vTemp() { return obVerdict(obSample({ apparentF: 84, dewF: 52, cloud: 0.15, precipProb: 0, precipMM: 0, code: 1, daylight: true }).temperature, '84°F', [[0.82, 'still feels great'], [0.6, 'feels comfortable'], [0.38, 'starts to feel warm'], [0, 'feels too warm']]); }
function vSun() { return obVerdict(obSample({ apparentF: 70, dewF: 50, cloud: 0.7, precipProb: 0, precipMM: 0, code: 3, daylight: true }).sunSky, '70% cloud cover', [[0.85, "clouds don't bother you"], [0.6, "you'd want more sun"], [0, "you'd really miss the sun"]]); }
function vMug() { return obVerdict(obSample({ apparentF: 78, dewF: 70, cloud: 0.4, precipProb: 0, precipMM: 0, code: 2, daylight: true }).mugginess, '70°F dew point', [[0.7, "you'd barely notice"], [0.45, "you'd feel the mugginess"], [0, 'flagged as too muggy']]); }
function vRain() { return obVerdict(obSample({ apparentF: 60, dewF: 55, cloud: 0.9, precipProb: 0.6, precipMM: 1.5, code: 61, daylight: true }).precipitation, '60% chance of rain', [[0.7, "wouldn't stop you"], [0.4, "would give you pause"], [0, 'would keep you in']]); }
function vSnow() { return obVerdict(obSample({ apparentF: 30, dewF: 26, cloud: 0.9, precipProb: 0.6, precipMM: 1.5, code: 71, daylight: true }).precipitation, 'snow at 30°F', [[0.7, "you'd head out anyway"], [0.4, "you'd think twice"], [0, "you'd rather skip it"]]); }
function vWind() { return obVerdict(obSample({ apparentF: 66, dewF: 48, cloud: 0.3, precipProb: 0, precipMM: 0, code: 1, daylight: true, windMph: 14 }, true).wind ?? 1, '14 mph wind', [[0.7, 'barely slows you down'], [0.5, "you'd feel the gusts"], [0.3, 'a real headwind'], [0, 'strong wind ruins it']]); }

function obChip(fn) {
  const c = el('div', {});
  const set = () => { const v = fn(); c.className = 'ob-chip c-' + v.cls; c.innerHTML = `<span class="ob-chip-k">${v.condition}</span><span class="ob-chip-v">${v.text}</span>`; };
  set();
  return { el: c, set };
}
function obSlider({ min = 0, max = 1, step = 0.01, value, caption, left, right, boldLeft, onInput }) {
  const inp = el('input', { type: 'range', min, max, step, value, oninput: e => onInput(parseFloat(e.target.value)) });
  return el('div', { class: 'ob-slider' }, [
    caption ? el('div', { class: 'ob-cap' }, [caption]) : null,
    inp,
    el('div', { class: 'ob-slabel' }, [el('span', { class: boldLeft ? 'strong' : '' }, [left]), el('span', {}, [right])]),
  ]);
}
function obHeader(q, hint) { return el('div', { class: 'ob-header', html: `<h2>${q}</h2><p>${hint}</p>` }); }

function obStepContent() {
  switch (ob.step) {
    case 0: return el('div', { class: 'ob-welcome', html: `<div class="ob-art">${glyphSVG('partly')}</div><h1>Golden Window</h1><p>Other apps tell you the weather. This one tells you when <i>you'll</i> enjoy being outside — once it learns what good weather means to you. A few quick questions.</p>` });
    case 1: {
      const node = el('div', { class: 'ob-step' }, [obHeader('What temperature feels perfect?', 'Your feels-like sweet spot. How fast it starts to feel too hot or cold is a separate dial below.')]);
      const big = el('div', { class: 'ob-big' }, [`${Math.round(ob.ideal)}°`]);
      const chip = obChip(vTemp);
      node.append(big,
        obSlider({ min: 45, max: 90, step: 1, value: ob.ideal, left: '45°', right: '90°', onInput: v => { ob.ideal = v; big.textContent = `${Math.round(v)}°`; chip.set(); } }),
        obSlider({ value: ob.tempSens, caption: 'How quickly does off-ideal get uncomfortable?', left: 'Easygoing', right: 'Very sensitive', onInput: v => { ob.tempSens = v; chip.set(); } }),
        chip.el);
      return node;
    }
    case 2: {
      const chip = obChip(vSun);
      return el('div', { class: 'ob-step' }, [obHeader('How much do you want the sun?', 'One slider covers sun, clouds, and whether dark hours can ever win. Toward the top, only daylight scores well; toward the bottom, cloudy and even night hours become fine.'),
        obSlider({ value: ob.sun, left: 'Clouds / night ok', right: 'Loves sun', onInput: v => { ob.sun = v; chip.set(); } }), chip.el]);
    }
    case 3: {
      const chip = obChip(vMug);
      return el('div', { class: 'ob-step' }, [obHeader('When does humidity ruin it?', 'On warm days humidity already counts toward the feels-like temperature. This is an extra way to tell us how much it bothers you.'),
        obSlider({ value: ob.mug, left: "Doesn't bother me", right: 'I hate mugginess', onInput: v => { ob.mug = v; chip.set(); } }), chip.el]);
    }
    case 4: {
      const rc = obChip(vRain), sc = obChip(vSnow);
      return el('div', { class: 'ob-step' }, [obHeader('Rain & snow', 'Two quick tolerances, kept separate — plenty of people love snow but not rain.'),
        obSlider({ value: ob.rain, caption: 'A little rain is…', left: 'A dealbreaker', right: 'Fine', boldLeft: true, onInput: v => { ob.rain = v; rc.set(); } }), rc.el,
        obSlider({ value: ob.snow, caption: 'Snow is…', left: 'Avoid', right: 'Love it', onInput: v => { ob.snow = v; sc.set(); } }), sc.el]);
    }
    case 5: {
      const node = el('div', { class: 'ob-step' }, [obHeader('Do you care about wind?', "Cyclists and runners often mind a stiff headwind. If wind isn't your concern, skip it — it won't affect your scores at all. (The chill from wind is already in the feels-like temperature.)"),
        el('div', { class: 'ob-windicon' + (ob.windCares ? ' on' : ''), html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:40px;height:40px"><path d="M3 8h11a3 3 0 10-3-3M3 16h15a3 3 0 11-3 3M3 12h7"/></svg>' })]);
      if (ob.windCares) {
        const chip = obChip(vWind);
        node.append(obSlider({ value: ob.windSens, caption: 'How much does a strong wind bother you?', left: 'A light breeze is fine', right: 'Strong wind ruins it', onInput: v => { ob.windSens = v; chip.set(); } }), chip.el,
          el('button', { class: 'ob-link', onclick: () => { ob.windCares = false; obRender(); } }, ["Actually, I don't care about wind"]));
      } else {
        node.append(el('p', { class: 'ob-note' }, ['Wind is off by default. Choose “Wind matters to me” to set how sensitive you are, or skip to leave it out.']));
      }
      return node;
    }
    case 6: {
      const node = el('div', { class: 'ob-loc' }, [
        el('div', { class: 'ob-loc-icon', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="width:44px;height:44px"><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>' }),
        obHeader(ob.sub === 'ask' ? 'Where are you?' : 'Enter a location', 'Used only to fetch the forecast. It stays in your browser, and coordinates are rounded before any lookup.'),
      ]);
      if (ob.sub === 'ask') {
        node.append(el('div', { class: 'ob-privacy', html: `<div class="ob-priv-k">Your privacy</div><div class="ob-priv-v">Only to fetch your forecast · never in the background · never sold or shared</div>` }));
      } else {
        const inp = el('input', { class: 'addr-in', placeholder: 'City, ZIP, or address', value: ob.addr, oninput: e => ob.addr = e.target.value, onkeydown: e => { if (e.key === 'Enter') obSubmitAddress(); } });
        node.append(el('div', { class: 'addr-field' }, [inp, el('button', { class: 'btn', onclick: obSubmitAddress }, [ob.searching ? '…' : 'Use this location'])]));
        if (ob.err) node.append(el('div', { class: 'err-inline' }, [ob.err]));
        node.append(el('button', { class: 'ob-link', onclick: () => { ob.sub = 'ask'; ob.err = ''; obRender(); } }, ['Back to location options']));
      }
      return node;
    }
  }
}

function obFooter() {
  const P = (t, fn) => el('button', { class: 'btn block', onclick: fn }, [t]);
  const G = (t, fn) => el('button', { class: 'btn ghost block', onclick: fn }, [t]);
  const f = el('div', { class: 'ob-footer' });
  if (ob.step === 0) f.append(P('Get started', () => obGo(1)), G('Use sensible defaults', obUseDefaults));
  else if (ob.step === 5) ob.windCares ? f.append(P('Next', obAdvance)) : f.append(P('Wind matters to me', () => { ob.windCares = true; obRender(); }), G("I don't care about wind", () => { ob.windCares = false; obAdvance(); }));
  else if (ob.step === 6) {
    if (ob.sub === 'ask') f.append(ob.locating ? el('div', { class: 'ob-locating' }, ['Getting your location…']) : P('Use current location', obUseLocation), G('Enter an address instead', () => { ob.sub = 'addressEntry'; ob.err = ''; obRender(); }));
    else f.append(G('Skip for now', finishOnboarding));
  } else f.append(P('Next', obAdvance));
  return f;
}

function obRender() {
  const root = $('#root'); if (!root) return;
  root.innerHTML = '';
  const top = el('div', { class: 'ob-top' }, [
    ob.step > 1 ? el('button', { class: 'ob-back', onclick: obBack }, ['‹ Back']) : null,
    el('span', { class: 'grow' }),
    ob.step > 0 ? el('button', { class: 'ob-skip', onclick: finishOnboarding }, ['Skip']) : null,
  ]);
  const content = el('div', { class: 'ob-content' });
  if (ob.step >= 1) { const d = el('div', { class: 'ob-dots' }); for (let i = 0; i < 6; i++) d.append(el('span', { class: 'ob-dot' + (i < ob.step - 1 ? ' done' : i === ob.step - 1 ? ' on' : '') })); content.append(d); }
  content.append(obStepContent());
  root.append(el('div', { class: 'ob' }, [top, content, obFooter()]));
}

function obGo(step) { ob.step = step; ob.sub = 'ask'; obRender(); }
function obAdvance() { ob.step < 6 ? obGo(ob.step + 1) : finishOnboarding(); }
function obBack() { if (ob.step > 0) obGo(ob.step - 1); }
function obUseDefaults() { profile = { ...sensibleDefault }; store.set('gw.profile', profile); store.set('gw.onboarded', true); ob = null; boot(); }
function finishOnboarding() { profile = obProfile(); store.set('gw.profile', profile); store.set('gw.onboarded', true); ob = null; boot(); }
function obUseLocation() {
  if (!navigator.geolocation) { ob.sub = 'addressEntry'; obRender(); return; }
  ob.locating = true; obRender();
  navigator.geolocation.getCurrentPosition(
    pos => { location = { lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude), name: 'Current location' }; store.set('gw.loc', location); finishOnboarding(); },
    () => { ob.locating = false; ob.sub = 'addressEntry'; obRender(); }, { timeout: 8000 });
}
async function obSubmitAddress() {
  const q = (ob.addr || '').trim(); if (!q) return;
  ob.err = ''; ob.searching = true; obRender();
  try {
    const r = await geocode(q);
    if (!r) { ob.searching = false; ob.err = "We couldn't find that place. Try a city, ZIP code, or full address."; obRender(); return; }
    location = { lat: r.lat, lon: r.lon, name: r.name }; store.set('gw.loc', location); finishOnboarding();
  } catch { ob.searching = false; ob.err = "Couldn't look up that address. Check your connection and try again."; obRender(); }
}

function startOnboarding() {
  ob = { step: 0, sub: 'ask', ideal: sensibleDefault.idealFeelsLikeF, tempSens: (sensibleDefault.heatSensitivity + sensibleDefault.coldSensitivity) / 2, sun: sensibleDefault.sunPreference, mug: sensibleDefault.mugginessSensitivity, rain: sensibleDefault.rainTolerance, snow: sensibleDefault.snowTolerance, windSens: sensibleDefault.windSensitivity, windCares: sensibleDefault.importanceWind > 0, addr: '', err: '', locating: false, searching: false };
  obRender();
}

function boot() {
  window.addEventListener('hashchange', route);
  if (cache && cache.forecast) { forecast = cache.forecast; fetchedReal = cache.fetchedReal || 0; stale = (Date.now() - fetchedReal) > STALE_MS; }
  route();
  load();
  if (!location && navigator.geolocation) navigator.geolocation.getCurrentPosition(
    pos => { location = { lat: roundCoord(pos.coords.latitude), lon: roundCoord(pos.coords.longitude), name: 'Current location' }; store.set('gw.loc', location); load(); },
    () => {}, { timeout: 8000 });
}

function init() { if (onboarded) boot(); else startOnboarding(); }

init();
