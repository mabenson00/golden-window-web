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

  let profile = null;
  try { profile = JSON.parse(localStorage.getItem('gw.profile') || 'null'); } catch (e) {}
  if (profile && typeof profile === 'object' && Object.keys(profile).length) {
    const s = climateComfort(data.normals, profile);
    const base = climateComfort(data.normals, sensibleDefault);
    if (s != null && Math.abs(s - (base ?? s)) > 0.05) {
      const cls = band(s).toLowerCase();
      const num = document.querySelector('.cs-num');
      const box = document.querySelector('.cp-score');
      const bandEl = document.querySelector('.cp-band');
      const tag = document.querySelector('.cp-tag');
      if (num) num.textContent = s.toFixed(1);
      if (box) box.className = 'cp-score c-' + cls;
      if (bandEl) { bandEl.textContent = band(s); bandEl.className = 'cp-band c-' + cls; }
      if (tag) tag.textContent = 'Tuned to your comfort profile';
    }
  }
}
