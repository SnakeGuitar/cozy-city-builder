// Renderer, lights, the paper ground and the day/night light cycle. The camera lives in cameraRig.js.
import * as THREE from 'three';

import { getProto } from './models/index.js';
import { mulberry32 as rng } from '../../core/util/random.js';
import { HALF } from './coords.js';

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight('#fff4e2', '#c8b392', 1.45); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffe9c8', 1.7);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 90 });
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .02; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const { ground, trees: decoTrees } = buildGround(scene);
  return {
    renderer, scene, sun, hemi, decoTrees,
    /** The painted meadow and its ring of trees: the ground of the classic map (hidden on generated maps). */
    classicGround: [ground, ...decoTrees],
    resize(w, h) { renderer.setSize(w, h, false); },
    render(camera) { renderer.render(scene, camera); },
  };
}

// ---------------------------------------------------------------- the paper ground, fading at the edges, with a ring of trees
function buildGround(scene) {
  const SZ = 52, P = 2048, ppu = P / SZ;
  const c = document.createElement('canvas'); c.width = c.height = P; const x = c.getContext('2d'), r = rng(7);
  x.fillStyle = '#efe3c6'; x.fillRect(0, 0, P, P);
  for (let i = 0; i < 90; i++) { const cx = r() * P, cy = r() * P, rad = 80 + r() * 260; const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); const col = r() < .5 ? '#d9c9a4' : '#f7eedb'; g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00'); x.fillStyle = g; x.fillRect(0, 0, P, P); }
  const path = new Path2D(); const R0 = (HALF + 2.2) * ppu;
  for (let i = 0; i <= 360; i++) { const a = i / 360 * Math.PI * 2, p = 4; const sq = R0 / Math.pow(Math.pow(Math.abs(Math.cos(a)), p) + Math.pow(Math.abs(Math.sin(a)), p), 1 / p); const rr = sq + Math.sin(a * 7) * 18 + Math.sin(a * 13 + 1) * 10 + Math.sin(a * 3) * 22; const px = P / 2 + Math.cos(a) * rr, py = P / 2 + Math.sin(a) * rr; i ? path.lineTo(px, py) : path.moveTo(px, py); }
  x.save(); x.clip(path); x.fillStyle = '#c4d2a6'; x.fillRect(0, 0, P, P);
  for (let i = 0; i < 260; i++) { const cx = r() * P, cy = r() * P, rad = 40 + r() * 170; const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); const col = ['#aec392', '#d5dcae', '#b4c99a', '#e3dfb2', '#a2b987'][i % 5]; g.addColorStop(0, col + '77'); g.addColorStop(1, col + '00'); x.fillStyle = g; x.fillRect(0, 0, P, P); }
  for (let i = 0; i < 5000; i++) { const px = r() * P, py = r() * P; x.strokeStyle = r() < .5 ? 'rgba(94,133,80,.28)' : 'rgba(210,222,170,.45)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(px, py); x.lineTo(px + r() * 6 - 3, py - 5 - r() * 6); x.stroke(); }
  for (let i = 0; i < 260; i++) { const px = r() * P, py = r() * P; x.fillStyle = ['#ffffff', '#f3bfc8', '#f2d27c', '#d2444b'][i % 4]; x.globalAlpha = .7; x.beginPath(); x.arc(px, py, 2.4, 0, 6.3); x.fill(); } x.globalAlpha = 1;
  x.restore();
  x.save(); x.filter = 'blur(6px)'; x.strokeStyle = 'rgba(95,125,70,.45)'; x.lineWidth = 10; x.stroke(path); x.restore();
  x.strokeStyle = 'rgba(91,62,44,.35)'; x.lineWidth = 2; x.stroke(path);
  x.globalCompositeOperation = 'destination-in';
  const m = x.createRadialGradient(P / 2, P / 2, P * .3, P / 2, P / 2, P * .5); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = m; x.fillRect(0, 0, P, P);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8;
  const g = new THREE.Mesh(new THREE.PlaneGeometry(SZ, SZ), new THREE.MeshLambertMaterial({ map: tx, transparent: true }));
  g.rotation.x = -Math.PI / 2; g.receiveShadow = true; g.renderOrder = -1; scene.add(g);
  const trees = [], r2 = rng(11);
  for (let i = 0; i < 46; i++) {
    const a = r2() * Math.PI * 2, d = HALF + 2.6 + r2() * 3.2, v = r2() < .2 ? 2 : r2() < .35 ? 1 : 0;
    const p = getProto('tree', v).clone(); const sc = .9 + r2() * .7; p.scale.setScalar(sc);
    const sq = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    p.position.set(Math.cos(a) * d / sq * .93, 0, Math.sin(a) * d / sq * .93); p.rotation.y = r2() * 6;
    if (p.position.length() > HALF * 1.75) continue;
    scene.add(p); trees.push(p);
  }
  return { ground: g, trees };
}

// ---------------------------------------------------------------- day cycle: light keyframes over the day fraction
const DAYK = [
  [0, '#ffcfae', 1.0, '#fde7d6', '#c8b392', 1.0, '#f4cfc0', .14, .4],
  [.1, '#fff2dc', 1.7, '#fff4e2', '#d2bf9f', 1.45, '#ffffff', 0, 0],
  [.45, '#ffe6c2', 1.8, '#fff4e2', '#d2bf9f', 1.45, '#fff2dc', .05, 0],
  [.62, '#ffc88c', 1.55, '#ffe8cf', '#c6a888', 1.1, '#ffdcae', .1, .1],
  [.72, '#ff9f86', .95, '#f4cfd0', '#a99088', .95, '#e9a5a0', .18, .6],
  [.8, '#9fb0ff', .4, '#b3b6e6', '#7c7290', .8, '#7b74a8', .32, 1],
  [.94, '#9fb0ff', .4, '#b3b6e6', '#7c7290', .8, '#7b74a8', .32, 1],
  [1, '#ffcfae', 1.0, '#fde7d6', '#c8b392', 1.0, '#f4cfc0', .14, .4]];
const _ca = new THREE.Color(), _cb = new THREE.Color();
/** Sets light colours for time-of-day `tt` (0..1). Returns { night, tint, tintOpacity } for the DOM overlay. */
export function applyDayLight(view, tt, materials, focus) {
  let i = 0; while (DAYK[i + 1][0] < tt) i++;
  const A = DAYK[i], B = DAYK[i + 1], k = (tt - A[0]) / (B[0] - A[0]), L = (a, b) => a + (b - a) * k;
  const { sun, hemi } = view;
  sun.color.copy(_ca.set(A[1]).lerp(_cb.set(B[1]), k)); sun.intensity = L(A[2], B[2]);
  hemi.color.copy(_ca.set(A[3]).lerp(_cb.set(B[3]), k)); hemi.groundColor.copy(_ca.set(A[4]).lerp(_cb.set(B[4]), k)); hemi.intensity = L(A[5], B[5]);
  const tint = '#' + _ca.set(A[6]).lerp(_cb.set(B[6]), k).getHexString(), tintOpacity = L(A[7], B[7]);
  const night = L(A[8], B[8]);
  const az = .9 + tt * 2.2, el = night > .5 ? .9 : .75 + Math.sin(tt * Math.PI) * .25;
  sun.position.set(focus.x + Math.cos(az) * 20, Math.sin(el) * 26, focus.z + Math.sin(az) * 20); sun.target.position.copy(focus);
  materials.window.emissiveIntensity = night * 1.15; materials.lamp.emissiveIntensity = .15 + night * 1.5; materials.glow.opacity = night * .85;
  materials.glow.visible = night > .01; // in daylight the glow sprites cost draw calls for nothing
  return { night, tint, tintOpacity };
}
