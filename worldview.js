import { climateComfort, band } from './scoring.js?v=43';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CITIES = [["New York", 40.7, -74.0], ["Los Angeles", 34.0, -118.2], ["Chicago", 41.9, -87.6], ["Mexico City", 19.4, -99.1], ["Vancouver", 49.3, -123.1], ["Miami", 25.8, -80.2], ["Denver", 39.7, -105.0], ["Havana", 23.1, -82.4], ["Phoenix", 33.4, -112.1], ["Toronto", 43.7, -79.4], ["San Francisco", 37.8, -122.4], ["Sao Paulo", -23.5, -46.6], ["Rio de Janeiro", -22.9, -43.2], ["Buenos Aires", -34.6, -58.4], ["Lima", -12.0, -77.0], ["Bogota", 4.7, -74.1], ["Santiago", -33.4, -70.6], ["London", 51.5, -0.1], ["Paris", 48.9, 2.4], ["Berlin", 52.5, 13.4], ["Madrid", 40.4, -3.7], ["Rome", 41.9, 12.5], ["Moscow", 55.8, 37.6], ["Istanbul", 41.0, 28.9], ["Barcelona", 41.4, 2.2], ["Lisbon", 38.7, -9.1], ["Athens", 38.0, 23.7], ["Stockholm", 59.3, 18.1], ["Reykjavik", 64.1, -21.9], ["Cairo", 30.0, 31.2], ["Lagos", 6.5, 3.4], ["Johannesburg", -26.2, 28.0], ["Nairobi", -1.3, 36.8], ["Casablanca", 33.6, -7.6], ["Cape Town", -33.9, 18.4], ["Marrakesh", 31.6, -8.0], ["Dubai", 25.2, 55.3], ["Riyadh", 24.7, 46.7], ["Tehran", 35.7, 51.4], ["Tel Aviv", 32.1, 34.8], ["Tokyo", 35.7, 139.7], ["Beijing", 39.9, 116.4], ["Shanghai", 31.2, 121.5], ["Delhi", 28.6, 77.2], ["Mumbai", 19.1, 72.9], ["Bangkok", 13.8, 100.5], ["Singapore", 1.35, 103.8], ["Hong Kong", 22.3, 114.2], ["Seoul", 37.6, 127.0], ["Jakarta", -6.2, 106.8], ["Kuala Lumpur", 3.1, 101.7], ["Bengaluru", 13.0, 77.6], ["Kathmandu", 27.7, 85.3], ["Sydney", -33.9, 151.2], ["Melbourne", -37.8, 145.0], ["Perth", -31.95, 115.9], ["Auckland", -36.8, 174.8], ["Honolulu", 21.3, -157.8]];
const TW = 1024, TH = 512;

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
    <div class="gw-months"></div>
    <div class="gw-tip"><div class="t"></div><div class="s"></div></div>
    <div class="gw-loading">Loading climate grid…</div>`;
  host.appendChild(rootEl);
  const q = s => rootEl.querySelector(s);

  const glcv = q('.gw-gl'), ov = q('.gw-ov'), octx = q('.gw-ov').getContext('2d'), scv = q('.gw-stars'), sctx = scv.getContext('2d');
  const tipEl = q('.gw-tip'), tipT = q('.gw-tip .t'), tipS = q('.gw-tip .s');

  let META, T, RH, CL, PR, scoresByMonth = [], cityScore = [];
  let gl, prog, U = {}, month = opts.initialMonth ?? new Date().getMonth(), tex = [], yaw = 0.35, pitch = -0.3, dragging = false, lastX, lastY, focusRot = null, vYaw = 0, vPitch = 0;
  let W, H, cx, cy, R, DPR, R_, curProj = [];
  let landMask, texCanvas = [];
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
        const s = climateComfort({ tempC: T[b] / sc.t, rh: RH[b] / sc.rh, cloudPct: CL[b] / sc.cloud, precipMMday: PR[b] / sc.precip }, profile);
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
    cityScore = CITIES.map(c => MONTHS.map((_, m) => { let s = sampleScore(c[1], c[2], m); if (Number.isNaN(s)) { for (let rad = 1; rad <= 3 && Number.isNaN(s); rad++) for (let dr = -rad; dr <= rad && Number.isNaN(s); dr++) for (let dc = -rad; dc <= rad && Number.isNaN(s); dc++) s = sampleScore(c[1] + dr * META.step, c[2] + dc * META.step, m); } return Number.isNaN(s) ? 5 : s; }));
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
  function drawStars() { sctx.clearRect(0, 0, W, H); for (let i = 0; i < 260; i++) { const x = (Math.sin(i * 127.1) * 0.5 + 0.5) * W, y = (Math.sin(i * 311.7 + 2) * 0.5 + 0.5) * H, r = (Math.sin(i * 74.7) * 0.5 + 0.5) * 1.3 + 0.2; sctx.globalAlpha = 0.3 + 0.6 * (Math.sin(i * 13.3) * 0.5 + 0.5); sctx.fillStyle = '#cfe0ff'; sctx.beginPath(); sctx.arc(x, y, r, 0, 7); sctx.fill(); } sctx.globalAlpha = 1; }

  const VS = `attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}`;
  const FS = `precision highp float;uniform vec2 uC;uniform float uR;uniform mat3 uInv;uniform sampler2D uTex;uniform vec3 uL;
#define PI 3.14159265
void main(){vec2 p=(gl_FragCoord.xy-uC)/uR;float d2=dot(p,p);if(d2>1.0){discard;}float z=sqrt(1.0-d2);vec3 pos=vec3(p.x,p.y,z);vec3 g=uInv*pos;float lon=atan(g.x,g.z);float lat=asin(clamp(g.y,-1.0,1.0));vec2 uv=vec2(lon/(2.0*PI)+0.5,0.5-lat/PI);vec4 tx=texture2D(uTex,uv);vec3 ocean=vec3(0.05,0.09,0.17);vec3 base=mix(ocean,tx.rgb,tx.a);float light=0.45+0.62*clamp(dot(pos,uL),0.0,1.0);vec3 col=base*light;float rim=pow(1.0-z,2.2);col+=vec3(0.11,0.17,0.30)*rim;gl_FragColor=vec4(col,1.0);}`;
  function initGL() {
    gl = glcv.getContext('webgl', { antialias: true, premultipliedAlpha: false });
    const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(sh); return sh; };
    prog = gl.createProgram(); gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uC', 'uR', 'uInv', 'uTex', 'uL']) U[n] = gl.getUniformLocation(prog, n);
    for (let m = 0; m < 12; m++) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, texCanvas[m]); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); tex[m] = t; }
  }
  function rotMat(yaw, pitch) {
    const cy1 = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const Ry = [cy1, 0, sy, 0, 1, 0, -sy, 0, cy1], Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
    const M = [0, 0, 0, 0, 0, 0, 0, 0, 0]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += Rx[i * 3 + k] * Ry[k * 3 + j]; M[i * 3 + j] = s; } return M;
  }
  function transpose(m) { return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]; }
  function project(lon, lat, M) { const la = lat * Math.PI / 180, lo = lon * Math.PI / 180; const g = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)]; const v = [M[0] * g[0] + M[1] * g[1] + M[2] * g[2], M[3] * g[0] + M[4] * g[1] + M[5] * g[2], M[6] * g[0] + M[7] * g[1] + M[8] * g[2]]; return { x: cx + v[0] * R_, y: cy - v[1] * R_, z: v[2] }; }
  function render() {
    if (disposed) return;
    rafId = requestAnimationFrame(render);
    if (focusRot) { let d0 = focusRot[0] - yaw; while (d0 > Math.PI) d0 -= 2 * Math.PI; while (d0 < -Math.PI) d0 += 2 * Math.PI; yaw += d0 * 0.1; pitch += (focusRot[1] - pitch) * 0.1; if (Math.abs(d0) < 0.005) focusRot = null; }
    else if (!dragging && (Math.abs(vYaw) > 0.00025 || Math.abs(vPitch) > 0.00025)) { yaw += vYaw; pitch = Math.max(-1.3, Math.min(1.3, pitch + vPitch)); vYaw *= 0.96; vPitch *= 0.96; }
    R_ = R; const Rm = rotMat(yaw, pitch), inv = transpose(Rm);
    gl.useProgram(prog); gl.uniform2f(U.uC, cx * DPR, glcv.height - cy * DPR); gl.uniform1f(U.uR, R * DPR); gl.uniformMatrix3fv(U.uInv, false, new Float32Array(inv));
    gl.uniform3f(U.uL, 0.35, 0.35, 0.87);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex[month]); gl.uniform1i(U.uTex, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
    octx.clearRect(0, 0, W, H); curProj = [];
    for (let i = 0; i < CITIES.length; i++) { const c = CITIES[i], p = project(c[2], c[1], Rm); if (p.z <= 0.03) continue; const s = cityScore[i][month], col = colOf(s); octx.save(); octx.shadowColor = rgbCss(col); octx.shadowBlur = 8; octx.fillStyle = '#fff'; octx.beginPath(); octx.arc(p.x, p.y, 2.6, 0, 7); octx.fill(); octx.restore(); curProj.push({ i, x: p.x, y: p.y, s, name: c[0] }); }
  }

  let lastMoveT = 0;
  const onDown = e => { dragging = true; lastX = e.clientX; lastY = e.clientY; focusRot = null; vYaw = 0; vPitch = 0; lastMoveT = performance.now(); ov.setPointerCapture(e.pointerId); };
  const onUp = () => { dragging = false; if (performance.now() - lastMoveT > 90) { vYaw = 0; vPitch = 0; } };
  const onMove = e => {
    if (dragging) { const dx = (e.clientX - lastX) * 0.006, dy = (e.clientY - lastY) * 0.006; yaw += dx; pitch = Math.max(-1.3, Math.min(1.3, pitch - dy)); vYaw = dx; vPitch = -dy; lastX = e.clientX; lastY = e.clientY; lastMoveT = performance.now(); return; }
    let best = null, bd = 15; for (const p of curProj) { const d = Math.hypot(p.x - e.clientX, p.y - e.clientY); if (d < bd) { bd = d; best = p; } }
    if (best) { tipEl.classList.add('on'); tipEl.style.left = best.x + 'px'; tipEl.style.top = best.y + 'px'; tipT.textContent = best.name; tipS.textContent = best.s.toFixed(1) + ' · ' + band(best.s); tipS.style.color = rgbCss(colOf(best.s)); ov.style.cursor = 'pointer'; }
    else { tipEl.classList.remove('on'); ov.style.cursor = dragging ? 'grabbing' : 'grab'; }
  };
  const onClick = e => { let best = null, bd = 18; for (const p of curProj) { const d = Math.hypot(p.x - e.clientX, p.y - e.clientY); if (d < bd) { bd = d; best = p; } } if (best) { const c = CITIES[best.i]; onPick({ name: c[0], lat: c[1], lon: c[2] }); } };
  ov.addEventListener('pointerdown', onDown); ov.addEventListener('pointerup', onUp); ov.addEventListener('pointermove', onMove); ov.addEventListener('click', onClick);
  window.addEventListener('resize', resize);

  function buildMonths() {
    const wrap = q('.gw-months'); wrap.innerHTML = '';
    const play = document.createElement('div'); play.className = 'gw-play' + (playing ? ' on' : ''); play.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'; play.onclick = togglePlay; wrap.appendChild(play);
    MONTHS.forEach((m, i) => { const b = document.createElement('button'); b.textContent = m; b.className = i === month ? 'on' : ''; b.onclick = () => { month = i; buildMonths(); buildBest(); }; wrap.appendChild(b); });
  }
  function buildBest() {
    q('.gw-best-title').textContent = 'Best places · ' + MONTHS[month];
    const order = CITIES.map((c, i) => ({ i, s: cityScore[i][month] })).sort((a, b) => b.s - a.s).slice(0, 8);
    const list = q('.gw-bestlist'); list.innerHTML = '';
    order.forEach(o => { const row = document.createElement('div'); row.className = 'gw-row'; const col = rgbCss(colOf(o.s)); row.innerHTML = `<span class="gw-dot" style="background:${col};color:${col}"></span><span class="gw-nm">${CITIES[o.i][0]}</span><span class="gw-sc" style="color:${col}">${o.s.toFixed(1)}</span>`; row.onclick = () => { const c = CITIES[o.i]; onPick({ name: c[0], lat: c[1], lon: c[2] }); }; list.appendChild(row); });
  }
  function togglePlay() { playing = !playing; q('.gw-play').classList.toggle('on', playing); if (playing) playT = setInterval(() => { month = (month + 1) % 12; buildMonths(); buildBest(); }, 950); else clearInterval(playT); }

  const loadImg = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  (async () => {
    resize();
    const [nrm, mask] = await Promise.all([
      fetch('/world-normals.json?v=43').then(r => r.json()),
      loadImg('/world-mask.png?v=43'),
    ]);
    if (disposed) return;
    META = nrm.meta; T = nrm.t; RH = nrm.rh; CL = nrm.cloud; PR = nrm.precip;
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
