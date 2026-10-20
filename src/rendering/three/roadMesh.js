// Street geometry shared by every road look: a ribbon that follows a polyline (tangents and normals per point),
// raised edges (curbs, sidewalks, gravel strips) on each side, junction pads, centre markings and roadside details.
// Rendering only. Inputs are plain points { x, y, z } in world units; the caller decides where they come from.
import * as THREE from 'three';
import { C, M, Kit, bake, lampMat } from './art.js';
import { getProto } from './models/index.js';

/** How each road look is drawn. `edge.w` and `edge.h` are the width and height of the raised border inside the road width. */
export const ROAD_LOOKS = {
  classic:  { surface: () => M.cobble(), edge: { w: .07, h: .05, mat: () => M.paint(C.stone) }, lift: .035 },
  dirt:     { surface: () => M.dirt(), edge: null, soft: true, lift: .012, deco: 'tufts' },
  cobble:   { surface: () => M.setts(), edge: { w: .05, h: .02, mat: () => M.stone('#cfc4ae') }, lift: .025 },
  narrow:   { surface: () => M.tarmac('#a7a198'), edge: { w: .05, h: .035, mat: () => M.paint(C.stone) }, paint: { side: .09, mat: () => M.paint('#f4efe2') }, lift: .03 },
  japanese: { surface: () => M.flagstone(), edge: { w: .16, h: .012, mat: () => M.gravel() }, lift: .028, deco: 'lanterns' },
  asphalt:  { surface: () => M.tarmac('#7d8189'), edge: { w: .17, h: .045, mat: () => M.paint('#d9d2c2') }, centre: { mat: () => M.paint('#f6eeb8') }, lift: .03 },
  avenue:   { surface: () => M.tarmac('#767a83'), edge: { w: .26, h: .045, mat: () => M.paint('#ddd5c3') }, centre: { mat: () => M.paint('#f6eeb8') }, lift: .03, deco: 'trees' },
  alley:    { surface: () => M.pavers(), edge: { w: .035, h: .02, mat: () => M.paint('#a5634a') }, lift: .025, deco: 'planters' },
};
export const lookOf = look => ROAD_LOOKS[look] || ROAD_LOOKS.classic;

/** Collects geometries per material and merges them into a group at the end. */
export function createRoadBatch() {
  const byMat = new Map(), deco = [], outlined = [];
  const add = (mat, geo, outline = false) => { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(geo); if (outline) outlined.push(geo); };
  return { add, deco, byMat, outlined };
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
/**
 * Unit XZ tangents of a polyline. At inner points the tangent bisects the two neighbouring directions and carries a
 * mitre scale `m` (1 / cos of half the turn), so offset edges stay parallel at the right distance: no gaps, no overlaps
 * at bends (a 90° corner gets a square outer corner).
 */
function tangents(pts) {
  const out = [], dir = (a, b) => { const t = v3(b.x - a.x, 0, b.z - a.z); return t.lengthSq() < 1e-12 ? null : t.normalize(); };
  for (let i = 0; i < pts.length; i++) {
    const tin = i > 0 ? dir(pts[i - 1], pts[i]) : null, tout = i < pts.length - 1 ? dir(pts[i], pts[i + 1]) : null;
    const t = tin && tout ? tin.clone().add(tout) : (tin || tout || v3(1, 0, 0)).clone();
    if (t.lengthSq() < 1e-12) t.copy(tin || v3(1, 0, 0)); t.normalize();
    t.m = tin && tout ? Math.min(2.5, 1 / Math.max(.4, t.dot(tin))) : 1;
    out.push(t);
  }
  return out;
}
/**
 * A flat strip along `pts` between lateral offsets `o0` and `o1` (left is +), `h` above the points.
 * With `walls`, vertical faces close both long sides down to the points' height (curbs, sidewalks).
 */
function strip(pts, tans, o0, o1, h, { walls = false, uScale = 1, vOffset = 0 } = {}) {
  const pos = [], uv = [], idx = []; let s = vOffset;
  const push = (p, y, u, v) => { pos.push(p.x, y, p.z); uv.push(u, v); return pos.length / 3 - 1; };
  const rows = [];
  for (let i = 0; i < pts.length; i++) {
    if (i) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    const t = tans[i], n = v3(-t.z, 0, t.x).multiplyScalar(t.m || 1), p = pts[i];
    const L = v3(p.x + n.x * o1, 0, p.z + n.z * o1), R = v3(p.x + n.x * o0, 0, p.z + n.z * o0), y = p.y + h;
    const row = { l: push(L, y, 0, s), r: push(R, y, (o1 - o0) * uScale, s) };
    if (walls) { row.lb = push(L, p.y, 0, s); row.lt = push(L, y, h, s); row.rb = push(R, p.y, 0, s); row.rt = push(R, y, h, s); }
    rows.push(row);
  }
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    idx.push(a.r, a.l, b.r, a.l, b.l, b.r); // counter-clockwise seen from above
    if (walls) { idx.push(a.lb, b.lb, a.lt, b.lb, b.lt, a.lt); idx.push(a.rb, a.rt, b.rb, a.rt, b.rt, b.rb); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/**
 * Adds one road ribbon following `pts` ([{x,y,z}], y = ground height under each point).
 * opts: closedStart / closedEnd draw an end curb (dead ends); decoSeed varies roadside details.
 */
export function addRibbon(batch, pts, width, look, opts = {}) {
  if (pts.length < 2) return;
  const L = lookOf(look), tans = tangents(pts), hw = width / 2, lift = L.lift;
  const raised = pts.map(p => ({ x: p.x, y: p.y, z: p.z }));
  batch.add(L.surface(), strip(raised, tans, -hw, hw, lift, { uScale: 1 }));
  if (L.edge) for (const s of [-1, 1]) {
    const a = s * hw, b = s * (hw - L.edge.w);
    batch.add(L.edge.mat(), strip(raised, tans, Math.min(a, b), Math.max(a, b), lift + L.edge.h, { walls: true }), true);
  }
  if (L.paint) for (const s of [-1, 1]) { const o = s * (hw - L.paint.side); batch.add(L.paint.mat(), strip(raised, tans, o - .012, o + .012, lift + .002)); }
  if (L.centre) dashes(batch, raised, tans, L.centre.mat(), lift + .002);
  for (const [end, closed] of [[0, opts.closedStart], [pts.length - 1, opts.closedEnd]]) if (closed && L.edge) {
    const p = raised[end], t = tans[end], dir = end ? 1 : -1, n = v3(-t.z, 0, t.x);
    const c = v3(p.x + t.x * dir * (L.edge.w / 2), p.y, p.z + t.z * dir * (L.edge.w / 2));
    const a = v3(c.x + n.x * hw, c.y, c.z + n.z * hw), b = v3(c.x - n.x * hw, c.y, c.z - n.z * hw);
    batch.add(L.edge.mat(), strip([a, b], tangents([a, b]), -L.edge.w / 2, L.edge.w / 2, lift + L.edge.h, { walls: true }), true);
  }
  if (L.deco) roadside(batch, raised, tans, width, look, opts.decoSeed || 0);
}
function dashes(batch, pts, tans, mat, h) {
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 0; d < len; d += .05) {
      const on = ((acc + d) % .5) < .25; if (!on) continue;
      const k = d / len, p = v3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
      const q = v3(p.x + tans[i].x * .05, p.y, p.z + tans[i].z * .05);
      batch.add(mat, strip([p, q], [tans[i], tans[i]], -.012, .012, h));
    }
    acc += len;
  }
}
/** Roadside details every ~1.4 units along the ribbon (trees on avenues, stone lanterns, planters, grass tufts). */
function roadside(batch, pts, tans, width, look, seed) {
  let acc = (seed % 7) * .2, next = .7;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    while (acc + len >= next) {
      const k = (next - acc) / len, t = tans[i], n = v3(-t.z, 0, t.x), side = (Math.floor(next / 1.4) + seed) % 2 ? 1 : -1;
      const p = v3(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k), off = width / 2 - (look === 'avenue' ? .13 : look === 'dirt' ? -.04 : .02);
      batch.deco.push({ kind: look, x: p.x + n.x * off * side, y: p.y, z: p.z + n.z * off * side, ry: Math.atan2(t.x, t.z), v: Math.floor(next * 3 + seed) });
      if (look === 'avenue') batch.deco.push({ kind: look, x: p.x - n.x * off * side, y: p.y, z: p.z - n.z * off * side, ry: Math.atan2(t.x, t.z), v: Math.floor(next * 5 + seed) + 1 });
      next += look === 'dirt' ? .55 : 1.4;
    }
    acc += len;
  }
}

/**
 * A junction pad under the ends of the ribbons that meet at `c` ({x,y,z}): a square when every road meeting there
 * runs along the map axes (the classic grid look), otherwise a disc. `dirs` are the unit XZ directions of the roads
 * leaving the junction; borders are drawn on the sides no road leaves through.
 */
export function addPad(batch, c, width, look, dirs) {
  const L = lookOf(look), hw = width / 2, lift = L.lift, y = c.y + lift;
  const axisAligned = dirs.every(d => Math.abs(d.x) < 1e-6 || Math.abs(d.z) < 1e-6);
  if (axisAligned) {
    const g = new THREE.PlaneGeometry(width, width).rotateX(-Math.PI / 2); g.translate(c.x, y, c.z);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width, uv.getY(i) * width);
    batch.add(L.surface(), g);
    if (!L.edge) return;
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (dirs.some(d => Math.abs(d.x - sx) < 1e-6 && Math.abs(d.z - sz) < 1e-6)) continue;
      // a border along this side, inside the pad (exactly like the classic tile curbs)
      const a = v3(c.x + sx * (hw - L.edge.w / 2) - sz * hw, c.y, c.z + sz * (hw - L.edge.w / 2) + sx * hw);
      const b = v3(c.x + sx * (hw - L.edge.w / 2) + sz * hw, c.y, c.z + sz * (hw - L.edge.w / 2) - sx * hw);
      batch.add(L.edge.mat(), strip([a, b], tangents([a, b]), -L.edge.w / 2, L.edge.w / 2, lift + L.edge.h, { walls: true }), true);
    }
    return;
  }
  const g = new THREE.CircleGeometry(hw, 24).rotateX(-Math.PI / 2); g.translate(c.x, y - .001, c.z);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * width, uv.getY(i) * width);
  batch.add(L.surface(), g);
  if (!L.edge) return;
  // border arcs between the roads that leave the junction; each road leaves a gap as wide as itself
  const exits = dirs.map(d => ({ a: Math.atan2(d.z, d.x), gap: Math.asin(Math.min(.98, (d.hw ?? hw * .8) / hw)) }));
  const N = 48;
  for (let i = 0; i < N; i++) {
    const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, mid = (a0 + a1) / 2;
    if (exits.some(e => Math.abs(Math.atan2(Math.sin(mid - e.a), Math.cos(mid - e.a))) < e.gap)) continue;
    const r = hw - L.edge.w / 2, p = v3(c.x + Math.cos(a0) * r, c.y, c.z + Math.sin(a0) * r), q = v3(c.x + Math.cos(a1) * r, c.y, c.z + Math.sin(a1) * r);
    batch.add(L.edge.mat(), strip([p, q], tangents([p, q]), -L.edge.w / 2, L.edge.w / 2, lift + L.edge.h, { walls: true }), true);
  }
}

// ---------------------------------------------------------------- roadside props (baked once, cloned per spot)
const decoCache = new Map();
function decoProto(kind, v) {
  const key = kind + ':' + (v % 3);
  if (decoCache.has(key)) return decoCache.get(key);
  let o;
  if (kind === 'avenue') { o = getProto('tree', v % 3).clone(); o.scale.setScalar(.62); }
  else {
    const k = Kit(7 + v);
    if (kind === 'lanterns') { const S = M.stone('#c9c1b1'); k.cyl(null, .04, .05, .03, S, 0, 0, 0, 8); k.box(null, .025, .11, .025, S, 0, .03, 0); k.box(null, .06, .05, .06, lampMat, 0, .14, 0); k.prism(null, .1, .1, 0, 0, .05, S, 0, .19, 0); k.mark(null, 0, .165, 0, 'glow'); }
    else if (kind === 'planters') { k.box(null, .11, .06, .11, M.wood(C.woodD), 0, 0, 0); k.sph(null, .05, M.leaf(C.leaf), 0, .08, 0, 1, .8, 1, 8); k.bloom(null, 0, .1, 0, .06, 3, [[C.red, C.pink, C.white][v % 3], C.butter], .014); }
    else { for (let i = 0; i < 4; i++) k.m(null, new THREE.ConeGeometry(.012, .07 + (i % 2) * .03, 4), M.leaf(i % 2 ? C.leafD : C.leaf), (i - 1.5) * .02, .03, (i % 2) * .015, 0, (i - 1.5) * .3, (i - 1.5) * .2); }
    o = bake(k);
  }
  o.traverse(c => { c.userData.shared = true; }); // clones share this geometry: owners never dispose it
  decoCache.set(key, o); return o;
}

/**
 * Bakes a batch into one geometry per material (non-indexed, ready to merge), one outline geometry and its prop spots.
 * The batch's own geometries are disposed; the piece owns the result (disposePiece releases it).
 */
export function bakePiece(batch, mergeGeometries) {
  const byMat = new Map();
  const edges = batch.outlined.length ? mergeGeometries(batch.outlined.map(g => new THREE.EdgesGeometry(g, 40))) : null;
  for (const [mat, list] of batch.byMat) {
    const flat = list.map(g => g.index ? g.toNonIndexed() : g);
    byMat.set(mat, flat.length === 1 ? flat[0] : mergeGeometries(flat));
    for (const g of new Set([...list, ...flat])) if (g !== byMat.get(mat)) g.dispose();
  }
  return { byMat, edges, deco: batch.deco };
}
export function disposePiece(piece) { for (const g of piece.byMat.values()) g.dispose(); piece.edges?.dispose(); }

/**
 * Merges baked pieces into a group: one mesh per material, one outline mesh, roadside props (clones sharing the
 * cached prop geometry). Only the merged meshes are marked `owned`; disposeGroup releases exactly those.
 */
export function assemblePieces(pieces, mergeGeometries, edgeMat) {
  const group = new THREE.Group(), byMat = new Map(), edges = [];
  for (const p of pieces) {
    if (p.edges) edges.push(p.edges);
    for (const [mat, g] of p.byMat) { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(g); }
  }
  const own = o => { o.userData.owned = true; group.add(o); return o; };
  if (edges.length) own(new THREE.LineSegments(edges.length === 1 ? edges[0].clone() : mergeGeometries(edges), edgeMat));
  for (const [mat, list] of byMat) own(new THREE.Mesh(list.length === 1 ? list[0].clone() : mergeGeometries(list), mat)).receiveShadow = true;
  for (const p of pieces) for (const d of p.deco) { const o = decoProto(d.kind, d.v).clone(); o.position.set(d.x, d.y + .02, d.z); o.rotation.y = d.ry; group.add(o); }
  return group;
}
export function disposeGroup(group) { for (const o of group.children) if (o.userData.owned) o.geometry.dispose(); }

/** Turns a batch into meshes (one per material, merged) plus roadside props. */
export function finishBatch(batch, mergeGeometries, edgeMat) {
  const piece = bakePiece(batch, mergeGeometries), group = assemblePieces([piece], mergeGeometries, edgeMat);
  disposePiece(piece); return group;
}
