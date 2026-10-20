// Procedural watercolour textures, matte materials and the modelling kit used by every building model.
// Rendering only: nothing here is read by the game rules.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 as rng, hashString as hashStr } from '../../core/util/random.js';
// ================================================================ palette & painted textures
export const C = { ink:'#5b3e2c', ivory:'#f8f0de', cream:'#efe2c6', stone:'#ddd0b5', stoneD:'#b8a88b', red:'#d2444b', redD:'#a5333b',
  pink:'#eeb3aa', pinkP:'#f6d4cc', sage:'#9db489', sageD:'#6f8b5c', teal:'#5e9d94', tealD:'#3e7770', tealP:'#a9cfc5', butter:'#f2d27c',
  wood:'#a7744d', woodD:'#73503a', terra:'#c86a50', leaf:'#86a86a', leafD:'#5e8550', leafL:'#a9c482', soil:'#8b5e40', brick:'#c47a5c',
  iron:'#3f4d4a', skin:'#f1c9a5', water:'#9fd0c8', lav:'#b9a3cf', orange:'#e79a5a', white:'#fbf7ee', blossom:'#f3bfc8', peach:'#f4d6bd', slate:'#7f948f',
  lemon:'#f2d03f', lemonD:'#d4a91f', lemonP:'#f8e7a1', lime:'#9cc54a', limeD:'#6e9a33', leafG:'#5d8a3c', zinc:'#a7b1b3', concrete:'#cdc6b8', navy:'#4f6684', clay:'#c9744e', ochre:'#e0a948', magenta:'#c4508a', sky:'#a9c8d6', charcoal:'#55504b' };

function rgbOf(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
export function tone(hex, amt = 0, a = 1) { const c = rgbOf(hex).map(v => Math.round(Math.max(0, Math.min(255, amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)))); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

const texCache = new Map();
function mkTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); draw(x, w, h, rng(hashStr(key)));
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 4;
  texCache.set(key, tx); return tx;
}
// watercolour wash: pigment blooms, granulation, pencil hatching and darker pooled edges
function wash(x, w, h, r, hex, k = 1, edge = true) {
  x.fillStyle = hex; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 28; i++) {
    const cx = r() * w, cy = r() * h, rad = (.12 + r() * .45) * Math.max(w, h), amt = r() < .5 ? .22 : -.15;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, tone(hex, amt, .2 * k)); g.addColorStop(1, tone(hex, amt, 0));
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  for (let i = 0; i < w * h / 30; i++) { x.fillStyle = tone(hex, r() < .5 ? -.25 : .3, .07 * k); x.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
  x.strokeStyle = tone(C.ink, 0, .05 * k); x.lineWidth = 1;
  for (let i = 0; i < 14; i++) { const sx = r() * w, sy = r() * h; x.beginPath(); for (let j = 0; j < 5; j++) { x.moveTo(sx + j * 3, sy); x.lineTo(sx + j * 3 + 6, sy + 10); } x.stroke(); }
  if (edge) { x.save(); x.filter = 'blur(3px)'; x.strokeStyle = tone(hex, -.32, .32); x.lineWidth = Math.max(5, w / 26); x.strokeRect(0, 0, w, h); x.restore(); }
}
export const T = {
  paint: hex => mkTex('p' + hex, 64, 64, (x, w, h, r) => wash(x, w, h, r, hex, 1)),
  wall: (hex, bricks) => mkTex('w' + hex + bricks, 256, 256, (x, w, h, r) => {
    wash(x, w, h, r, hex, 1.2);
    const g = x.createLinearGradient(0, h * .7, 0, h); g.addColorStop(0, tone(hex, -.2, 0)); g.addColorStop(1, tone(hex, -.35, .35)); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { const sx = r() * w, sy = r() * h; x.fillStyle = tone(hex, -.12, .25); x.beginPath(); x.ellipse(sx, sy, 8 + r() * 20, 4 + r() * 8, r(), 0, 6.3); x.fill(); }
    if (bricks) for (let p = 0; p < 4; p++) {
      const bx = r() * (w - 60), by = r() * (h - 50);
      for (let i = 0; i < 6; i++) { const ox = bx + (i % 3) * 19 + (Math.floor(i / 3) % 2) * 9 + r() * 4, oy = by + Math.floor(i / 3) * 10;
        if (r() < .25) continue; x.fillStyle = tone(C.brick, r() * .2 - .1, .85); x.fillRect(ox, oy, 17, 8); x.strokeStyle = tone(C.ink, 0, .45); x.lineWidth = 1.2; x.strokeRect(ox, oy, 17, 8); }
    }
  }),
  roof: hex => mkTex('r' + hex, 256, 256, (x, w, h, r) => {
    wash(x, w, h, r, hex, 1, false);
    for (let row = 0; row < 9; row++) { const y = row * 30 + 8, off = row % 2 ? 16 : 0;
      for (let c = -1; c < 9; c++) { const cx = c * 32 + off; x.fillStyle = tone(hex, (r() - .5) * .25, .9); x.beginPath(); x.moveTo(cx, y); x.lineTo(cx, y + 18); x.quadraticCurveTo(cx + 16, y + 34, cx + 32, y + 18); x.lineTo(cx + 32, y); x.fill();
        x.strokeStyle = tone(C.ink, 0, .38); x.lineWidth = 1.6; x.beginPath(); x.moveTo(cx, y + 18); x.quadraticCurveTo(cx + 16, y + 34, cx + 32, y + 18); x.stroke(); }
    }
    x.save(); x.filter = 'blur(3px)'; x.strokeStyle = tone(hex, -.35, .35); x.lineWidth = 10; x.strokeRect(0, 0, w, h); x.restore();
  }),
  stripe: (a, b, n = 8, vert = true) => mkTex('s' + a + b + n + vert, 128, 128, (x, w, h, r) => {
    wash(x, w, h, r, b, 1, false); const sw = w / n;
    for (let i = 0; i < n; i += 2) { x.fillStyle = tone(a, (r() - .5) * .1); x.beginPath(); for (let y = 0; y <= h; y += 8) x.lineTo(i * sw + Math.sin(y * .1 + i) * 1.2, y); for (let y = h; y >= 0; y -= 8) x.lineTo((i + 1) * sw + Math.sin(y * .12 + i) * 1.2, y); x.fill(); }
    if (!vert) { const d = x.getImageData(0, 0, w, h); x.putImageData(d, 0, 0); }
    x.save(); x.filter = 'blur(2px)'; x.strokeStyle = tone(a, -.3, .4); x.lineWidth = 6; x.strokeRect(0, 0, w, h); x.restore();
  }),
  valance: (a, b) => mkTex('v' + a + b, 256, 64, (x, w, h, r) => {
    const n = 16, sw = w / n; x.beginPath(); x.moveTo(0, 0); x.lineTo(w, 0); x.lineTo(w, h * .45);
    for (let i = n - 1; i >= 0; i--) x.arc(i * sw + sw / 2, h * .45, sw / 2, 0, Math.PI, false);
    x.closePath(); x.clip();
    for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? tone(b) : tone(a); x.fillRect(i * sw, 0, sw, h); }
    x.strokeStyle = tone(C.ink, 0, .5); x.lineWidth = 2; for (let i = 0; i < n; i++) { x.beginPath(); x.arc(i * sw + sw / 2, h * .45, sw / 2 - 1, 0, Math.PI); x.stroke(); }
  }),
  slat: hex => mkTex('sl' + hex, 64, 64, (x, w, h, r) => { wash(x, w, h, r, hex, 1); x.strokeStyle = tone(hex, -.35, .6); x.lineWidth = 1.5; for (let y = 6; y < h; y += 7) { x.beginPath(); x.moveTo(4, y); x.lineTo(w - 4, y); x.stroke(); } }),
  door: hex => mkTex('d' + hex, 64, 128, (x, w, h, r) => { wash(x, w, h, r, hex, 1); x.strokeStyle = tone(hex, -.4, .7); x.lineWidth = 2; x.strokeRect(10, 12, w - 20, 44); x.strokeRect(10, 68, w - 20, 48); x.fillStyle = tone(hex, .2, .3); x.fillRect(12, 14, w - 24, 8); }),
  wood: hex => mkTex('wd' + hex, 128, 128, (x, w, h, r) => { wash(x, w, h, r, hex, 1); for (let y = 0; y < h; y += 16) { x.strokeStyle = tone(C.ink, 0, .35); x.lineWidth = 1.2; x.beginPath(); x.moveTo(0, y); x.lineTo(w, y + r() * 2); x.stroke(); x.strokeStyle = tone(hex, -.25, .3); x.beginPath(); x.moveTo(r() * w, y + 6); x.lineTo(r() * w, y + 8); x.stroke(); } }),
  cobble: () => mkTex('cobble', 256, 256, (x, w, h, r) => {
    wash(x, w, h, r, '#cbbd9f', 1, false);
    const n = 7, cs = w / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const cx = (i + .5 + (j % 2) * .5) * cs + (r() - .5) * 6, cy = (j + .5) * cs + (r() - .5) * 6, rx = cs * .42 + r() * 3, ry = cs * .36 + r() * 3;
      for (const ox of [-w, 0, w]) { x.fillStyle = tone('#e6dcc4', (r() - .5) * .2); x.beginPath(); x.ellipse(cx + ox, cy, rx, ry, r() * .5, 0, 6.3); x.fill(); x.strokeStyle = tone(C.ink, 0, .28); x.lineWidth = 1.4; x.stroke(); }
    }
  }),
  // street surfaces (one per road look), painted to tile seamlessly along the road
  dirt: () => mkTex('dirt', 256, 256, (x, w, h, r) => {
    wash(x, w, h, r, '#c9a77a', 1.2, false);
    for (let i = 0; i < 420; i++) { x.fillStyle = tone(r() < .5 ? '#8b6a48' : '#efd9b4', 0, .35 + r() * .3); x.beginPath(); x.ellipse(r() * w, r() * h, 1 + r() * 2.6, .8 + r() * 1.8, r() * 3, 0, 6.3); x.fill(); }
    x.strokeStyle = tone('#7a5a3c', 0, .18); x.lineWidth = 7; for (const cx of [w * .3, w * .7]) { x.beginPath(); for (let y = -8; y <= h + 8; y += 16) x.lineTo(cx + Math.sin(y * .05) * 4, y); x.stroke(); }
  }),
  setts: () => mkTex('setts', 256, 256, (x, w, h, r) => {
    wash(x, w, h, r, '#a8957a', 1, false);
    const n = 9, cs = w / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const cx = (i + .5) * cs + (r() - .5) * 8, cy = (j + .5) * cs + (r() - .5) * 8, rx = cs * (.32 + r() * .14), ry = cs * (.28 + r() * .14);
      for (const ox of [-w, 0, w]) { x.fillStyle = tone(['#d8cdb6', '#cbbfa5', '#e2d6bd', '#bfb39a'][(i * 7 + j * 3) % 4], (r() - .5) * .2); x.beginPath(); x.ellipse(cx + ox, cy, rx, ry, r() * 3, 0, 6.3); x.fill(); x.strokeStyle = tone(C.ink, 0, .32); x.lineWidth = 1.3; x.stroke(); }
    }
    for (let i = 0; i < 70; i++) { x.fillStyle = tone(C.leafD, 0, .35); x.fillRect(r() * w, r() * h, 2, 2); }
  }),
  tarmac: hex => mkTex('tm' + hex, 256, 256, (x, w, h, r) => {
    wash(x, w, h, r, hex, .7, false);
    for (let i = 0; i < 2600; i++) { x.fillStyle = tone(hex, r() < .5 ? -.35 : .35, .22); x.fillRect(r() * w, r() * h, 1.4, 1.4); }
    for (let i = 0; i < 5; i++) { x.strokeStyle = tone(C.ink, 0, .12); x.lineWidth = 1; x.beginPath(); let px = r() * w, py = r() * h; x.moveTo(px, py); for (let j = 0; j < 4; j++) { px += (r() - .5) * 40; py += (r() - .5) * 40; x.lineTo(px, py); } x.stroke(); }
  }),
  pavers: () => mkTex('pavers', 256, 256, (x, w, h, r) => {
    wash(x, w, h, r, '#b9775c', 1, false);
    const bw = 32, bh = 16;
    for (let y = 0; y < h; y += bh) for (let i = -1; i < w / bw + 1; i++) { const ox = i * bw + ((y / bh) % 2) * bw / 2;
      x.fillStyle = tone(['#c98a6c', '#d29a78', '#b9775c', '#dcae8c'][Math.floor(r() * 4)], (r() - .5) * .15); x.fillRect(ox + 1, y + 1, bw - 2, bh - 2); x.strokeStyle = tone(C.ink, 0, .3); x.lineWidth = 1.2; x.strokeRect(ox + 1, y + 1, bw - 2, bh - 2); }
  }),
  flagstone: () => mkTex('flagstone', 256, 256, (x, w, h, r) => {
    wash(x, w, h, r, '#8f9a7c', 1.2, false); // moss in the joints
    for (let row = 0, y = 4; row < 5; row++) { const rh = 44 + r() * 10; let xx = 4;
      while (xx < w - 4) { const cw = 40 + r() * 46, ww = Math.min(cw, w - 4 - xx);
        x.fillStyle = tone(['#d3cfc2', '#c4c1b5', '#dad4c5', '#bcb8ab'][Math.floor(r() * 4)], (r() - .5) * .12); x.beginPath(); x.roundRect(xx, y, ww - 5, rh - 5, 6); x.fill(); x.strokeStyle = tone(C.ink, 0, .3); x.lineWidth = 1.3; x.stroke(); xx += cw; }
      y += rh; }
  }),
  gravel: () => mkTex('gravel', 128, 128, (x, w, h, r) => { wash(x, w, h, r, '#e6dfcf', .6, false); for (let i = 0; i < 1300; i++) { x.fillStyle = tone(r() < .5 ? '#9c9284' : '#fffaf0', 0, .45); x.beginPath(); x.arc(r() * w, r() * h, .6 + r() * 1.3, 0, 6.3); x.fill(); }
    x.strokeStyle = tone('#a09583', 0, .3); x.lineWidth = 1; for (let y = 6; y < h; y += 9) { x.beginPath(); for (let i = 0; i <= w; i += 8) x.lineTo(i, y + Math.sin(i * .1) * 1.2); x.stroke(); } }),
  /** Open water: a soft wash with ripples and no darkened edges (it repeats seamlessly). */
  waterWash: () => mkTex('waterWash', 256, 256, (x, w, h, r) => {
    wash(x, w, h, r, '#cfe7e1', .9, false);
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.4;
    for (let i = 0; i < 26; i++) { const cx = r() * w, cy = r() * h, l = 10 + r() * 22; for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { x.beginPath(); x.moveTo(cx + ox - l, cy + oy); x.quadraticCurveTo(cx + ox, cy + oy - 3, cx + ox + l, cy + oy); x.stroke(); } }
  }),
  grass: () => mkTex('grass', 256, 256, (x, w, h, r) => { wash(x, w, h, r, '#a9bf8f', 1.3, false); for (let i = 0; i < 260; i++) { const sx = r() * w, sy = r() * h; x.strokeStyle = tone(r() < .5 ? C.leafD : C.leafL, 0, .35); x.lineWidth = 1.2; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + r() * 4 - 2, sy - 4 - r() * 4); x.stroke(); } }),
  soil: () => mkTex('soil', 128, 128, (x, w, h, r) => { wash(x, w, h, r, C.soil, 1.2); x.strokeStyle = tone(C.ink, 0, .35); for (let y = 10; y < h; y += 18) { x.beginPath(); x.moveTo(0, y); for (let i = 0; i <= w; i += 16) x.lineTo(i, y + Math.sin(i * .2 + y) * 2); x.stroke(); } }),
  glass: () => mkTex('glass', 64, 64, (x, w, h, r) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d3e4df'); g.addColorStop(1, '#8fb1ac'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,.55)'; x.beginPath(); x.moveTo(8, h); x.lineTo(22, h); x.lineTo(46, 0); x.lineTo(32, 0); x.fill(); x.fillStyle = 'rgba(255,255,255,.3)'; x.beginPath(); x.moveTo(28, h); x.lineTo(32, h); x.lineTo(56, 0); x.lineTo(52, 0); x.fill(); }),
  lemon: hex => mkTex('lemon' + hex, 128, 128, (x, w, h, r) => { wash(x, w, h, r, hex, 1.2, false); for (let i = 0; i < 260; i++) { x.fillStyle = tone(hex, r() < .5 ? -.18 : .25, .45); x.beginPath(); x.arc(r() * w, r() * h, .8 + r() * 1.3, 0, 6.3); x.fill(); } }),
  siding: hex => mkTex('sd' + hex, 128, 128, (x, w, h, r) => { wash(x, w, h, r, hex, 1); for (let y = 0; y < h; y += 9) { x.fillStyle = tone(hex, -.18, .55); x.fillRect(0, y + 7, w, 2); x.fillStyle = tone(hex, .3, .4); x.fillRect(0, y, w, 1.5); } }),
  shoji: () => mkTex('shoji', 64, 64, (x, w, h, r) => { wash(x, w, h, r, '#f5efdc', .6, false); x.strokeStyle = '#7a5a40'; x.lineWidth = 2; for (let i = 0; i <= w; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } for (let j = 0; j <= h; j += 21) { x.beginPath(); x.moveTo(0, j); x.lineTo(w, j); x.stroke(); } x.lineWidth = 4; x.strokeRect(1, 1, w - 2, h - 2); }),
  panel: hex => mkTex('pn' + hex, 128, 128, (x, w, h, r) => { wash(x, w, h, r, hex, .9); x.strokeStyle = tone(hex, -.3, .6); x.lineWidth = 1.5; for (let i = 0; i <= w; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); x.stroke(); }),
  garage: hex => mkTex('gr' + hex, 128, 128, (x, w, h, r) => { wash(x, w, h, r, hex, .8); for (let y = 6; y < h; y += 26) { x.strokeStyle = tone(hex, -.35, .7); x.lineWidth = 2; x.strokeRect(6, y, w - 12, 20); for (let i = 6; i < w - 12; i += 29) x.strokeRect(i + 4, y + 4, 22, 12); } }),
  corrug: hex => mkTex('cg' + hex, 128, 128, (x, w, h, r) => { wash(x, w, h, r, hex, .8); for (let i = 0; i < w; i += 6) { x.fillStyle = tone(hex, -.2, .5); x.fillRect(i, 0, 2, h); x.fillStyle = tone(hex, .3, .4); x.fillRect(i + 3, 0, 1, h); } }),
  stone: hex => mkTex('st' + hex, 128, 128, (x, w, h, r) => { wash(x, w, h, r, hex, 1); x.strokeStyle = tone(C.ink, 0, .3); x.lineWidth = 1.2; for (let y = 0, row = 0; y < h; y += 16, row++) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke(); for (let i = (row % 2) * 14; i < w; i += 28) { x.beginPath(); x.moveTo(i, y); x.lineTo(i, y + 16); x.stroke(); } } }),
  gingham: () => mkTex('gingham', 64, 64, (x, w, h) => { x.fillStyle = '#fbf3e6'; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(126,170,60,.55)'; for (let i = 0; i < w; i += 16) { x.fillRect(i, 0, 8, h); x.fillRect(0, i, w, 8); } }),
  leaf: hex => mkTex('lf' + hex, 128, 128, (x, w, h, r) => { wash(x, w, h, r, hex, 1.6, false); for (let i = 0; i < 90; i++) { x.fillStyle = tone(hex, r() < .5 ? -.3 : .3, .35); x.beginPath(); x.ellipse(r() * w, r() * h, 3 + r() * 5, 2 + r() * 3, r() * 3, 0, 6.3); x.fill(); } }),
  sign: icon => mkTex('sg' + icon, 128, 64, (x, w, h, r) => {
    wash(x, w, h, r, C.ivory, 1, false); x.strokeStyle = C.ink; x.lineWidth = 3; x.strokeRect(4, 4, w - 8, h - 8); x.lineWidth = 1; x.strokeRect(9, 9, w - 18, h - 18);
    x.save(); x.translate(w / 2, h / 2); drawIcon(x, icon); x.restore();
  }),
  blob: () => mkTex('blob', 128, 128, (x, w, h) => { const g = x.createRadialGradient(64, 64, 6, 64, 64, 64); g.addColorStop(0, 'rgba(70,45,25,.55)'); g.addColorStop(.6, 'rgba(70,45,25,.22)'); g.addColorStop(1, 'rgba(70,45,25,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }),
  puff: () => mkTex('puff', 64, 64, (x, w, h) => { const g = x.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }),
  frame: () => mkTex('frame', 128, 128, (x, w, h) => { x.clearRect(0, 0, w, h); x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.roundRect(6, 6, w - 12, h - 12, 18); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 7; x.setLineDash([14, 9]); x.beginPath(); x.roundRect(6, 6, w - 12, h - 12, 18); x.stroke(); }),
};
function drawIcon(x, icon) {
  x.lineWidth = 2; x.strokeStyle = C.ink;
  if (icon === 'cup') { x.fillStyle = C.lemon; x.beginPath(); x.moveTo(-18, -8); x.lineTo(14, -8); x.lineTo(10, 12); x.lineTo(-14, 12); x.closePath(); x.fill(); x.stroke(); x.beginPath(); x.arc(16, 1, 6, -1.4, 1.4); x.stroke();
    x.fillStyle = C.lime; x.beginPath(); x.ellipse(-2, -9, 15, 3, 0, 0, 6.3); x.fill(); x.stroke(); x.strokeStyle = tone(C.ink, 0, .5); for (const s of [-6, 2]) { x.beginPath(); x.moveTo(s, -14); x.bezierCurveTo(s - 4, -18, s + 4, -21, s, -25); x.stroke(); } }
  else if (icon === 'bread') { x.fillStyle = '#d99a55'; x.beginPath(); x.ellipse(0, 2, 30, 13, 0, 0, 6.3); x.fill(); x.stroke(); x.strokeStyle = '#8a5a2c'; for (const s of [-14, -2, 10]) { x.beginPath(); x.moveTo(s - 4, -6); x.lineTo(s + 6, 8); x.stroke(); } }
  else if (icon === 'flower') { x.fillStyle = C.pink; for (let i = 0; i < 5; i++) { const a = i / 5 * 6.28; x.beginPath(); x.arc(Math.cos(a) * 9, Math.sin(a) * 9 - 2, 8, 0, 6.3); x.fill(); x.stroke(); } x.fillStyle = C.butter; x.beginPath(); x.arc(0, -2, 6, 0, 6.3); x.fill(); x.stroke(); }
  else if (icon === 'jar') { x.fillStyle = C.ochre; x.beginPath(); x.roundRect(-13, -8, 26, 26, 5); x.fill(); x.stroke(); x.fillStyle = '#fbf3e6'; x.beginPath(); x.roundRect(-16, -18, 32, 11, 3); x.fill(); x.stroke(); x.fillStyle = 'rgba(210,68,75,.6)'; for (let i = -14; i < 14; i += 8) x.fillRect(i, -17, 4, 9); x.fillStyle = C.ivory; x.fillRect(-8, 0, 16, 9); }
  else if (icon === 'lemon' || icon === 'berry') { x.fillStyle = C.lemon; x.beginPath(); x.arc(0, 0, 20, 0, 6.3); x.fill(); x.stroke(); x.fillStyle = C.lemonP; x.beginPath(); x.arc(0, 0, 16, 0, 6.3); x.fill(); x.strokeStyle = C.lemonD; x.lineWidth = 1.6; for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); x.stroke(); } x.fillStyle = C.lime; x.beginPath(); x.ellipse(16, -18, 9, 4, -.6, 0, 6.3); x.fill(); }
  else if (icon === 'pencil') { x.save(); x.rotate(-.6); x.fillStyle = C.lemon; x.fillRect(-22, -6, 34, 12); x.strokeRect(-22, -6, 34, 12); x.fillStyle = C.peach; x.beginPath(); x.moveTo(12, -6); x.lineTo(24, 0); x.lineTo(12, 6); x.closePath(); x.fill(); x.stroke(); x.fillStyle = C.pink; x.fillRect(-28, -6, 6, 12); x.strokeRect(-28, -6, 6, 12); x.restore(); }
  else if (icon === 'glass') { x.fillStyle = C.lemonP; x.beginPath(); x.moveTo(-12, -16); x.lineTo(12, -16); x.lineTo(9, 18); x.lineTo(-9, 18); x.closePath(); x.fill(); x.stroke(); x.fillStyle = C.lemon; x.fillRect(-10, -6, 20, 22); x.fillStyle = C.lime; x.beginPath(); x.arc(12, -15, 7, 0, 6.3); x.fill(); x.stroke(); x.beginPath(); x.moveTo(3, -16); x.lineTo(8, -26); x.stroke(); }
  else if (icon === 'gear') { x.fillStyle = C.ochre; x.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * 6.28, rr = i % 2 ? 14 : 20; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); x.fill(); x.stroke(); x.fillStyle = C.ivory; x.beginPath(); x.arc(0, 0, 6, 0, 6.3); x.fill(); x.stroke(); }
  else if (icon === 'book') { x.fillStyle = C.navy; x.fillRect(-22, -14, 20, 28); x.fillRect(2, -14, 20, 28); x.strokeRect(-22, -14, 20, 28); x.strokeRect(2, -14, 20, 28); x.strokeStyle = C.ivory; for (const y of [-6, 0, 6]) { x.beginPath(); x.moveTo(-18, y); x.lineTo(-6, y); x.moveTo(6, y); x.lineTo(18, y); x.stroke(); } }
  else if (icon === 'cross') { x.fillStyle = C.limeD; x.fillRect(-7, -20, 14, 40); x.fillRect(-20, -7, 40, 14); x.strokeRect(-7, -20, 14, 40); }
  else if (icon === 'star') { x.fillStyle = C.navy; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i / 10 * 6.28, rr = i % 2 ? 9 : 21; x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } x.closePath(); x.fill(); x.stroke(); }
  else if (icon === 'flame') { x.fillStyle = C.red; x.beginPath(); x.moveTo(0, -22); x.bezierCurveTo(16, -4, 16, 18, 0, 20); x.bezierCurveTo(-16, 18, -16, -4, 0, -22); x.fill(); x.stroke(); x.fillStyle = C.lemon; x.beginPath(); x.arc(0, 8, 7, 0, 6.3); x.fill(); }
  else if (icon === 'drop') { x.fillStyle = '#6fb0c8'; x.beginPath(); x.moveTo(0, -22); x.bezierCurveTo(18, 0, 14, 20, 0, 20); x.bezierCurveTo(-14, 20, -18, 0, 0, -22); x.fill(); x.stroke(); }
  else if (icon === 'bolt') { x.fillStyle = C.lemon; x.beginPath(); x.moveTo(6, -22); x.lineTo(-12, 4); x.lineTo(0, 4); x.lineTo(-6, 22); x.lineTo(12, -4); x.lineTo(0, -4); x.closePath(); x.fill(); x.stroke(); }
  else if (icon === 'recycle') { x.strokeStyle = C.limeD; x.lineWidth = 5; for (let i = 0; i < 3; i++) { const a = i / 3 * 6.28; x.beginPath(); x.arc(0, 0, 15, a + .3, a + 1.8); x.stroke(); } }
  else if (icon === 'saw') { x.fillStyle = C.wood; x.fillRect(-24, -6, 30, 12); x.strokeRect(-24, -6, 30, 12); x.fillStyle = C.zinc; x.beginPath(); x.moveTo(6, -8); x.lineTo(24, -4); x.lineTo(24, 8); x.lineTo(6, 8); x.closePath(); x.fill(); x.stroke(); }
  else if (icon === 'box') { x.fillStyle = C.wood; x.fillRect(-18, -14, 36, 28); x.strokeRect(-18, -14, 36, 28); x.beginPath(); x.moveTo(-18, -14); x.lineTo(18, 14); x.moveTo(18, -14); x.lineTo(-18, 14); x.stroke(); }
  else if (icon === 'teapot') { x.fillStyle = C.teal; x.beginPath(); x.ellipse(0, 4, 18, 13, 0, 0, 6.3); x.fill(); x.stroke(); x.fillStyle = C.ivory; x.beginPath(); x.ellipse(0, -9, 8, 3, 0, 0, 6.3); x.fill(); x.stroke(); x.beginPath(); x.arc(0, -13, 3, 0, 6.3); x.fill(); x.stroke();
    x.beginPath(); x.moveTo(16, 0); x.quadraticCurveTo(26, -2, 26, -12); x.stroke(); x.beginPath(); x.arc(-19, 3, 7, 1.6, 4.7); x.stroke(); x.strokeStyle = C.ivory; x.beginPath(); x.moveTo(-10, 6); x.quadraticCurveTo(0, 12, 10, 6); x.stroke(); }
  else if (icon === 'vase') { x.fillStyle = C.terra; x.beginPath(); x.moveTo(-7, -20); x.lineTo(7, -20); x.quadraticCurveTo(4, -10, 14, 2); x.quadraticCurveTo(16, 18, 0, 20); x.quadraticCurveTo(-16, 18, -14, 2); x.quadraticCurveTo(-4, -10, -7, -20); x.fill(); x.stroke(); x.strokeStyle = C.ivory; x.lineWidth = 2.5; x.beginPath(); x.moveTo(-12, 6); x.quadraticCurveTo(0, 0, 12, 6); x.stroke(); }
  else if (icon === 'fork') { x.fillStyle = C.ivory; x.beginPath(); x.arc(0, 0, 18, 0, 6.3); x.fill(); x.stroke(); x.fillStyle = C.zinc; x.fillRect(-26, -16, 4, 32); x.strokeRect(-26, -16, 4, 32); for (const dx of [-30, -27, -24, -21]) { x.fillRect(dx + 3, -20, 1.5, 8); } x.beginPath(); x.ellipse(25, -6, 4, 9, 0, 0, 6.3); x.fill(); x.stroke(); x.fillRect(23, 2, 4, 14); x.strokeRect(23, 2, 4, 14); }
  else if (icon === 'spool') { x.fillStyle = C.wood; x.fillRect(-14, -18, 28, 6); x.fillRect(-14, 12, 28, 6); x.strokeRect(-14, -18, 28, 6); x.strokeRect(-14, 12, 28, 6); x.fillStyle = C.magenta; x.fillRect(-10, -12, 20, 24); x.strokeRect(-10, -12, 20, 24); x.strokeStyle = tone(C.ivory, 0, .7); for (let y = -9; y < 12; y += 4) { x.beginPath(); x.moveTo(-10, y); x.lineTo(10, y + 2); x.stroke(); } x.strokeStyle = C.magenta; x.beginPath(); x.moveTo(10, 4); x.quadraticCurveTo(24, 8, 22, 20); x.stroke(); }
  else if (icon === 'log') { x.fillStyle = C.wood; x.fillRect(-20, -10, 30, 20); x.strokeRect(-20, -10, 30, 20); x.fillStyle = C.peach; x.beginPath(); x.ellipse(12, 0, 8, 10, 0, 0, 6.3); x.fill(); x.stroke(); x.strokeStyle = C.woodD; for (const rr of [3, 6]) { x.beginPath(); x.ellipse(12, 0, rr * .8, rr, 0, 0, 6.3); x.stroke(); } }
  else if (icon === 'chip') { x.fillStyle = C.lime; x.beginPath(); x.roundRect(-14, -14, 28, 28, 4); x.fill(); x.stroke(); x.fillStyle = C.ivory; x.fillRect(-6, -6, 12, 12); x.strokeRect(-6, -6, 12, 12); for (const k of [-8, 0, 8]) { x.beginPath(); x.moveTo(k, -14); x.lineTo(k, -20); x.moveTo(k, 14); x.lineTo(k, 20); x.moveTo(-14, k); x.lineTo(-20, k); x.moveTo(14, k); x.lineTo(20, k); x.stroke(); } }
  else if (icon === 'basket') { x.fillStyle = C.wood; x.beginPath(); x.moveTo(-20, -2); x.lineTo(20, -2); x.lineTo(14, 18); x.lineTo(-14, 18); x.closePath(); x.fill(); x.stroke(); for (const [a, c] of [[-10, C.lemon], [0, C.lime], [10, C.orange]]) { x.fillStyle = c; x.beginPath(); x.arc(a, -6, 7, 0, 6.3); x.fill(); x.stroke(); } }
}

// ---------------------------------------------------------------- materials
const matCache = new Map();
function lam(key, mk) { if (!matCache.has(key)) matCache.set(key, mk()); return matCache.get(key); }
export const M = {
  paint: hex => lam('p' + hex, () => new THREE.MeshLambertMaterial({ map: T.paint(hex) })),
  wall: (hex, b = false) => lam('w' + hex + b, () => new THREE.MeshLambertMaterial({ map: T.wall(hex, b) })),
  roof: hex => lam('r' + hex, () => new THREE.MeshLambertMaterial({ map: T.roof(hex) })),
  stripe: (a, b) => lam('s' + a + b, () => new THREE.MeshLambertMaterial({ map: T.stripe(a, b) })),
  valance: (a, b) => lam('v' + a + b, () => { const m = new THREE.MeshLambertMaterial({ map: T.valance(a, b), alphaTest: .5, side: THREE.DoubleSide }); m.userData.noEdge = true; return m; }),
  slat: hex => lam('sl' + hex, () => new THREE.MeshLambertMaterial({ map: T.slat(hex) })),
  door: hex => lam('d' + hex, () => new THREE.MeshLambertMaterial({ map: T.door(hex) })),
  wood: hex => lam('wd' + hex, () => new THREE.MeshLambertMaterial({ map: T.wood(hex) })),
  leaf: hex => lam('lf' + hex, () => { const m = new THREE.MeshLambertMaterial({ map: T.leaf(hex) }); m.userData.noEdge = true; return m; }),
  dot: hex => lam('dt' + hex, () => { const m = new THREE.MeshLambertMaterial({ color: hex }); m.userData.noEdge = true; return m; }),
  sign: icon => lam('sg' + icon, () => new THREE.MeshLambertMaterial({ map: T.sign(icon) })),
  cobble: () => lam('cobble', () => new THREE.MeshLambertMaterial({ map: T.cobble() })),
  grass: () => lam('grass', () => new THREE.MeshLambertMaterial({ map: T.grass() })),
  soil: () => lam('soil', () => new THREE.MeshLambertMaterial({ map: T.soil() })),
  lemon: (hex = C.lemon) => lam('lemon' + hex, () => new THREE.MeshLambertMaterial({ map: T.lemon(hex) })),
  berry: () => M.lemon(),
  siding: hex => lam('sd' + hex, () => new THREE.MeshLambertMaterial({ map: T.siding(hex) })),
  shoji: () => lam('shoji', () => new THREE.MeshLambertMaterial({ map: T.shoji() })),
  panel: hex => lam('pn' + hex, () => new THREE.MeshLambertMaterial({ map: T.panel(hex) })),
  garage: hex => lam('gr' + hex, () => new THREE.MeshLambertMaterial({ map: T.garage(hex) })),
  corrug: hex => lam('cg' + hex, () => new THREE.MeshLambertMaterial({ map: T.corrug(hex) })),
  stone: hex => lam('st' + hex, () => new THREE.MeshLambertMaterial({ map: T.stone(hex) })),
  dirt: () => lam('dirt', () => new THREE.MeshLambertMaterial({ map: T.dirt() })),
  setts: () => lam('setts', () => new THREE.MeshLambertMaterial({ map: T.setts() })),
  tarmac: hex => lam('tm' + hex, () => new THREE.MeshLambertMaterial({ map: T.tarmac(hex) })),
  pavers: () => lam('pavers', () => new THREE.MeshLambertMaterial({ map: T.pavers() })),
  flagstone: () => lam('flagstone', () => new THREE.MeshLambertMaterial({ map: T.flagstone() })),
  gravel: () => lam('gravel', () => new THREE.MeshLambertMaterial({ map: T.gravel() })),
  gingham: () => lam('gingham', () => new THREE.MeshLambertMaterial({ map: T.gingham() })),
};
export const windowMat = new THREE.MeshLambertMaterial({ map: T.glass(), emissive: new THREE.Color('#ffb45a'), emissiveIntensity: 0 });
export const lampMat = new THREE.MeshLambertMaterial({ color: '#fff3cf', emissive: new THREE.Color('#ffc86a'), emissiveIntensity: .2 });
export const waterMat = new THREE.MeshLambertMaterial({ map: T.paint(C.water), emissive: new THREE.Color('#5fa9a0'), emissiveIntensity: .15 });
waterMat.userData.noEdge = true;
export const edgeMat = new THREE.LineBasicMaterial({ color: '#6a4631', transparent: true, opacity: .5 });
export const selEdgeMat = new THREE.LineBasicMaterial({ color: '#4f8a1e', transparent: true, opacity: 1 });

// ---------------------------------------------------------------- prism geometry (hips, mansards, pyramids)
export function prismGeo(wb, db, wt, dt, h) {
  const b = [[-wb / 2, 0, db / 2], [wb / 2, 0, db / 2], [wb / 2, 0, -db / 2], [-wb / 2, 0, -db / 2]];
  const tp = [[-wt / 2, h, dt / 2], [wt / 2, h, dt / 2], [wt / 2, h, -dt / 2], [-wt / 2, h, -dt / 2]];
  const pos = [], uv = [];
  const quad = (a, b2, c, d) => { pos.push(...a, ...b2, ...c, ...a, ...c, ...d); uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1); };
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(b[i], b[j], tp[j], tp[i]); }
  if (wt > 0 && dt > 0) quad(tp[0], tp[1], tp[2], tp[3]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}

// ---------------------------------------------------------------- modelling kit
export function Kit(seed = 1) {
  const root = new THREE.Group(), r = rng(seed);
  const k = { root, r };
  k.m = (p, geo, mat, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz, 'YXZ'); (p || root).add(m); return m; };
  k.g = (p, x = 0, y = 0, z = 0, ry = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; (p || root).add(g); return g; };
  k.box = (p, w, h, d, mat, x = 0, y = 0, z = 0, ry = 0) => k.m(p, new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, ry);
  k.cyl = (p, rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 14) => k.m(p, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y + h / 2, z);
  k.sph = (p, rad, mat, x, y, z, sx = 1, sy = 1, sz = 1, seg = 10) => { const m = k.m(p, new THREE.SphereGeometry(rad, seg, Math.max(4, Math.round(seg * .7))), mat, x, y, z); m.scale.set(sx, sy, sz); return m; };
  k.prism = (p, wb, db, wt, dt, h, mat, x = 0, y = 0, z = 0, ry = 0) => k.m(p, prismGeo(wb, db, wt, dt, h), mat, x, y, z, ry);
  k.mark = (p, x, y, z, kind) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.userData.anchor = kind; (p || root).add(o); return o; };
  // a face group: local +z points out of the given side of a w×d box centred at (cx,cz)
  k.face = (p, cx, cz, w, d, side) => { const P = [[cx, cz + d / 2, 0], [cx + w / 2, cz, Math.PI / 2], [cx, cz - d / 2, Math.PI], [cx - w / 2, cz, -Math.PI / 2]][side]; return k.g(p, P[0], 0, P[1], P[2]); };
  k.bloom = (p, x, y, z, spread, n, cols, rad = .02) => {
    k.sph(p, rad * 1.6, M.leaf(C.leaf), x, y - rad * .4, z, spread / (rad * 3.2) + .5, .7, 1, 8);
    for (let i = 0; i < n; i++) { const fx = x + (n > 1 ? (i / (n - 1) - .5) * spread : 0) + (r() - .5) * .012, fy = y + r() * rad, fz = z + (r() - .5) * rad * 1.5; k.sph(p, rad * (.8 + r() * .4), M.dot(cols[i % cols.length]), fx, fy, fz, 1, 1, 1, 6); }
  };
  k.win = (f, x, y, w, h, o = {}) => {
    const TR = M.paint(o.trim || C.ivory), t = .024, dz = .035;
    k.box(f, w, h, .012, windowMat, x, y, .012);
    if (!o.arch) k.box(f, w + 2 * t, t, dz, TR, x, y + h, dz / 2);
    k.box(f, w + 2 * t, t, dz, TR, x, y - t, dz / 2);
    k.box(f, t, h, dz, TR, x - w / 2 - t / 2, y, dz / 2); k.box(f, t, h, dz, TR, x + w / 2 + t / 2, y, dz / 2);
    k.box(f, .012, h, .026, TR, x, y, .013);
    if (h > w * 1.05) k.box(f, w, .012, .026, TR, x, y + h * .55, .013);
    if (o.arch) {
      k.m(f, new THREE.CylinderGeometry(w / 2, w / 2, .012, 16, 1, false, Math.PI / 2, Math.PI), windowMat, x, y + h, .012, 0, Math.PI / 2);
      const tor = k.m(f, new THREE.TorusGeometry(w / 2 + t / 2, t / 2, 5, 16, Math.PI), TR, x, y + h, dz / 2); tor.userData.noEdge = true;
    }
    k.box(f, w + .08, .018, .06, M.paint(C.stone), x, y - t - .018, .03);
    if (o.shut) { const S = M.slat(o.shut); k.box(f, w * .5, h + .02, .014, S, x - w / 2 - t - w * .25 - .004, y - .01, .012); k.box(f, w * .5, h + .02, .014, S, x + w / 2 + t + w * .25 + .004, y - .01, .012); }
    if (o.flowers) { k.box(f, w + .03, .045, .05, M.wood(o.fbox || C.wood), x, y - t - .065, .05); k.bloom(f, x, y - t - .005, .05, w * .85, 6, o.cols || [C.red, C.pink, C.white, C.red]); }
    if (o.awn) k.awning(f, x, y + h + (o.arch ? w / 2 : t) + .015, w + .1, .12, o.awn);
  };
  k.round = (f, x, y, rad, trim = C.ivory) => {
    k.m(f, new THREE.CylinderGeometry(rad, rad, .012, 16), windowMat, x, y, .008, 0, Math.PI / 2);
    const tr = k.m(f, new THREE.TorusGeometry(rad + .01, .014, 5, 18), M.paint(trim), x, y, .014); tr.userData.noEdge = true;
    k.box(f, .01, rad * 2, .02, M.paint(trim), x, y - rad, .01);
  };
  k.door = (f, x, w, h, col, o = {}) => {
    const y = o.y ?? .06, TR = M.paint(o.trim || C.ivory), t = .024;
    k.box(f, w, h, .016, M.door(col), x, y, .008);
    k.box(f, t, h, .034, TR, x - w / 2 - t / 2, y, .017); k.box(f, t, h, .034, TR, x + w / 2 + t / 2, y, .017);
    if (o.arch) { k.m(f, new THREE.CylinderGeometry(w / 2, w / 2, .016, 14, 1, false, Math.PI / 2, Math.PI), o.glass ? windowMat : M.paint(col), x, y + h, .008, 0, Math.PI / 2); const tor = k.m(f, new THREE.TorusGeometry(w / 2 + t / 2, t / 2, 5, 14, Math.PI), TR, x, y + h, .017); tor.userData.noEdge = true; }
    else { k.box(f, w + 2 * t, t, .034, TR, x, y + h, .017); if (o.glass) k.box(f, w, h * .22, .01, windowMat, x, y + h + t, .01); }
    if (o.glass && o.arch) k.box(f, w * .55, h * .3, .012, windowMat, x, y + h * .58, .018);
    k.sph(f, .012, M.dot('#d8b25a'), x + w * .32, y + h * .45, .024, 1, 1, 1, 6);
    k.box(f, w + .1, Math.max(.02, y - .005), .09, M.paint(C.stoneD), x, 0, .045);
  };
  k.awning = (f, x, y, w, dep, cols, a = .5) => {
    const g = k.g(f, x, y, 0), L = dep / Math.cos(a), drop = Math.tan(a) * dep;
    k.m(g, new THREE.BoxGeometry(w, .014, L), M.stripe(cols[0], cols[1]), 0, -drop / 2, dep / 2, 0, a);
    k.m(g, new THREE.BoxGeometry(w, .07, .008), M.valance(cols[0], cols[1]), 0, -drop - .033, dep);
    for (const s of [-1, 1]) k.m(g, new THREE.BoxGeometry(.008, .008, L), M.paint(C.iron), s * (w / 2 - .01), -drop / 2 - .02, dep / 2, 0, a + .25);
  };
  k.balcony = (f, x, y, w, dep, o = {}) => {
    const I = M.paint(o.rail || C.iron), H = .12;
    k.box(f, w, .03, dep, M.paint(C.stone), x, y, dep / 2);
    k.box(f, w, .012, .012, I, x, y + .03 + H, dep - .006);
    for (const s of [-1, 1]) k.box(f, .012, .012, dep, I, x + s * (w / 2 - .006), y + .03 + H, dep / 2);
    for (let px = -w / 2 + .006; px <= w / 2; px += .04) k.box(f, .007, H, .007, I, x + px, y + .03, dep - .006);
    for (const s of [-1, 1]) for (let pz = .03; pz < dep; pz += .04) k.box(f, .007, H, .007, I, x + s * (w / 2 - .006), y + .03, pz);
    if (o.flowers) { k.bloom(f, x - w * .3, y + .06, dep * .45, .07, 4, [C.red, C.pink]); k.cyl(f, .03, .024, .04, M.paint(C.terra), x - w * .3, y + .03, dep * .45, 10); k.bloom(f, x + w * .3, y + .06, dep * .45, .07, 4, [C.white, C.lav]); k.cyl(f, .03, .024, .04, M.paint(C.terra), x + w * .3, y + .03, dep * .45, 10); }
  };
  k.chimney = (x, y, z, h, col = C.brick) => { k.box(null, .1, h, .1, M.wall(col), x, y, z); k.box(null, .13, .035, .13, M.paint(C.stoneD), x, y + h, z); k.mark(null, x, y + h + .06, z, 'smoke'); };
  k.gable = (p, cx, y0, cz, w, d, h, rm, wm, oh = .06, alongZ = false) => {
    const g = k.g(p, cx, y0, cz, alongZ ? Math.PI / 2 : 0); if (alongZ) [w, d] = [d, w];
    const a = Math.atan2(h, d / 2), L = Math.hypot(d / 2, h) + oh, th = .035;
    for (const s of [1, -1]) k.m(g, new THREE.BoxGeometry(w + 2 * oh, th, L), rm, 0, h / 2 - Math.sin(a) * oh / 2 + th / 2 * Math.cos(a), s * (d / 4 + Math.cos(a) * oh / 2), 0, s * a);
    k.m(g, new THREE.CylinderGeometry(.022, .022, w + 2 * oh + .01, 8), M.paint(C.stoneD), 0, h + .025, 0, 0, 0, Math.PI / 2);
    const sh = new THREE.Shape(); sh.moveTo(-d / 2, 0); sh.lineTo(d / 2, 0); sh.lineTo(0, h); sh.closePath();
    const tg = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false }); tg.rotateY(Math.PI / 2); tg.translate(-w / 2, 0, 0);
    k.m(g, tg, wm); return g;
  };
  k.pot = (p, x, y, z, s = 1, col = C.terra, cols = [C.red, C.pink]) => { k.cyl(p, .034 * s, .025 * s, .05 * s, M.paint(col), x, y, z, 10); k.sph(p, .042 * s, M.leaf(C.leaf), x, y + .07 * s, z, 1, .85, 1, 8); for (let i = 0; i < 4; i++) k.sph(p, .014 * s, M.dot(cols[i % cols.length]), x + (r() - .5) * .06 * s, y + .08 * s + r() * .03 * s, z + (r() - .3) * .05 * s, 1, 1, 1, 6); };
  k.basket = (p, x, y, z) => { k.box(p, .006, .08, .006, M.paint(C.iron), x, y, z); k.m(p, new THREE.SphereGeometry(.04, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.wood(C.wood), x, y, z); k.bloom(p, x, y + .01, z, .06, 5, [C.red, C.pink, C.white], .016); };
  k.wallLamp = (f, x, y) => { k.box(f, .01, .01, .06, M.paint(C.iron), x, y + .05, .03); k.box(f, .036, .05, .036, lampMat, x, y, .065); k.prism(f, .05, .05, 0, 0, .03, M.paint(C.iron), x, y + .05, .065); k.mark(f, x, y + .025, .07, 'glow'); };
  k.cat = (p, x, y, z, ry = 0, col = C.orange) => { const g = k.g(p, x, y, z, ry), mt = M.dot(col); k.sph(g, .05, mt, 0, .025, 0, 1.2, .55, 1, 10); k.sph(g, .027, mt, .052, .035, .018, 1, .9, 1, 8);
    for (const s of [-1, 1]) k.m(g, new THREE.ConeGeometry(.01, .022, 4), mt, .055 + s * .012, .062, .018); const tl = k.m(g, new THREE.TorusGeometry(.05, .011, 5, 10, Math.PI * .9), mt, 0, .012, 0, 0, Math.PI / 2); tl.userData.noEdge = true; };
  k.bike = (p, x, y, z, ry = 0, col = C.teal) => { const g = k.g(p, x, y, z, ry), I = M.paint(C.iron), F = M.paint(col);
    for (const s of [-1, 1]) { const w = k.m(g, new THREE.TorusGeometry(.05, .007, 5, 16), I, s * .07, .05, 0); w.userData.noEdge = true; }
    k.m(g, new THREE.BoxGeometry(.13, .01, .01), F, 0, .08, 0, 0, 0, .15); k.m(g, new THREE.BoxGeometry(.01, .07, .01), F, -.02, .08, 0, 0, 0, .3); k.m(g, new THREE.BoxGeometry(.01, .08, .01), F, .065, .09, 0, 0, 0, -.25);
    k.box(g, .04, .01, .02, M.paint(C.woodD), -.035, .115, 0); k.box(g, .01, .01, .07, I, .075, .13, 0); k.box(g, .045, .03, .05, M.wood(C.wood), .1, .1, 0); k.bloom(g, .1, .14, 0, .03, 3, [C.red, C.white], .012); };
  k.table = (p, x, y, z) => { k.cyl(p, .07, .07, .012, M.paint(C.white), x, y + .13, z, 16); k.cyl(p, .008, .008, .13, M.paint(C.iron), x, y, z, 6); k.cyl(p, .03, .03, .008, M.paint(C.iron), x, y, z, 10);
    for (const s of [-1, 1]) { k.box(p, .05, .01, .05, M.paint(C.lime), x + s * .1, y + .07, z); k.box(p, .05, .06, .008, M.paint(C.lime), x + s * .1, y + .075, z - .025); for (const q of [-1, 1]) k.box(p, .006, .07, .006, M.paint(C.iron), x + s * .1 + q * .02, y, z); }
    k.cyl(p, .012, .009, .025, M.paint(C.white), x, y + .142, z, 8); k.sph(p, .013, M.dot(C.lemon), x, y + .17, z, 1, 1, 1, 6); };
  k.lampPost = (p, x, y, z, h = .62) => { const I = M.paint(C.tealD); k.cyl(p, .035, .045, .06, I, x, y, z, 8); k.cyl(p, .012, .016, h, I, x, y + .06, z, 8);
    k.box(p, .06, .085, .06, lampMat, x, y + .06 + h, z); for (const s of [-1, 1]) { k.box(p, .008, .085, .066, I, x + s * .033, y + .06 + h, z); k.box(p, .066, .085, .008, I, x, y + .06 + h, z + s * .033); }
    k.prism(p, .09, .09, .01, .01, .05, I, x, y + .145 + h, z); k.sph(p, .012, M.paint(C.tealD), x, y + .2 + h, z, 1, 1, 1, 6); k.box(p, .1, .008, .008, I, x + .05, y + h - .05, z); k.basket(p, x + .09, y + h - .12, z); k.mark(p, x, y + .1 + h, z, 'glow'); };
  k.bench = (p, x, y, z, ry = 0) => { const g = k.g(p, x, y, z, ry), W = M.wood(C.wood), I = M.paint(C.iron);
    for (let i = 0; i < 3; i++) k.box(g, .36, .012, .028, W, 0, .085, -.035 + i * .032);
    for (let i = 0; i < 2; i++) k.m(g, new THREE.BoxGeometry(.36, .028, .012), W, 0, .13 + i * .04, -.06, 0, -.15);
    for (const s of [-1, 1]) { k.box(g, .012, .085, .1, I, s * .16, 0, 0); k.m(g, new THREE.BoxGeometry(.012, .1, .012), I, s * .16, .13, -.06, 0, -.15); } };
  k.car = (p, x, y, z, ry = 0, col = C.sky, w = .3) => { const g = k.g(p, x, y, z, ry), I = M.paint(C.charcoal);
    k.box(g, w, .07, .15, M.paint(col), 0, .03, 0); k.box(g, w * .58, .06, .13, windowMat, -w * .05, .1, 0); k.box(g, w * .6, .015, .135, M.paint(col), -w * .05, .16, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = k.m(g, new THREE.CylinderGeometry(.03, .03, .02, 10), I, sx * w * .32, .03, sz * .075, 0, Math.PI / 2); wh.rotation.set(Math.PI / 2, 0, 0); }
    k.box(g, .01, .02, .03, lampMat, w / 2, .06, .045); k.box(g, .01, .02, .03, lampMat, w / 2, .06, -.045); };
  k.fence = (p, x0, z0, x1, z1, col = C.white, h = .12) => { const P = M.paint(col), L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(L / .07)), ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) { const t2 = i / n; k.box(p, .016, h, .016, P, x0 + (x1 - x0) * t2, 0, z0 + (z1 - z0) * t2); }
    for (const yy of [h * .4, h * .8]) k.m(p, new THREE.BoxGeometry(.01, .014, L), P, (x0 + x1) / 2, yy, (z0 + z1) / 2, ang); };
  k.citrus = (p, x, y, z, s = 1, fruit = C.lemon) => { k.cyl(p, .015 * s, .025 * s, .2 * s, M.wood(C.woodD), x, y, z, 6); const lf = M.leaf(fruit === C.lime ? C.leafG : C.leaf);
    k.sph(p, .12 * s, lf, x, y + .27 * s, z, 1, .9, 1, 10); k.sph(p, .08 * s, M.leaf(C.leafD), x + .06 * s, y + .22 * s, z + .04 * s, 1, .9, 1, 8);
    for (let i = 0; i < 6; i++) { const a = i * 1.1 + s; k.sph(p, .022 * s, M.lemon(fruit), x + Math.cos(a) * .11 * s, y + (.2 + (i % 3) * .06) * s, z + Math.sin(a) * .11 * s, 1, 1.25, 1, 6); }
    k.sph(p, .012 * s, M.dot(C.white), x - .05 * s, y + .37 * s, z + .03 * s, 1, 1, 1, 5); };
  k.sign = (p, x, y, z, icon, w = .2, h = .1, ry = 0) => k.box(p, w, h, .014, M.sign(icon), x, y, z, ry);
  k.slats = (f, x, y, w, h, n, mat, z = .03) => { for (let i = 0; i < n; i++) k.box(f, w / n * .45, h, .025, mat, x - w / 2 + (i + .5) * w / n, y, z); k.box(f, w, .02, .03, mat, x, y + h, z); k.box(f, w, .02, .03, mat, x, y - .02, z); };
  return k;
}

// ---------------------------------------------------------------- bake: merge per material, add ink outlines
const _s = new THREE.Vector3();
function mergeInto(out, node) {
  const by = new Map(), edges = [];
  node.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry; g.computeBoundingSphere(); o.getWorldScale(_s);
    const gg = g.index ? g.toNonIndexed() : g.clone();
    for (const n of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(n)) gg.deleteAttribute(n);
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    gg.applyMatrix4(o.matrixWorld);
    if (!by.has(o.material)) by.set(o.material, []); by.get(o.material).push(gg);
    if (!o.userData.noEdge && !o.material.userData.noEdge && o.material !== windowMat && g.boundingSphere.radius * Math.max(_s.x, _s.y, _s.z) > .03) {
      const eg = new THREE.EdgesGeometry(g, 40); eg.applyMatrix4(o.matrixWorld); edges.push(eg);
    }
  });
  for (const [mat, list] of by) { const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = true; m.receiveShadow = true; out.add(m); }
  if (edges.length) { const l = new THREE.LineSegments(mergeGeometries(edges), edgeMat); l.userData.edge = true; out.add(l); }
}
export function bake(k) {
  const root = k.root; root.updateMatrixWorld(true);
  const anchors = { smoke: [], glow: [] };
  root.traverse(o => { if (o.userData.anchor) anchors[o.userData.anchor].push(new THREE.Vector3().setFromMatrixPosition(o.matrixWorld)); });
  const subs = []; root.traverse(o => { if (o !== root && o.userData.sub) subs.push(o); });
  subs.forEach(s => s.parent.remove(s));
  root.updateMatrixWorld(true);
  const out = new THREE.Group(); mergeInto(out, root);
  for (const s of subs) { const pivot = new THREE.Group(); pivot.position.copy(s.position); pivot.userData.sub = s.userData.sub; s.position.set(0, 0, 0); s.updateMatrixWorld(true); mergeInto(pivot, s); out.add(pivot); }
  out.userData.anchors = anchors; return out;
}
