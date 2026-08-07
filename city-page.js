import { climateComfort, band, sensibleDefault } from './scoring.js?v=44';

const node = document.getElementById('gw-data');
if (node) {
  const data = JSON.parse(node.textContent);

  const cta = document.getElementById('cp-cta');
  if (cta) cta.addEventListener('click', () => {
    try {
      localStorage.setItem('gw.planloc', JSON.stringify({ lat: data.lat, lon: data.lon, name: data.city }));
      localStorage.setItem('gw.planmonth', JSON.stringify(data.monthIndex + 1));
    } catch (e) {}
  });

  let stored = {};
  try { const p = JSON.parse(localStorage.getItem('gw.profile') || 'null'); if (p && typeof p === 'object') stored = p; } catch (e) {}
  const profile = { ...sensibleDefault, ...stored };
  const save = () => { try { localStorage.setItem('gw.profile', JSON.stringify(profile)); } catch (e) {} };

  function applyScores() {
    const num = document.querySelector('.cs-num');
    if (num && data.normals) {
      const s = climateComfort(data.normals, profile), base = climateComfort(data.normals, sensibleDefault);
      if (s != null) {
        const cls = band(s).toLowerCase();
        num.textContent = s.toFixed(1);
        const box = document.querySelector('.cp-score'); if (box) box.className = 'cp-score c-' + cls;
        const be = document.querySelector('.cp-band'); if (be) { be.textContent = band(s); be.className = 'cp-band c-' + cls; }
        const tag = document.querySelector('.cp-tag');
        if (tag) tag.textContent = (Math.abs(s - (base ?? s)) > 0.05) ? ('Tuned to you · ' + (data.monthName || '')) : ('Typical ' + (data.monthName || ''));
      }
    }
    if (Array.isArray(data.allNormals)) {
      const cells = document.querySelectorAll('.cp-months .cp-mo .s');
      data.allNormals.forEach((mn, j) => {
        const cell = cells[j]; if (!cell || !mn) return;
        const sj = climateComfort(mn, profile); if (sj == null) return;
        cell.textContent = sj.toFixed(1); cell.className = 's c-' + band(sj).toLowerCase();
      });
    }
  }

  const host = document.getElementById('cp-prefs');
  if (host) {
    const seg = (opts, get, set) => {
      const wrap = document.createElement('div'); wrap.className = 'seg';
      const render = () => {
        wrap.innerHTML = '';
        opts.forEach(o => {
          const b = document.createElement('button'); b.type = 'button'; b.textContent = o.label;
          if (o.active(get())) b.className = 'on';
          b.onclick = () => { set(o.value); save(); applyScores(); render(); };
          wrap.appendChild(b);
        });
      };
      render(); return wrap;
    };
    host.className = 'cp-prefs';
    const head = document.createElement('div'); head.className = 'cp-prefs-head';
    head.innerHTML = 'Make these scores yours <span>· no account, saved on this device</span>';
    const grid = document.createElement('div'); grid.className = 'cp-prefs-grid';

    const tRow = document.createElement('div'); tRow.className = 'pp-temp';
    const tLab = document.createElement('span'); tLab.textContent = 'Ideal temperature';
    const tVal = document.createElement('b'); tVal.textContent = profile.idealFeelsLikeF + '°';
    const tIn = document.createElement('input'); tIn.type = 'range'; tIn.min = '55'; tIn.max = '95'; tIn.step = '1'; tIn.value = profile.idealFeelsLikeF;
    tIn.oninput = () => { profile.idealFeelsLikeF = +tIn.value; tVal.textContent = tIn.value + '°'; save(); applyScores(); };
    tRow.append(tLab, tIn, tVal);

    const mkRow = (label, control) => { const r = document.createElement('div'); r.className = 'pp-row'; const s = document.createElement('span'); s.textContent = label; r.append(s, control); return r; };
    const sun = seg([{ label: 'Clouds ok', value: 0.2, active: v => v < 0.33 }, { label: 'Likes sun', value: 0.55, active: v => v >= 0.33 && v < 0.66 }, { label: 'Loves sun', value: 0.85, active: v => v >= 0.66 }], () => profile.sunPreference, v => profile.sunPreference = v);
    const hum = seg([{ label: 'Low', value: 0.2, active: v => v < 0.33 }, { label: 'Medium', value: 0.5, active: v => v >= 0.33 && v < 0.66 }, { label: 'High', value: 0.85, active: v => v >= 0.66 }], () => profile.mugginessSensitivity, v => profile.mugginessSensitivity = v);
    const rain = seg([{ label: 'Low', value: 0.2, active: v => v <= 0.33 }, { label: 'Medium', value: 0.5, active: v => v > 0.33 && v <= 0.66 }, { label: 'High', value: 0.85, active: v => v > 0.66 }], () => profile.rainTolerance, v => profile.rainTolerance = v);

    grid.append(tRow, mkRow('Sun', sun), mkRow('Humidity sensitivity', hum), mkRow('Rain tolerance', rain));
    host.append(head, grid);
  }

  applyScores();
}
