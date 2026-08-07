import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

const W = 2048, H = 1024;
const SRC = 'https://raw.githubusercontent.com/martynafford/natural-earth-geojson/master/110m/physical/ne_110m_land.json';
const OUT = '/Users/michaelbenson/golden-window-web/world-mask.png';

function ringBox(ring) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function polyContains(x, y, poly) {
  if (!pointInRing(x, y, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (pointInRing(x, y, poly[k])) return false;
  return true;
}

const geo = await fetch(SRC).then(r => r.json());
const polys = [];
for (const f of geo.features) {
  const g = f.geometry;
  if (g.type === 'Polygon') polys.push({ box: ringBox(g.coordinates[0]), rings: g.coordinates });
  else if (g.type === 'MultiPolygon') for (const p of g.coordinates) polys.push({ box: ringBox(p[0]), rings: p });
}
console.log(`polygons: ${polys.length}, raster ${W}x${H}`);

function isLand(lon, lat) {
  for (const p of polys) {
    const b = p.box;
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
    if (polyContains(lon, lat, p.rings)) return true;
  }
  return false;
}

const raw = Buffer.alloc((W + 1) * H);
for (let y = 0; y < H; y++) {
  const lat = 90 - (y + 0.5) / H * 180;
  const rowBase = y * (W + 1);
  raw[rowBase] = 0;
  for (let x = 0; x < W; x++) {
    const lon = (x + 0.5) / W * 360 - 180;
    raw[rowBase + 1 + x] = isLand(lon, lat) ? 255 : 0;
  }
  if (y % 128 === 0) console.log(`row ${y}/${H}`);
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return (buf) => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
})();
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const idat = deflateSync(raw, { level: 9 });
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
writeFileSync(OUT, png);
console.log(`DONE -> ${OUT} (${(png.length / 1024).toFixed(1)} KB)`);
