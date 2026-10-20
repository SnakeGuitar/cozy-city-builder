// Custom buildings drawn from their blueprints (core/domain/blueprint.js). Each part is drawn by its module's
// function in its own frame (origin at the centre of its base, +z its front, size w × h × d), then placed at the pose
// the core resolved. Rendering only: the blueprint stays plain data and is never changed here.
//
// Two outputs: `blueprintProto` bakes a saved version once (merged per material, cached by id@version, shared by every
// building that uses it) and `blueprintParts` keeps one group per part for the editor (picking, highlighting).
import * as THREE from 'three';
import { C, M, Kit, bake, windowMat, lampMat } from './art.js';
import { resolveParts } from '../../core/domain/blueprint.js';

const shade = (hex, k) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, k); return '#' + c.getHexString(); };

/** Module drawers: (kit, group, part size { w, h, d }, colour, variant). Faces of wall parts are drawn at z = −d/2. */
const DRAW = {
  body(k, g, { w, h, d }, col, v) {
    k.box(g, w, h, d, v === 1 ? M.wall(col, true) : M.wall(col), 0, 0, 0);
    k.box(g, w + .012, .04, d + .012, M.paint(C.stoneD), 0, 0, 0);
    if (v === 2) { const T = M.wood(C.woodD); for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(g, .03, h, .03, T, sx * (w / 2 - .01), 0, sz * (d / 2 - .01)); k.box(g, w + .01, .03, d + .01, T, 0, h * .5, 0); }
  },
  plinth(k, g, { w, h, d }, col) { k.box(g, w, h, d, M.stone(col), 0, 0, 0); },
  column(k, g, { w, h }, col, v) { if (v === 1) k.box(g, w, h, w, M.paint(col), 0, 0, 0); else { k.cyl(g, w / 2, w / 2, h, M.paint(col), 0, 0, 0, 10); k.box(g, w * 1.5, .02, w * 1.5, M.paint(col), 0, h - .02, 0); } },
  roof_gable(k, g, { w, h, d }, col, v) { k.prism(g, w, d, v === 1 ? .001 : w, v === 1 ? d : .001, h, M.roof(col), 0, 0, 0); },
  roof_hip(k, g, { w, h, d }, col) { k.prism(g, w, d, w * .32, .001, h, M.roof(col), 0, 0, 0); },
  roof_flat(k, g, { w, h, d }, col) {
    k.box(g, w, h, d, M.paint(col), 0, 0, 0);
    const P = M.paint(shade(col, -.08)), t = .025;
    for (const s of [-1, 1]) { k.box(g, w, .04, t, P, 0, h, s * (d / 2 - t / 2)); k.box(g, t, .04, d, P, s * (w / 2 - t / 2), h, 0); }
  },
  roof_shed(k, g, { w, h, d }, col) {
    const L = Math.hypot(d, h), a = Math.atan2(h, d);
    k.m(g, new THREE.BoxGeometry(w, .035, L), M.corrug(col), 0, h / 2, 0, 0, -a);
    // triangular gable ends, facing out on both sides (the high edge is at the front, like the slab)
    for (const s of [-1, 1]) { const tri = new THREE.Shape([new THREE.Vector2(s * d / 2, 0), new THREE.Vector2(-s * d / 2, 0), new THREE.Vector2(-s * d / 2, h)]); k.m(g, new THREE.ShapeGeometry(tri), M.paint(shade(col, .25)), s * w / 2, 0, 0, s * Math.PI / 2); }
  },
  window_sash(k, g, { w, h, d }, col, v) { const f = k.g(g, 0, 0, -d / 2); k.win(f, 0, 0, w, h, { trim: col, shut: v === 1 ? shade(col, -.3) : null, flowers: v === 2 }); },
  window_round(k, g, { w, h, d }, col) { const f = k.g(g, 0, 0, -d / 2); k.round(f, 0, h / 2, Math.min(w, h) / 2 - .015, col); },
  door(k, g, { w, h, d }, col, v) { const f = k.g(g, 0, 0, -d / 2); k.door(f, 0, w - .05, h - .04, col, { y: .02, arch: v === 1, glass: v === 2 }); },
  shopfront(k, g, { w, h, d }, col, v) {
    const f = k.g(g, 0, 0, -d / 2), F = M.paint(col), t = .03, dw = Math.min(.16, w * .35);
    k.box(f, w, t, .03, F, 0, 0, .015); k.box(f, w, t, .03, F, 0, h - t, .015);
    for (const s of [-1, 1]) k.box(f, t, h, .03, F, s * (w / 2 - t / 2), 0, .015);
    for (const s of [-1, 1]) k.box(f, (w - dw) / 2 - t * 1.5, h - 2 * t, .012, windowMat, s * (dw / 2 + ((w - dw) / 2 - t * 1.5) / 2 + t / 2), t, .01);
    k.box(f, dw, h - 2 * t, .016, M.door(shade(col, -.15)), 0, t, .008);
    if (v === 1) k.box(f, w, .05, .05, M.paint(C.ivory), 0, h * .75, .03);
  },
  gate(k, g, { w, h, d }, col) { const f = k.g(g, 0, 0, -d / 2); k.box(f, w - .04, h - .02, .012, M.garage(col), 0, 0, .006); k.box(f, w, .03, .03, M.paint(C.stoneD), 0, h - .03, .015); for (const s of [-1, 1]) k.box(f, .02, h, .03, M.paint(C.stoneD), s * (w / 2 - .01), 0, .015); },
  awning(k, g, { w, h, d }, col, v) { const f = k.g(g, 0, 0, -d / 2); k.awning(f, 0, h, w, d, v === 1 ? [col, col] : [col, C.white]); },
  balcony(k, g, { w, d }, col) { const f = k.g(g, 0, 0, -d / 2); k.balcony(f, 0, 0, w, d, { rail: col }); },
  sign(k, g, { w, h, d }, col, v) { k.box(g, w, h, d, M.paint(col), 0, 0, 0); k.box(g, w * .82, h * .5, .004, M.paint(v === 1 ? C.ink : C.ivory), 0, h * .25, d / 2); },
  chimney(k, g, { w, h, d }, col) { k.box(g, w, h, d, M.wall(col, true), 0, 0, 0); k.box(g, w + .02, .025, d + .02, M.paint(C.stoneD), 0, h, 0); k.mark(g, 0, h + .05, 0, 'smoke'); },
  planter(k, g, { w, h, d }, col) { k.box(g, w, h, d, M.wood(C.woodD), 0, 0, 0); k.sph(g, Math.min(w, d) * .38, M.leaf(C.leaf), 0, h, 0, w / Math.min(w, d), .7, d / Math.min(w, d), 8); k.bloom(g, 0, h + .015, 0, w * .7, 4, [col, C.butter, C.white], .016); },
  shrub(k, g, { w, h, d }, _col, v) { k.sph(g, .5, M.leaf(v ? C.leafD : C.leaf), 0, h / 2, 0, w, h, d, 9); },
  tree_small(k, g, { w, h, d }, _col, v) {
    k.cyl(g, .022, .03, h * .45, M.wood(C.woodD), 0, 0, 0, 7);
    const crown = [C.leaf, C.leafD, C.blossom][v] || C.leaf;
    k.sph(g, .5, M.leaf(crown), 0, h * .65, 0, w, h * .6, d, 10);
  },
  fence(k, g, { w, h, d }, col, v) {
    const P = v === 1 ? M.paint(C.iron) : M.paint(col), n = Math.max(2, Math.round(w / (v === 1 ? .06 : .08)));
    for (let i = 0; i <= n; i++) k.box(g, v === 1 ? .012 : .03, h, v === 1 ? .012 : d, P, -w / 2 + i * w / n, 0, 0);
    for (const y of [h * .3, h * .75]) k.box(g, w, .018, d * .6, P, 0, y, 0);
  },
  lamp_post(k, g, { w, h }, col) { const P = M.paint(col); k.cyl(g, w / 3, w / 2, h, P, 0, 0, 0, 8); k.box(g, w * 1.3, w * 1.3, w * 1.3, lampMat, 0, h, 0); k.prism(g, w * 1.7, w * 1.7, 0, 0, w, P, 0, h + w * 1.3, 0); k.mark(g, 0, h + w * .65, 0, 'glow'); },
  bench(k, g, { w, h, d }, col) { const W = M.wood(col); k.box(g, w, .02, d, W, 0, h * .6, 0); k.box(g, w, h * .7, .015, W, 0, h * .6, -d / 2 + .008); for (const s of [-1, 1]) k.box(g, .015, h * .6, d * .8, M.paint(C.iron), s * (w / 2 - .02), 0, 0); },
};

/** Draws every part into a kit; returns Map partId → its group (whose children are that part's meshes). */
function drawInto(k, bp) {
  const groups = new Map();
  for (const r of resolveParts(bp).values()) {
    const g = k.g(null, r.x, r.y, r.z, r.ry); g.userData.partId = r.part.id;
    (DRAW[r.part.module] || DRAW.body)(k, g, r.part.size, r.part.color, r.part.variant || 0);
    groups.set(r.part.id, g);
  }
  return groups;
}

const protoCache = new Map(); // 'bp3@2' → baked model (shared; never disposed while the game runs)
/** The baked model of a saved blueprint version: merged per material, cached by id and version. */
export function blueprintProto(bp) {
  const key = bp.id && bp.version ? `${bp.id}@${bp.version}` : null;
  if (key && protoCache.has(key)) return protoCache.get(key);
  const k = Kit(bp.seed || 1); drawInto(k, bp); const o = bake(k);
  if (key) protoCache.set(key, o);
  return o;
}
/** Editor view: an unmerged group with one child group per part (`userData.partId`), for picking and highlights. */
export function blueprintParts(bp) {
  const k = Kit(bp.seed || 1), parts = drawInto(k, bp);
  k.root.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return { root: k.root, parts };
}
/** Releases an editor view's geometry (materials are shared from art.js and stay). */
export function disposeParts(root) { root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
export const blueprintCacheSize = () => protoCache.size;
