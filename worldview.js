import { climateComfort, band, dewPointF } from './scoring.js?v=44';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CITIES = [["New York", 40.7, -74.0], ["Los Angeles", 34.0, -118.2], ["Chicago", 41.9, -87.6], ["Mexico City", 19.4, -99.1], ["Vancouver", 49.3, -123.1], ["Miami", 25.8, -80.2], ["Denver", 39.7, -105.0], ["Havana", 23.1, -82.4], ["Phoenix", 33.4, -112.1], ["Toronto", 43.7, -79.4], ["San Francisco", 37.8, -122.4], ["Sao Paulo", -23.5, -46.6], ["Rio de Janeiro", -22.9, -43.2], ["Buenos Aires", -34.6, -58.4], ["Lima", -12.0, -77.0], ["Bogota", 4.7, -74.1], ["Santiago", -33.4, -70.6], ["London", 51.5, -0.1], ["Paris", 48.9, 2.4], ["Berlin", 52.5, 13.4], ["Madrid", 40.4, -3.7], ["Rome", 41.9, 12.5], ["Moscow", 55.8, 37.6], ["Istanbul", 41.0, 28.9], ["Barcelona", 41.4, 2.2], ["Lisbon", 38.7, -9.1], ["Athens", 38.0, 23.7], ["Stockholm", 59.3, 18.1], ["Reykjavik", 64.1, -21.9], ["Cairo", 30.0, 31.2], ["Lagos", 6.5, 3.4], ["Johannesburg", -26.2, 28.0], ["Nairobi", -1.3, 36.8], ["Casablanca", 33.6, -7.6], ["Cape Town", -33.9, 18.4], ["Marrakesh", 31.6, -8.0], ["Dubai", 25.2, 55.3], ["Riyadh", 24.7, 46.7], ["Tehran", 35.7, 51.4], ["Tel Aviv", 32.1, 34.8], ["Tokyo", 35.7, 139.7], ["Beijing", 39.9, 116.4], ["Shanghai", 31.2, 121.5], ["Delhi", 28.6, 77.2], ["Mumbai", 19.1, 72.9], ["Bangkok", 13.8, 100.5], ["Singapore", 1.35, 103.8], ["Hong Kong", 22.3, 114.2], ["Seoul", 37.6, 127.0], ["Jakarta", -6.2, 106.8], ["Kuala Lumpur", 3.1, 101.7], ["Bengaluru", 13.0, 77.6], ["Kathmandu", 27.7, 85.3], ["Sydney", -33.9, 151.2], ["Melbourne", -37.8, 145.0], ["Perth", -31.95, 115.9], ["Auckland", -36.8, 174.8], ["Honolulu", 21.3, -157.8], ["Seattle", 47.6, -122.3], ["Boston", 42.4, -71.1], ["Washington", 38.9, -77.0], ["Atlanta", 33.7, -84.4], ["Houston", 29.8, -95.4], ["Dallas", 32.8, -96.8], ["Austin", 30.3, -97.7], ["Montreal", 45.5, -73.6], ["Calgary", 51.0, -114.1], ["San Diego", 32.7, -117.2], ["Las Vegas", 36.2, -115.1], ["New Orleans", 30.0, -90.1], ["Minneapolis", 45.0, -93.3], ["Guadalajara", 20.7, -103.3], ["Quito", -0.2, -78.5], ["Caracas", 10.5, -66.9], ["Montevideo", -34.9, -56.2], ["Brasilia", -15.8, -47.9], ["Medellin", 6.2, -75.6], ["Cusco", -13.5, -72.0], ["Amsterdam", 52.4, 4.9], ["Brussels", 50.85, 4.35], ["Vienna", 48.2, 16.4], ["Prague", 50.1, 14.4], ["Munich", 48.1, 11.6], ["Zurich", 47.4, 8.5], ["Copenhagen", 55.7, 12.6], ["Oslo", 59.9, 10.8], ["Helsinki", 60.2, 24.9], ["Dublin", 53.3, -6.3], ["Edinburgh", 55.95, -3.2], ["Warsaw", 52.2, 21.0], ["Budapest", 47.5, 19.0], ["Bucharest", 44.4, 26.1], ["Kyiv", 50.5, 30.5], ["Porto", 41.15, -8.6], ["Naples", 40.85, 14.3], ["Milan", 45.5, 9.2], ["Nice", 43.7, 7.3], ["Krakow", 50.06, 19.9], ["Accra", 5.6, -0.2], ["Addis Ababa", 9.0, 38.7], ["Dakar", 14.7, -17.5], ["Tunis", 36.8, 10.2], ["Algiers", 36.75, 3.06], ["Amman", 31.95, 35.9], ["Beirut", 33.9, 35.5], ["Doha", 25.3, 51.5], ["Abu Dhabi", 24.5, 54.4], ["Muscat", 23.6, 58.4], ["Kuwait City", 29.4, 47.98], ["Luanda", -8.8, 13.2], ["Osaka", 34.7, 135.5], ["Sapporo", 43.06, 141.35], ["Taipei", 25.0, 121.5], ["Manila", 14.6, 121.0], ["Ho Chi Minh City", 10.8, 106.7], ["Hanoi", 21.0, 105.8], ["Chennai", 13.1, 80.3], ["Kolkata", 22.6, 88.4], ["Colombo", 6.9, 79.9], ["Chengdu", 30.6, 104.1], ["Guangzhou", 23.1, 113.3], ["Almaty", 43.2, 76.9], ["Tashkent", 41.3, 69.3], ["Ulaanbaatar", 47.9, 106.9], ["Chiang Mai", 18.8, 99.0], ["Denpasar", -8.7, 115.2], ["Brisbane", -27.5, 153.0], ["Adelaide", -34.9, 138.6], ["Wellington", -41.3, 174.8], ["Riga", 56.95, 24.1]];
const TW = 1024, TH = 512, TINT_K = 0.6, DRAG_K = 0.006, FRICTION = 0.95, TILT_MAX = 1.3, GLOBE_DAYTIME_C = 5;

const CSS = `
.gw-explore{position:fixed;inset:0;z-index:200;font-family:var(--sans,"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif);color:#EAF0FA;letter-spacing:-.01em;-webkit-font-smoothing:antialiased}
.gw-explore .gw-space{position:fixed;inset:0;background:radial-gradient(120% 90% at 72% 18%,#16223e 0%,rgba(22,34,62,0) 55%),radial-gradient(90% 80% at 20% 90%,#10182b 0%,rgba(16,24,43,0) 60%),#05070d}
.gw-explore .gw-stars,.gw-explore .gw-gl,.gw-explore .gw-ov{position:fixed;inset:0}
.gw-explore .gw-ov{touch-action:none;cursor:grab}
.gw-explore .gw-ov:active{cursor:grabbing}
.gw-explore .gw-top{position:fixed;top:22px;left:28px;z-index:205;max-width:440px;pointer-events:none}
.gw-explore .gw-brand{display:inline-flex;align-items:center;gap:8px;pointer-events:auto;text-decoration:none;color:#EAF0FA;font-weight:800;font-size:15px;letter-spacing:-.01em;margin-bottom:16px}
.gw-explore .gw-brand img{width:22px;height:22px}
.gw-explore .gw-ey{font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#9DB0CC}
.gw-explore .gw-top h1{font-size:29px;font-weight:700;letter-spacing:-.02em;margin-top:8px;line-height:1.05}
.gw-explore .gw-top p{font-size:13.5px;color:#9DB0CC;margin-top:10px;line-height:1.5}
.gw-explore .gw-nav{position:fixed;top:24px;right:28px;z-index:206;display:flex;gap:4px;background:rgba(18,26,42,.72);border:1px solid rgba(150,175,215,.16);border-radius:12px;padding:5px;backdrop-filter:blur(14px)}
.gw-explore .gw-nav a{color:#9DB0CC;text-decoration:none;font-size:13px;font-weight:700;padding:6px 11px;border-radius:8px}
.gw-explore .gw-nav a:hover{color:#fff}
.gw-explore .gw-nav a.on{background:rgba(255,255,255,.1);color:#fff}
.gw-explore .gw-legend{position:fixed;top:74px;right:28px;z-index:205;display:flex;align-items:center;gap:10px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#9DB0CC}
.gw-explore .gw-grad{width:120px;height:8px;border-radius:5px;background:linear-gradient(90deg,var(--bad),var(--poor),var(--decent),var(--good),var(--great),var(--golden))}
.gw-explore .gw-best{position:fixed;top:112px;right:28px;z-index:205;width:268px;background:rgba(18,26,42,.72);border:1px solid rgba(150,175,215,.16);border-radius:18px;padding:16px 16px 10px;backdrop-filter:blur(14px)}
.gw-explore .gw-best h2{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#9DB0CC;margin-bottom:12px}
.gw-explore .gw-row{display:flex;align-items:center;gap:11px;padding:8px 6px;border-radius:10px;cursor:pointer}
.gw-explore .gw-row:hover{background:rgba(150,175,215,.09)}
.gw-explore .gw-dot{width:11px;height:11px;border-radius:50%;flex:none;box-shadow:0 0 10px currentColor}
.gw-explore .gw-nm{flex:1;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gw-explore .gw-sc{font-size:14px;font-weight:800;font-variant-numeric:tabular-nums}
.gw-explore .gw-best.hide{display:none}
.gw-explore .gw-detail{position:fixed;top:112px;right:28px;z-index:206;width:268px;background:rgba(18,26,42,.82);border:1px solid rgba(150,175,215,.16);border-radius:18px;padding:16px;backdrop-filter:blur(14px);display:none}
.gw-explore .gw-detail.on{display:block}
.gw-explore .gw-dx{position:absolute;top:11px;right:12px;background:transparent;border:0;color:#9DB0CC;font-size:14px;cursor:pointer;line-height:1;padding:2px}
.gw-explore .gw-dx:hover{color:#EAF0FA}
.gw-explore .gw-dcity{font-size:18px;font-weight:700;color:#EAF0FA;letter-spacing:-.01em;padding-right:20px}
.gw-explore .gw-dmonth{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#9DB0CC;margin-top:3px}
.gw-explore .gw-dscore{font-size:34px;font-weight:800;font-variant-numeric:tabular-nums;margin:12px 0 4px;letter-spacing:-.02em}
.gw-explore .gw-dscore span{font-size:12.5px;font-weight:700;color:#9DB0CC;margin-left:5px;letter-spacing:0}
.gw-explore .gw-drows{margin:10px 0 14px}
.gw-explore .gw-drow{display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid rgba(150,175,215,.12);font-size:13.5px;color:#9DB0CC}
.gw-explore .gw-drow b{color:#EAF0FA;font-weight:700}
.gw-explore .gw-dplan{width:100%;background:var(--golden);color:#1a1204;border:0;border-radius:11px;padding:11px;font-family:inherit;font-size:14px;font-weight:800;cursor:pointer}
.gw-explore .gw-dplan:hover{filter:brightness(1.06)}
.gw-explore .gw-months{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:206;display:flex;align-items:center;gap:4px;background:rgba(18,26,42,.72);border:1px solid rgba(150,175,215,.16);border-radius:16px;padding:8px 10px;backdrop-filter:blur(14px);max-width:94vw;overflow-x:auto}
.gw-explore .gw-months button{border:0;background:transparent;color:#9DB0CC;font-family:inherit;font-size:13px;font-weight:700;padding:7px 10px;border-radius:9px;cursor:pointer}
.gw-explore .gw-months button:hover{color:#EAF0FA}
.gw-explore .gw-months button.on{background:rgba(255,255,255,.1);color:#fff}
.gw-explore .gw-play{width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;margin-right:4px;color:#fff;cursor:pointer;flex:none}
.gw-explore .gw-play.on{background:var(--golden);color:#1a1204}
.gw-explore .gw-tip{position:fixed;z-index:210;pointer-events:none;transform:translate(-50%,-140%);background:#0c1424;border:1px solid rgba(150,175,215,.16);border-radius:11px;padding:8px 12px;opacity:0;transition:opacity .1s;white-space:nowrap;box-shadow:0 12px 30px rgba(0,0,0,.5)}
.gw-explore .gw-tip.on{opacity:1}
.gw-explore .gw-tip .t{font-size:13.5px;font-weight:700}
.gw-explore .gw-tip .s{font-size:12px;font-weight:700;margin-top:2px}
.gw-explore .gw-loading{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:208;color:#9DB0CC;font-size:14px;font-weight:600}
@media (max-width:720px){
  .gw-explore .gw-top{max-width:64vw}
  .gw-explore .gw-top h1{font-size:22px}
  .gw-explore .gw-top p{display:none}
  .gw-explore .gw-best{display:none}
  .gw-explore .gw-legend{top:70px}
  .gw-explore .gw-detail{top:auto;bottom:86px;right:12px;left:12px;width:auto}
}`;

export function mountWorldView(host, opts = {}) {
  const profile = opts.profile || {};
  const colors = opts.colors || {};
  const onPick = opts.onPick || (() => {});
  const nav = opts.nav || [];
  const colOf = s => colors[band(s).toLowerCase()] || colors.bad || [140, 134, 116];
  const rgbCss = c => `rgb(${c[0]},${c[1]},${c[2]})`;

  if (!document.getElementById('gw-explore-style')) {
    const st = document.createElement('style'); st.id = 'gw-explore-style'; st.textContent = CSS; document.head.appendChild(st);
  }

  const navHtml = nav.map(([t, h]) => `<a href="${h}"${t === 'Explore' ? ' class="on"' : ''}>${t}</a>`).join('');
  const rootEl = document.createElement('div');
  rootEl.className = 'gw-explore';
  rootEl.innerHTML = `
    <div class="gw-space"></div>
    <canvas class="gw-stars"></canvas>
    <canvas class="gw-gl"></canvas>
    <canvas class="gw-ov"></canvas>
    <div class="gw-top">
      <a class="gw-brand" href="#/today"><img src="icon.svg" alt="">Golden Window</a>
      <div class="gw-ey">World View · real climate data</div>
      <h1>Where's it golden — for you</h1>
      <p>Every place tinted by how good it'd feel outside there this month, from real climate normals scored to your comfort. Drag to spin · click a place to plan it.</p>
    </div>
    <nav class="gw-nav">${navHtml}</nav>
    <div class="gw-legend"><span class="gw-grad"></span>worse → better</div>
    <aside class="gw-best"><h2 class="gw-best-title">Best places · this month</h2><div class="gw-bestlist"></div></aside>
    <aside class="gw-detail"></aside>
    <div class="gw-months"></div>
    <div class="gw-tip"><div class="t"></div><div class="s"></div></div>
    <div class="gw-loading">Loading climate grid…</div>`;
  host.appendChild(rootEl);
  const q = s => rootEl.querySelector(s);

  const glcv = q('.gw-gl'), ov = q('.gw-ov'), octx = q('.gw-ov').getContext('2d'), scv = q('.gw-stars'), sctx = scv.getContext('2d');
  const tipEl = q('.gw-tip'), tipT = q('.gw-tip .t'), tipS = q('.gw-tip .s');

  let META, T, RH, CL, PR, scoresByMonth = [], cityScore = [], cityClimate = null;
  let gl, prog, U = {}, month = opts.initialMonth ?? new Date().getMonth(), tex = [], lon = 0.30, tilt = -0.40, dragging = false, lastX, lastY, vLon = 0, vTilt = 0, selCity = -1;
  const units = opts.units === 'C' ? 'C' : 'F';
  const Tv = f => units === 'C' ? Math.round((f - 32) * 5 / 9) : Math.round(f);
  let W, H, cx, cy, R, DPR, curProj = [];
  let landMask, texCanvas = [], earthImg = null, earthTex = null;
  let rafId = 0, playing = false, playT = 0, disposed = false;

  function cellIndex(lat, lon) { const r = Math.round((lat - META.latMin) / META.step), c = Math.round((lon - META.lonMin) / META.step); if (r < 0 || r >= META.rows || c < 0 || c >= META.cols) return -1; return r * META.cols + c; }
  function sampleScore(lat, lon, m) { const i = cellIndex(lat, lon); if (i < 0) return NaN; return scoresByMonth[m][i]; }
  function bilinear(g, lat, lon) {
    const fr = (lat - META.latMin) / META.step, fc = (lon - META.lonMin) / META.step;
    const r0 = Math.floor(fr), c0 = Math.floor(fc), tr = fr - r0, tc = fc - c0;
    const at = (r, c) => { if (r < 0 || r >= META.rows) return NaN; const cc = ((c % META.cols) + META.cols) % META.cols; return g[r * META.cols + cc]; };
    const v00 = at(r0, c0), v01 = at(r0, c0 + 1), v10 = at(r0 + 1, c0), v11 = at(r0 + 1, c0 + 1);
    const vals = [v00, v01, v10, v11].filter(v => !Number.isNaN(v));
    if (!vals.length) return NaN;
    if (vals.length < 4) return vals.reduce((a, b) => a + b, 0) / vals.length;
    return (v00 * (1 - tc) + v01 * tc) * (1 - tr) + (v10 * (1 - tc) + v11 * tc) * tr;
  }
  function buildScores() {
    const N = META.rows * META.cols, sc = META.scale;
    for (let m = 0; m < 12; m++) {
      const g = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const b = i * 12 + m;
        if (T[b] <= -900) { g[i] = NaN; continue; }
        const s = climateComfort({ tempC: T[b] / sc.t + GLOBE_DAYTIME_C, rh: RH[b] / sc.rh, cloudPct: CL[b] / sc.cloud, precipMMday: PR[b] / sc.precip }, profile);
        g[i] = s == null ? NaN : s;
      }
      for (let pass = 0; pass < 6; pass++) {
        const src = g.slice();
        for (let r = 0; r < META.rows; r++) for (let c = 0; c < META.cols; c++) {
          const i = r * META.cols + c; if (!Number.isNaN(src[i])) continue;
          let sum = 0, n = 0;
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr, cc = (c + dc + META.cols) % META.cols; if (rr < 0 || rr >= META.rows) continue; const v = src[rr * META.cols + cc]; if (!Number.isNaN(v)) { sum += v; n++; } }
          if (n) g[i] = sum / n;
        }
      }
      scoresByMonth[m] = g;
    }
    cityScore = CITIES.map(c => {
      const cc = cityClimate && cityClimate[c[0]];
      return MONTHS.map((_, m) => {
        const d = cc && cc[m];
        if (d && d.daytimeFeelsC != null) { const cs = climateComfort({ tempC: d.daytimeFeelsC, rh: d.rh, cloudPct: d.cloud, precipMMday: d.precipMMday }, profile); if (cs != null) return cs; }
        let s = sampleScore(c[1], c[2], m);
        if (Number.isNaN(s)) { for (let rad = 1; rad <= 3 && Number.isNaN(s); rad++) for (let dr = -rad; dr <= rad && Number.isNaN(s); dr++) for (let dc = -rad; dc <= rad && Number.isNaN(s); dc++) s = sampleScore(c[1] + dr * META.step, c[2] + dc * META.step, m); }
        return Number.isNaN(s) ? 5 : s;
      });
    });
  }
  function buildLandMask(img) {
    const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH; const c = cv.getContext('2d');
    c.drawImage(img, 0, 0, TW, TH);
    landMask = c.getImageData(0, 0, TW, TH).data;
  }
  function buildTextures() {
    for (let m = 0; m < 12; m++) {
      const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH; const ctx = cv.getContext('2d');
      const img = ctx.createImageData(TW, TH), data = img.data, g = scoresByMonth[m];
      for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
        const p = (y * TW + x), li = p * 4;
        if (landMask[li] < 128) { data[li + 3] = 0; continue; }
        const lon = (x / TW - 0.5) * 360, lat = 90 - (y / TH) * 180;
        const s = bilinear(g, lat, lon);
        if (Number.isNaN(s)) { data[li + 3] = 0; continue; }
        const col = colOf(s); data[li] = col[0]; data[li + 1] = col[1]; data[li + 2] = col[2]; data[li + 3] = 255;
      }
      ctx.putImageData(img, 0, 0); texCanvas[m] = cv;
    }
  }

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    for (const c of [glcv, ov, scv]) { c.width = W * DPR; c.height = H * DPR; c.style.width = W + 'px'; c.style.height = H + 'px'; }
    octx.setTransform(DPR, 0, 0, DPR, 0, 0); sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx = W / 2; cy = H / 2; R = Math.min(W, H) * 0.40; drawStars(); if (gl) gl.viewport(0, 0, glcv.width, glcv.height);
  }
  function drawStars() { sctx.clearRect(0, 0, W, H); }

  const VS = `attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}`;
  const FS = `precision highp float;uniform vec2 uC;uniform float uR;uniform float uLon;uniform float uTilt;uniform sampler2D uEarth;uniform sampler2D uTint;uniform float uK;uniform vec3 uL;
#define PI 3.14159265
void main(){vec2 p=(gl_FragCoord.xy-uC)/uR;float d2=dot(p,p);if(d2>1.0){discard;}float z=sqrt(1.0-d2);vec3 pos=vec3(p.x,p.y,z);float ct=cos(uTilt),st=sin(uTilt);vec3 sd=vec3(pos.x,ct*pos.y-st*pos.z,st*pos.y+ct*pos.z);float lat=asin(clamp(sd.y,-1.0,1.0));float lon=atan(sd.x,sd.z)+uLon;vec2 uv=vec2(lon/(2.0*PI)+0.5,0.5-lat/PI);vec3 earth=texture2D(uEarth,uv).rgb;vec4 tn=texture2D(uTint,uv);vec3 base=mix(earth,tn.rgb,tn.a*uK);float light=0.5+0.58*clamp(dot(pos,uL),0.0,1.0);vec3 col=base*light;float rim=pow(1.0-z,2.2);col+=vec3(0.12,0.18,0.32)*rim;gl_FragColor=vec4(col,1.0);}`;
  function initGL() {
    gl = glcv.getContext('webgl', { antialias: true, premultipliedAlpha: false });
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(sh); return sh; };
    prog = gl.createProgram(); gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uC', 'uR', 'uLon', 'uTilt', 'uEarth', 'uTint', 'uK', 'uL']) U[n] = gl.getUniformLocation(prog, n);
    const setup = () => { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); };
    for (let m = 0; m < 12; m++) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texCanvas[m]); setup(); tex[m] = t; }
    earthTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, earthTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, earthImg); setup();
  }
  function project(lon0, lat0) {
    const la = lat0 * Math.PI / 180, lo = lon0 * Math.PI / 180 - lon;
    const dx = Math.cos(la) * Math.sin(lo), dy = Math.sin(la), dz = Math.cos(la) * Math.cos(lo);
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const y = ct * dy + st * dz, zc = -st * dy + ct * dz;
    return { x: cx + dx * R, y: cy - y * R, z: zc };
  }
  function render() {
    if (disposed) return;
    rafId = requestAnimationFrame(render);
    if (!dragging && (Math.abs(vLon) > 0.00022 || Math.abs(vTilt) > 0.00022)) { lon += vLon; tilt = Math.max(-TILT_MAX, Math.min(TILT_MAX, tilt + vTilt)); vLon *= FRICTION; vTilt *= FRICTION; }
    gl.useProgram(prog); gl.uniform2f(U.uC, cx * DPR, glcv.height - cy * DPR); gl.uniform1f(U.uR, R * DPR); gl.uniform1f(U.uLon, lon); gl.uniform1f(U.uTilt, tilt);
    gl.uniform3f(U.uL, 0.35, 0.35, 0.87); gl.uniform1f(U.uK, TINT_K);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[month]); gl.uniform1i(U.uTint, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, earthTex); gl.uniform1i(U.uEarth, 1);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
    octx.clearRect(0, 0, W, H); curProj = [];
    for (let i = 0; i < CITIES.length; i++) { const c = CITIES[i], p = project(c[2], c[1]); if (p.z <= 0.03) continue; const s = cityScore[i][month], col = colOf(s); octx.save(); octx.shadowColor = rgbCss(col); octx.shadowBlur = 8; octx.fillStyle = '#fff'; octx.beginPath(); octx.arc(p.x, p.y, 2.6, 0, 7); octx.fill(); octx.restore(); curProj.push({ i, x: p.x, y: p.y, s, name: c[0] }); }
  }

  let lastMoveT = 0, dragDist = 0;
  const onDown = e => { dragging = true; lastX = e.clientX; lastY = e.clientY; vLon = 0; vTilt = 0; dragDist = 0; lastMoveT = performance.now(); ov.setPointerCapture(e.pointerId); };
  const onUp = () => { dragging = false; if (performance.now() - lastMoveT > 90) { vLon = 0; vTilt = 0; } };
  const onMove = e => {
    if (dragging) {
      const rx = e.clientX - lastX, ry = e.clientY - lastY;
      dragDist += Math.hypot(rx, ry);
      const dl = rx * DRAG_K, dt = ry * DRAG_K;
      lon -= dl; tilt = Math.max(-TILT_MAX, Math.min(TILT_MAX, tilt - dt));
      vLon = -dl; vTilt = -dt;
      lastX = e.clientX; lastY = e.clientY; lastMoveT = performance.now(); return;
    }
    let best = null, bd = 15; for (const p of curProj) { const d = Math.hypot(p.x - e.clientX, p.y - e.clientY); if (d < bd) { bd = d; best = p; } }
    if (best) { tipEl.classList.add('on'); tipEl.style.left = best.x + 'px'; tipEl.style.top = best.y + 'px'; tipT.textContent = best.name; tipS.textContent = best.s.toFixed(1) + ' · ' + band(best.s); tipS.style.color = rgbCss(colOf(best.s)); ov.style.cursor = 'pointer'; }
    else { tipEl.classList.remove('on'); ov.style.cursor = 'grab'; }
  };
  const onClick = e => { if (dragDist > 6) return; let best = null, bd = 18; for (const p of curProj) { const d = Math.hypot(p.x - e.clientX, p.y - e.clientY); if (d < bd) { bd = d; best = p; } } if (best) openDetail(best.i); else closeDetail(); };
  ov.addEventListener('pointerdown', onDown); ov.addEventListener('pointerup', onUp); ov.addEventListener('pointermove', onMove); ov.addEventListener('click', onClick);
  window.addEventListener('resize', resize);

  function buildMonths() {
    const wrap = q('.gw-months'); wrap.innerHTML = '';
    const play = document.createElement('div'); play.className = 'gw-play' + (playing ? ' on' : ''); play.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; play.onclick = togglePlay; wrap.appendChild(play);
    MONTHS.forEach((m, i) => { const b = document.createElement('button'); b.textContent = m; b.className = i === month ? 'on' : ''; b.onclick = () => { month = i; monthChanged(); }; wrap.appendChild(b); });
  }
  function buildBest() {
    q('.gw-best-title').textContent = 'Best places · ' + MONTHS[month];
    const order = CITIES.map((c, i) => ({ i, s: cityScore[i][month] })).sort((a, b) => b.s - a.s).slice(0, 8);
    const list = q('.gw-bestlist'); list.innerHTML = '';
    order.forEach(o => { const row = document.createElement('div'); row.className = 'gw-row'; const col = rgbCss(colOf(o.s)); row.innerHTML = `<span class="gw-dot" style="background:${col};color:${col}"></span><span class="gw-nm">${CITIES[o.i][0]}</span><span class="gw-sc" style="color:${col}">${o.s.toFixed(1)}</span>`; row.onclick = () => openDetail(o.i); list.appendChild(row); });
  }
  function togglePlay() { playing = !playing; q('.gw-play').classList.toggle('on', playing); if (playing) playT = setInterval(() => { month = (month + 1) % 12; monthChanged(); }, 950); else clearInterval(playT); }
  function monthChanged() { buildMonths(); buildBest(); if (selCity >= 0) openDetail(selCity); }

  function cityNormals(i, m) {
    const c = CITIES[i], sc = META.scale;
    const cc = cityClimate && cityClimate[c[0]] && cityClimate[c[0]][m];
    if (cc && cc.daytimeFeelsC != null) return { tempC: cc.daytimeFeelsC, rh: cc.rh, cloudPct: cc.cloud, precipMMday: cc.precipMMday };
    const get = (lat, ln) => { const j = cellIndex(lat, ln); if (j < 0) return null; const b = j * 12 + m; if (T[b] <= -900) return null; return { tempC: T[b] / sc.t + GLOBE_DAYTIME_C, rh: RH[b] / sc.rh, cloudPct: CL[b] / sc.cloud, precipMMday: PR[b] / sc.precip }; };
    let n = get(c[1], c[2]);
    for (let rad = 1; rad <= 3 && !n; rad++) for (let dr = -rad; dr <= rad && !n; dr++) for (let dc = -rad; dc <= rad && !n; dc++) n = get(c[1] + dr * META.step, c[2] + dc * META.step);
    return n;
  }
  const skyWord = cl => cl < 20 ? 'Mostly clear' : cl < 50 ? 'Partly cloudy' : cl < 80 ? 'Cloudy' : 'Overcast';
  const humWord = (feelsF, dewF) => feelsF < 70 || dewF < 60 ? 'Comfortable' : dewF < 68 ? 'Slightly humid' : dewF < 74 ? 'Muggy' : 'Oppressive';
  const rainWord = mm => mm < 1 ? 'Rare' : mm < 3 ? 'Occasional' : mm < 6 ? 'Regular' : 'Frequent';
  function openDetail(i) {
    selCity = i;
    const c = CITIES[i], s = cityScore[i][month], colc = rgbCss(colOf(s)), n = cityNormals(i, month);
    let rows = '';
    if (n) {
      const feelsF = n.tempC * 9 / 5 + 32, dewF = dewPointF(n.tempC, n.rh);
      rows = `<div class="gw-drow"><span>Feels like</span><b>${Tv(feelsF)}°</b></div><div class="gw-drow"><span>Sky</span><b>${skyWord(n.cloudPct)}</b></div><div class="gw-drow"><span>Humidity</span><b>${humWord(feelsF, dewF)}</b></div><div class="gw-drow"><span>Rain</span><b>${rainWord(n.precipMMday)}</b></div>`;
    }
    const d = q('.gw-detail');
    d.innerHTML = `<button class="gw-dx" aria-label="Close">✕</button><div class="gw-dcity">${c[0]}</div><div class="gw-dmonth">${MONTHS[month]} · typical, for you</div><div class="gw-dscore" style="color:${colc}">${s.toFixed(1)}<span>/ 10 · ${band(s)}</span></div><div class="gw-drows">${rows}</div><button class="gw-dplan">See the full plan →</button>`;
    d.querySelector('.gw-dx').onclick = closeDetail;
    d.querySelector('.gw-dplan').onclick = () => onPick({ name: c[0], lat: c[1], lon: c[2], month: month + 1 });
    d.classList.add('on'); q('.gw-best').classList.add('hide');
  }
  function closeDetail() { selCity = -1; q('.gw-detail').classList.remove('on'); q('.gw-best').classList.remove('hide'); }

  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  (async () => {
    resize();
    const [nrm, mask, earth, cc] = await Promise.all([
      fetch('/world-normals.json?v=44').then(r => r.json()),
      loadImg('/world-mask.png?v=44'),
      loadImg('/world-earth.jpg?v=44'),
      fetch('/city-climate.json?v=53').then(r => r.json()).catch(() => null),
    ]);
    if (disposed) return;
    META = nrm.meta; T = nrm.t; RH = nrm.rh; CL = nrm.cloud; PR = nrm.precip; earthImg = earth; cityClimate = cc;
    buildScores(); buildLandMask(mask); buildTextures(); initGL();
    buildMonths(); buildBest(); q('.gw-loading').style.display = 'none'; render();
  })().catch(e => { if (!disposed) q('.gw-loading').textContent = 'Could not load the globe.'; console.error(e); });

  return function dispose() {
    disposed = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (playT) clearInterval(playT);
    window.removeEventListener('resize', resize);
    ov.removeEventListener('pointerdown', onDown); ov.removeEventListener('pointerup', onUp); ov.removeEventListener('pointermove', onMove); ov.removeEventListener('click', onClick);
    if (gl) { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); }
    rootEl.remove();
  };
}
