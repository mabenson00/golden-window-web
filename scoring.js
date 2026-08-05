export const CONFIG = {
  weightTemperature: 0.30, weightSunSky: 0.25, weightMugginess: 0.20,
  weightPrecipitation: 0.18, weightAirQuality: 0.07, weightWind: 0.15,
  evaluationStepMinutes: 15, twilightRampMinutes: 40, curveHalfScoreLevel: 0.5,
  tempCurveWidthWarmF: 10.0, tempCurveWidthCoolF: 12.0, tempCurveExponent: 2.0,
  tempWidthScaleAtMinSensitivity: 1.6, tempWidthScaleAtMaxSensitivity: 0.5,
  nightPenaltyMax: 0.60, nightPenaltyExponent: 1.5,
  cloudPenaltyExponent: 1.6,
  dewPointComfortableF: 55.0, dewPointOppressiveF: 72.0,
  mugginessScaleAtMinSensitivity: 0.35, mugginessScaleAtMaxSensitivity: 1.15,
  windComfortableMph: 4.0, windStrongAtMinSensitivity: 35.0, windStrongAtMaxSensitivity: 14.0,
  precipProbFloor: 0.10, precipIntensityRefMMh: 2.5, precipProbabilityBaseImpact: 0.5,
  aqiNoPenaltyBelow: 50, aqiFullPenaltyAt: 150,
  stalePenaltyPerHour: 0.03, forecastConfidenceFloor: 0.6,
  windowPeakTolerancePts: 6.0, windowAcceptableFloorPts: 55.0, windowMinHours: 1,
  windowSmoothingHalfWidth: 1, backupWindowMaxGapPts: 8.0,
  outdoorHourStart: 7, outdoorHourEnd: 21,
  dayBestWindowShare: 0.65, dayUsableAvgShare: 0.25, dayConsistencyShare: 0.10,
  daySummarySunnyCloudCeiling: 0.30, daySummaryCloudyCloudFloor: 0.65,
  daySummaryWetHourChance: 0.30, daySummaryWetDaytimeFraction: 0.34,
  scoreDisplayDecimals: 1,
  bands: [
    { min: 9.0, label: 'Golden' }, { min: 8.0, label: 'Great' }, { min: 7.0, label: 'Good' },
    { min: 5.0, label: 'Decent' }, { min: 3.0, label: 'Poor' }, { min: 0.0, label: 'Bad' },
  ],
};

export const sensibleDefault = {
  idealFeelsLikeF: 72, heatSensitivity: 0.5, coldSensitivity: 0.5,
  sunPreference: 0.6, mugginessSensitivity: 0.5, rainTolerance: 0.3, snowTolerance: 0.3,
  windSensitivity: 0.5,
  importanceTemperature: 1, importanceSunSky: 1, importanceMugginess: 1,
  importancePrecipitation: 1, importanceWind: 0,
};

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => clamp(x, 0, 1);
const lerp = (a, b, t) => a + (b - a) * clamp01(t);
const bell = (delta, width, exponent, halfLevel) =>
  width <= 0 ? (delta <= 0 ? 1 : 0) : Math.pow(halfLevel, Math.pow(Math.abs(delta) / width, exponent));

function temperature(apparentF, p, c) {
  let delta, baseWidth, sensitivity;
  if (apparentF >= p.idealFeelsLikeF) { delta = apparentF - p.idealFeelsLikeF; baseWidth = c.tempCurveWidthWarmF; sensitivity = p.heatSensitivity; }
  else { delta = p.idealFeelsLikeF - apparentF; baseWidth = c.tempCurveWidthCoolF; sensitivity = p.coldSensitivity; }
  const widthScale = lerp(c.tempWidthScaleAtMinSensitivity, c.tempWidthScaleAtMaxSensitivity, sensitivity);
  return bell(delta, baseWidth * widthScale, c.tempCurveExponent, c.curveHalfScoreLevel);
}
function cloudMatch(cloud, p, c) {
  const cl = clamp01(cloud);
  return clamp01(1 - p.sunPreference * Math.pow(cl, c.cloudPenaltyExponent));
}
function daylightFraction(t, sunrise, sunset, binaryDaylight, c) {
  if (!(sunrise && sunset && sunset > sunrise)) return clamp01(binaryDaylight);
  const ramp = Math.max(0, c.twilightRampMinutes * 60) * 1000;
  if (t >= sunrise && t <= sunset) return 1.0;
  if (t > sunset) return ramp > 0 ? clamp01(1 - (t - sunset) / ramp) : 0;
  return ramp > 0 ? clamp01(1 - (sunrise - t) / ramp) : 0;
}
function daylightFactor(fraction, p, c) {
  const sun = clamp01(p.sunPreference);
  const nightPenalty = c.nightPenaltyMax * Math.pow(sun, c.nightPenaltyExponent);
  return clamp01(1 - nightPenalty * (1 - clamp01(fraction)));
}
function mugginess(dewF, p, c) {
  const span = c.dewPointOppressiveF - c.dewPointComfortableF;
  const raw = span > 0 ? clamp01((dewF - c.dewPointComfortableF) / span) : 0;
  const scale = lerp(c.mugginessScaleAtMinSensitivity, c.mugginessScaleAtMaxSensitivity, p.mugginessSensitivity);
  return clamp01(1 - clamp01(raw * scale));
}
function precipitation(prob, intensityMM, type, p, c) {
  if (type === 'none' || prob < c.precipProbFloor) return 1;
  const floorSpan = 1 - c.precipProbFloor;
  const effProb = floorSpan > 0 ? clamp01((prob - c.precipProbFloor) / floorSpan) : prob;
  const intensityFactor = intensityMM / (intensityMM + c.precipIntensityRefMMh);
  const base = clamp01(c.precipProbabilityBaseImpact);
  const nuisance = clamp01(base + (1 - base) * intensityFactor);
  const wetness = clamp01(effProb * nuisance);
  let tolerance;
  switch (type) {
    case 'snow': tolerance = p.snowTolerance; break;
    case 'rain': tolerance = p.rainTolerance; break;
    case 'mixed': case 'freezing': tolerance = Math.min(p.rainTolerance, p.snowTolerance); break;
    default: tolerance = 1;
  }
  return clamp01(1 - wetness * (1 - tolerance));
}
function windComfort(speedMph, p, c) {
  const strong = lerp(c.windStrongAtMinSensitivity, c.windStrongAtMaxSensitivity, p.windSensitivity);
  const span = strong - c.windComfortableMph;
  const raw = span > 0 ? clamp01((speedMph - c.windComfortableMph) / span) : (speedMph > c.windComfortableMph ? 1 : 0);
  return clamp01(1 - raw);
}
function airQuality(aqi, c) {
  if (aqi == null) return null;
  const span = c.aqiFullPenaltyAt - c.aqiNoPenaltyBelow;
  const penalty = span > 0 ? clamp01((aqi - c.aqiNoPenaltyBelow) / span) : 0;
  return clamp01(1 - penalty);
}
function stalenessFactor(ageHours, c) {
  return clamp(1 - c.stalePenaltyPerHour * Math.max(0, ageHours), c.forecastConfidenceFloor, 1);
}

export function precipType(code) {
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([56, 57, 66, 67].includes(code)) return 'freezing';
  return 'none';
}

function scoreInstant(inst, p, c, ageHours) {
  const temp = temperature(inst.apparentF, p, c);
  const cloudFull = cloudMatch(inst.cloud, p, c);
  const cloud = lerp(1.0, cloudFull, inst.daylightFraction);
  const daylight = daylightFactor(inst.daylightFraction, p, c);
  const mug = mugginess(inst.dewF, p, c);
  const type = precipType(inst.weatherCode);
  const precip = precipitation(inst.precipProb, inst.precipMM, type, p, c);
  const aq = airQuality(inst.aqi, c);
  const wind = p.importanceWind > 0 ? windComfort(inst.windMph, p, c) : null;

  let weightedSum = 0, totalWeight = 0;
  const add = (s, w) => { weightedSum += s * w; totalWeight += w; };
  add(temp, c.weightTemperature * p.importanceTemperature);
  add(cloud, c.weightSunSky * p.importanceSunSky);
  add(mug, c.weightMugginess * p.importanceMugginess);
  add(precip, c.weightPrecipitation * p.importancePrecipitation);
  if (aq != null) add(aq, c.weightAirQuality);
  if (wind != null) add(wind, c.weightWind * p.importanceWind);

  const blended = totalWeight > 0 ? weightedSum / totalWeight : 0;
  const staleness = stalenessFactor(ageHours, c);
  const weatherComfort = clamp01(blended * staleness) * 100;
  const comfort = clamp01(blended * daylight * staleness) * 100;
  const hod = inst.localHour;
  const isInOutdoorBand = hod >= c.outdoorHourStart && hod < c.outdoorHourEnd;
  return {
    time: inst.time, comfort, weatherComfort, isInOutdoorBand,
    isDaylight: inst.daylightFraction >= 0.5, isSafe: true,
    components: { temperature: temp, sunSky: cloud, mugginess: mug, precipitation: precip, airQuality: aq, wind, daylightFactor: daylight },
    apparentF: inst.apparentF, conditionText: inst.conditionText,
  };
}

function localWallHour(t) { const d = new Date(t); return d.getUTCHours() + d.getUTCMinutes() / 60; }

function resample(hours, sunrise, sunset, c) {
  if (hours.length < 2) return hours;
  const step = Math.max(60, c.evaluationStepMinutes * 60) * 1000;
  const start = hours[0].time, end = hours[hours.length - 1].time;
  const span = end - start; if (span <= 0) return hours;
  const stepCount = Math.floor(span / step + 1e-6);
  const out = []; let hi = 1;
  for (let k = 0; k <= stepCount; k++) {
    const t = start + k * step;
    while (hi < hours.length - 1 && hours[hi].time < t) hi++;
    const lo = hi - 1, a = hours[lo], b = hours[hi];
    const seg = b.time - a.time;
    const f = seg > 0 ? clamp01((t - a.time) / seg) : 0;
    const nearer = f < 0.5 ? a : b;
    const L = (x, y) => x + (y - x) * f;
    const fraction = daylightFraction(t, sunrise, sunset, nearer.isDay ? 1 : 0, c);
    out.push({
      time: t, localHour: localWallHour(t),
      apparentF: L(a.apparentF, b.apparentF), dewF: L(a.dewF, b.dewF), cloud: L(a.cloud, b.cloud),
      precipProb: L(a.precipProb, b.precipProb), precipMM: L(a.precipMM, b.precipMM),
      weatherCode: nearer.weatherCode, windMph: L(a.windMph, b.windMph), windGustMph: L(a.windGustMph, b.windGustMph),
      aqi: nearer.aqi ?? null, daylightFraction: fraction, conditionText: nearer.conditionText,
    });
  }
  return out;
}

function isUsable(h) { return h.isSafe && h.isInOutdoorBand; }
function smoothedSeries(hours, halfWidth) {
  if (halfWidth <= 0) return hours.map(h => (isUsable(h) ? h.comfort : null));
  return hours.map((h, i) => {
    if (!isUsable(hours[i])) return null;
    const vals = [];
    for (let j = i - halfWidth; j <= i + halfWidth; j++) if (j >= 0 && j < hours.length && isUsable(hours[j])) vals.push(hours[j].comfort);
    vals.sort((a, b) => a - b);
    return vals.length ? vals[Math.floor(vals.length / 2)] : null;
  });
}
function findWindow(hours, c) {
  if (!hours.length) return { best: null, backup: null };
  const interval = hours.length >= 2 ? hours[1].time - hours[0].time : 3600e3;
  const smoothed = smoothedSeries(hours, c.windowSmoothingHalfWidth);
  const safe = smoothed.filter(x => x != null);
  if (!safe.length) return { best: null, backup: null };
  const peak = Math.max(...safe);
  const threshold = Math.max(c.windowAcceptableFloorPts, peak - c.windowPeakTolerancePts);
  const runs = []; let i = 0;
  while (i < hours.length) {
    if (smoothed[i] == null || smoothed[i] < threshold) { i++; continue; }
    let j = i, runPeak = smoothed[i];
    while (j + 1 < hours.length && smoothed[j + 1] != null && smoothed[j + 1] >= threshold) { j++; runPeak = Math.max(runPeak, smoothed[j]); }
    runs.push({ lower: i, upper: j, peak: runPeak, count: j - i + 1 }); i = j + 1;
  }
  if (!runs.length) return { best: null, backup: null };
  const winner = runs.reduce((best, r) => (r.count !== best.count ? (r.count > best.count ? r : best) : (r.lower < best.lower ? r : best)));
  const usableCount = hours.filter(isUsable).length;
  const buildWindow = (run) => {
    let { lower, upper } = run;
    const minSamples = Math.max(1, Math.round((c.windowMinHours * 3600e3) / interval));
    while (upper - lower + 1 < minSamples) {
      const canLeft = lower > 0 && isUsable(hours[lower - 1]);
      const canRight = upper < hours.length - 1 && isUsable(hours[upper + 1]);
      if (canRight && (!canLeft || (hours[upper + 1].comfort >= hours[lower - 1].comfort))) upper++;
      else if (canLeft) lower--; else break;
    }
    const slice = hours.slice(lower, upper + 1);
    const comforts = slice.map(h => h.comfort);
    return {
      startTime: hours[lower].time, endTime: hours[upper].time + interval, hourCount: upper - lower + 1,
      peakComfort: Math.max(...comforts), averageComfort: comforts.reduce((a, b) => a + b, 0) / comforts.length,
      isAllDay: (upper - lower + 1) === usableCount,
    };
  };
  const best = buildWindow(winner);
  const backupRun = runs.filter(r => r.lower !== winner.lower && r.peak >= winner.peak - c.backupWindowMaxGapPts)
    .sort((a, b) => (b.peak - a.peak) || (b.count - a.count))[0];
  return { best, backup: backupRun ? buildWindow(backupRun) : null };
}

function dayComposition(hours, best, c) {
  if (!hours.length) return 0;
  const usable = hours.filter(isUsable);
  const pool = usable.length ? usable : hours.filter(h => h.isSafe);
  const windowQuality = best ? best.averageComfort : 0;
  const usableAvg = pool.length ? pool.reduce((a, h) => a + h.weatherComfort, 0) / pool.length : 0;
  const acceptable = pool.filter(h => h.weatherComfort >= c.windowAcceptableFloorPts).length;
  const consistency = pool.length ? (acceptable / pool.length) * 100 : 0;
  const shareSum = c.dayBestWindowShare + c.dayUsableAvgShare + c.dayConsistencyShare;
  if (shareSum <= 0) return 0;
  return clamp((c.dayBestWindowShare * windowQuality + c.dayUsableAvgShare * usableAvg + c.dayConsistencyShare * consistency) / shareSum, 0, 100);
}

export function roundedScore(raw, c = CONFIG) { const f = Math.pow(10, c.scoreDisplayDecimals); return Math.round(raw * f) / f; }
export function scoreText(raw, c = CONFIG) { return roundedScore(raw, c).toFixed(c.scoreDisplayDecimals); }
export function band(displayed, c = CONFIG) { const s = roundedScore(displayed, c); for (const b of c.bands) if (s >= b.min) return b.label; return c.bands[c.bands.length - 1].label; }
export function isGolden(displayed, c = CONFIG) { return band(displayed, c) === 'Golden'; }

export function daySky(hours, c = CONFIG) {
  const daytime = hours.filter(h => h.isDay);
  const pool = daytime.length ? daytime : hours;
  if (!pool.length) return 'cloudy';
  const wet = pool.filter(h => h.precipProb >= c.daySummaryWetHourChance && precipType(h.weatherCode) !== 'none');
  if (wet.length / pool.length >= c.daySummaryWetDaytimeFraction) {
    const snow = wet.filter(h => precipType(h.weatherCode) === 'snow').length;
    const rain = wet.filter(h => precipType(h.weatherCode) === 'rain').length;
    if (snow > 0 && rain > 0) return 'wintryMix';
    return snow > rain ? 'snowy' : 'rainy';
  }
  const cloud = pool.reduce((a, h) => a + h.cloud, 0) / pool.length;
  if (cloud < c.daySummarySunnyCloudCeiling) return 'sunny';
  if (cloud >= c.daySummaryCloudyCloudFloor) return 'cloudy';
  return 'partlyCloudy';
}

const FACTOR_LABELS = { temperature: 'Temperature', sunSky: 'Sun & sky', mugginess: 'Humidity', precipitation: 'Precipitation', wind: 'Wind', airQuality: 'Air quality' };
const CAN_HELP = { temperature: true, sunSky: true, mugginess: true, precipitation: false, wind: false, airQuality: false };
function averageComponents(list) {
  const n = list.length; if (!n) return {};
  const avg = (k) => list.reduce((a, x) => a + (x[k] ?? 0), 0) / n;
  const avgOpt = (k) => { const p = list.map(x => x[k]).filter(v => v != null); return p.length ? p.reduce((a, b) => a + b, 0) / p.length : null; };
  return { temperature: avg('temperature'), sunSky: avg('sunSky'), mugginess: avg('mugginess'), precipitation: avg('precipitation'), airQuality: avgOpt('airQuality'), wind: avgOpt('wind') };
}
function breakdown(comps, p, c) {
  const order = ['temperature', 'sunSky', 'mugginess', 'precipitation', 'wind', 'airQuality'];
  const weight = { temperature: c.weightTemperature * p.importanceTemperature, sunSky: c.weightSunSky * p.importanceSunSky, mugginess: c.weightMugginess * p.importanceMugginess, precipitation: c.weightPrecipitation * p.importancePrecipitation, wind: c.weightWind * p.importanceWind, airQuality: c.weightAirQuality };
  const out = [];
  for (const f of order) {
    const score = comps[f]; if (score == null || weight[f] <= 0) continue;
    const canHelp = CAN_HELP[f];
    if (!canHelp && score >= c.breakdownSpoilerNeutralCeiling) continue;
    const helped = canHelp ? score >= 0.5 : false;
    const magnitude = (canHelp ? Math.abs(score - 0.5) : (1 - score)) * weight[f];
    out.push({ factor: f, label: FACTOR_LABELS[f], score, weight: weight[f], helped, magnitude });
  }
  out.sort((a, b) => (a.helped === b.helped ? b.magnitude - a.magnitude : (a.helped ? 1 : -1)));
  return out;
}

export function evaluate(forecast, profile, nowMs, config = CONFIG) {
  const p = { ...sensibleDefault, ...profile };
  const c = config;
  const ageHours = Math.max(0, (nowMs - forecast.updatedAt) / 3600e3);
  const day = forecast.days[0];
  const fine = resample(day.hours, day.sunrise, day.sunset, c);
  const scored = fine.map(inst => scoreInstant(inst, p, c, ageHours));
  const { best, backup } = findWindow(scored, c);
  const absolute = dayComposition(scored, best, c);
  const displayed = absolute / 10;
  const bandLabel = band(displayed, c);

  let now = null;
  if (forecast.current) {
    const cur = forecast.current;
    const frac = daylightFraction(cur.time, day.sunrise, day.sunset, cur.isDay ? 1 : 0, c);
    const inst = { ...cur, localHour: localWallHour(cur.time), daylightFraction: frac };
    const hs = scoreInstant(inst, p, c, ageHours);
    now = { displayedScore: hs.comfort / 10, band: band(hs.comfort / 10, c), comfort: hs.comfort };
  }

  const brk = breakdown(averageComponents(scored.filter(isUsable).map(h => h.components)), p, c);
  return {
    displayedDayScore: displayed, band: bandLabel, absolute,
    bestWindow: best, backupWindow: backup, now,
    hourly: scored, daySky: daySky(day.hours, c), breakdown: brk,
    high: day.high, low: day.low,
  };
}
