const CODE_TEXT = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Violent rain showers',
  85: 'Snow showers', 86: 'Snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
};
export function conditionText(code) { return CODE_TEXT[code] ?? 'Unknown'; }

function parseLocal(iso) {
  if (!iso) return null;
  return Date.parse(iso.endsWith('Z') ? iso : iso + 'Z');
}

export async function fetchForecast(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    hourly: 'temperature_2m,apparent_temperature,dew_point_2m,relative_humidity_2m,cloud_cover,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,cloud_cover,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,is_day',
    daily: 'sunrise,sunset,weather_code,temperature_2m_max,temperature_2m_min',
    temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'mm',
    timezone: 'auto', forecast_days: '7',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const j = await res.json();

  const h = j.hourly;
  const hours = h.time.map((iso, i) => ({
    time: parseLocal(iso), dateKey: iso.slice(0, 10),
    temperatureF: h.temperature_2m[i], apparentF: h.apparent_temperature[i], dewF: h.dew_point_2m[i],
    humidity: (h.relative_humidity_2m[i] ?? 0) / 100,
    cloud: (h.cloud_cover[i] ?? 0) / 100, precipProb: (h.precipitation_probability[i] ?? 0) / 100,
    precipMM: h.precipitation[i] ?? 0, weatherCode: h.weather_code[i],
    windMph: h.wind_speed_10m[i] ?? 0, windGustMph: h.wind_gusts_10m[i] ?? 0,
    isDay: h.is_day[i] === 1, aqi: null, conditionText: conditionText(h.weather_code[i]),
  }));

  const dailyDays = j.daily.time.map((iso, i) => ({
    dateKey: iso.slice(0, 10),
    sunrise: parseLocal(j.daily.sunrise[i]), sunset: parseLocal(j.daily.sunset[i]),
    high: j.daily.temperature_2m_max[i], low: j.daily.temperature_2m_min[i],
    code: j.daily.weather_code[i],
  }));

  const days = dailyDays.map(d => ({
    ...d, hours: hours.filter(hr => hr.dateKey === d.dateKey),
  })).filter(d => d.hours.length > 0);

  const cur = j.current;
  const curTime = parseLocal(cur.time);
  let nearest = hours[0];
  for (const hr of hours) if (Math.abs(hr.time - curTime) < Math.abs(nearest.time - curTime)) nearest = hr;
  const current = {
    time: curTime,
    temperatureF: cur.temperature_2m, apparentF: cur.apparent_temperature,
    dewF: nearest.dewF, humidity: (cur.relative_humidity_2m ?? nearest.humidity ?? 0) / 100, cloud: (cur.cloud_cover ?? 0) / 100,
    precipProb: nearest.precipProb, precipMM: cur.precipitation ?? 0,
    weatherCode: cur.weather_code, windMph: cur.wind_speed_10m ?? 0, windGustMph: cur.wind_gusts_10m ?? 0,
    isDay: cur.is_day === 1, aqi: null, conditionText: conditionText(cur.weather_code),
  };

  return { updatedAt: curTime, current, days, latitude: lat, longitude: lon };
}

function daysFromArchive(j) {
  const days = [];
  if (!j || !j.hourly || !j.daily) return days;
  const h = j.hourly;
  const hours = h.time.map((iso, i) => ({
    time: parseLocal(iso), dateKey: iso.slice(0, 10),
    temperatureF: h.temperature_2m[i], apparentF: h.apparent_temperature[i], dewF: h.dew_point_2m[i],
    humidity: (h.relative_humidity_2m?.[i] ?? 0) / 100, cloud: (h.cloud_cover[i] ?? 0) / 100,
    precipProb: (h.precipitation[i] ?? 0) > 0.1 ? 1 : 0, precipMM: h.precipitation[i] ?? 0, weatherCode: h.weather_code[i],
    windMph: h.wind_speed_10m[i] ?? 0, windGustMph: h.wind_gusts_10m?.[i] ?? 0, isDay: h.is_day[i] === 1, aqi: null, conditionText: conditionText(h.weather_code[i]),
  }));
  const byDay = {};
  for (const hr of hours) (byDay[hr.dateKey] = byDay[hr.dateKey] || []).push(hr);
  const dl = j.daily;
  dl.time.forEach((iso, i) => {
    const hrs = byDay[iso.slice(0, 10)];
    if (!hrs || hrs.length < 20) return;
    days.push({ dateKey: iso.slice(0, 10), month: +iso.slice(5, 7), dom: +iso.slice(8, 10), sunrise: parseLocal(dl.sunrise[i]), sunset: parseLocal(dl.sunset[i]), high: dl.temperature_2m_max[i], low: dl.temperature_2m_min[i], code: dl.weather_code[i], hours: hrs });
  });
  return days;
}
const HIST_CACHE_VERSION = 1;
const hasIDB = typeof indexedDB !== 'undefined';
function openHistDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('gw-hist', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('days')) r.result.createObjectStore('days'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function histCacheGet(key) {
  if (!hasIDB) return null;
  try { const db = await openHistDB(); return await new Promise((res, rej) => { const q = db.transaction('days', 'readonly').objectStore('days').get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); }
  catch { return null; }
}
async function histCacheSet(key, val) {
  if (!hasIDB) return;
  try { const db = await openHistDB(); await new Promise((res, rej) => { const q = db.transaction('days', 'readwrite').objectStore('days').put(val, key); q.onsuccess = () => res(); q.onerror = () => rej(q.error); }); }
  catch { return; }
}
export async function fetchHistoricalYears(lat, lon, years) {
  const y0 = Math.min(...years), y1 = Math.max(...years);
  const cacheKey = `${HIST_CACHE_VERSION}:${lat},${lon}:${y0}-${y1}`;
  const cached = await histCacheGet(cacheKey);
  if (cached && cached.length) return cached;
  const hourly = 'temperature_2m,apparent_temperature,dew_point_2m,cloud_cover,precipitation,weather_code,wind_speed_10m,is_day';
  const p = new URLSearchParams({ latitude: lat, longitude: lon, hourly, daily: 'sunrise,sunset,temperature_2m_max,temperature_2m_min,weather_code', timezone: 'auto', temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'mm', start_date: `${y0}-01-01`, end_date: `${y1}-12-31` });
  const url = `https://archive-api.open-meteo.com/v1/archive?${p}`;
  let j = null;
  for (let a = 0; a < 4; a++) {
    const r = await fetch(url);
    if (r.ok) { j = await r.json(); break; }
    if ((r.status === 429 || r.status >= 500) && a < 3) { await new Promise(s => setTimeout(s, 900 * (a + 1))); continue; }
    throw new Error(`archive ${r.status}`);
  }
  const days = daysFromArchive(j);
  if (!days.length) throw new Error('archive unavailable');
  histCacheSet(cacheKey, days);
  return days;
}

export async function geocode(query) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1`);
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const j = await res.json();
  const r = j.results && j.results[0];
  if (!r) return null;
  return { lat: r.latitude, lon: r.longitude, name: [r.name, r.admin1, r.country_code].filter(Boolean).join(', ') };
}

export async function geocodeList(query, count = 6) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=${count}`);
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const j = await res.json();
  return (j.results || []).map(r => ({ lat: r.latitude, lon: r.longitude, name: [r.name, r.admin1, r.country_code].filter(Boolean).join(', ') }));
}

export function roundCoord(x) { return Math.round(x * 100) / 100; }
