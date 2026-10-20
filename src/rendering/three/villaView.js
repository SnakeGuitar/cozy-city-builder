// Villas in the 3D view: the fences of placed villas (one merged mesh per material, redrawn when groups change) and
// a whole-villa preview (buildings, private paths and fence in the villa's own frame) for placing, moving and
// catalogue pictures. Rendering only; the core decides what a villa contains.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, C } from './art.js';
import { getProto, variantOf } from './models/index.js';
import { blueprintProto } from './blueprintModel.js';
import { roadPlanPreview } from './roads.js';
import { DEFS } from '../../core/config/catalog.js';
import { getVilla, fenceRuns, toWorld, groupsOf } from '../../core/domain/villa.js';
import { getBlueprint } from '../../core/domain/blueprint.js';
import { curvePoints } from '../../core/domain/roads.js';

/** Fence look per style: posts, rails or a solid band, all as plain boxes along a run. */
const FENCES = {
  picket: { h: .16, post: { w: .025, every: .09, mat: () => M.paint(C.white) }, rails: [{ y: .05, h: .018, d: .014 }, { y: .11, h: .018, d: .014 }], railMat: () => M.paint(C.white) },
  iron:   { h: .2, post: { w: .012, every: .06, mat: () => M.paint(C.iron) }, rails: [{ y: .02, h: .012, d: .012 }, { y: .18, h: .012, d: .012 }], railMat: () => M.paint(C.iron) },
  hedge:  { h: .2, band: { d: .14, mat: () => M.leaf(C.leafD) } },
  stone:  { h: .12, band: { d: .1, mat: () => M.stone('#cfc4ae') }, cap: { h: .02, d: .13, mat: () => M.paint(C.stoneD) } },
};
/** Adds the boxes of one fence run (a → b on the ground, heights from `y(x, z)`) to `byMat`. */
function fenceRun(byMat, style, a, b, y) {
  const F = FENCES[style] || FENCES.picket, L = Math.hypot(b.x - a.x, b.z - a.z); if (L < .02) return;
  const ang = Math.atan2(b.x - a.x, b.z - a.z), add = (mat, g) => { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(g); };
  const box = (w, h, d, x, yy, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); g.rotateY(ang); g.translate(x, yy, z); return g; };
  const at = t => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
  if (F.band) {
    const steps = Math.max(1, Math.ceil(L / .5)); // follow the ground in short pieces
    for (let i = 0; i < steps; i++) { const p = at((i + .5) / steps); add(F.band.mat(), box(F.band.d, F.h, L / steps + .01, p.x, y(p.x, p.z), p.z)); if (F.cap) add(F.cap.mat(), box(F.cap.d, F.cap.h, L / steps + .01, p.x, y(p.x, p.z) + F.h, p.z)); }
    return;
  }
  const n = Math.max(1, Math.round(L / F.post.every));
  for (let i = 0; i <= n; i++) { const p = at(i / n); add(F.post.mat(), box(F.post.w, F.h, F.post.w, p.x, y(p.x, p.z), p.z)); }
  const steps = Math.max(1, Math.ceil(L / .5));
  for (let i = 0; i < steps; i++) { const p = at((i + .5) / steps); for (const r of F.rails) add(F.railMat(), box(r.d, r.h, L / steps + .005, p.x, y(p.x, p.z) + r.y, p.z)); }
}
function mergeInto(group, byMat) {
  for (const [mat, list] of byMat) { const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = m.receiveShadow = true; m.userData.owned = true; group.add(m); list.forEach(g => g.dispose()); }
}

/** Fences of every placed villa, redrawn as a whole when groups change (a handful of boxes per villa). */
export function createVillaViews(scene) {
  let root = null;
  return {
    rebuild(state, heightAt = () => 0) {
      if (root) { scene.remove(root); root.traverse(o => { if (o.userData.owned) o.geometry.dispose(); }); }
      root = new THREE.Group(); const byStyle = new Map();
      for (const g of Object.values(groupsOf(state))) {
        const v = g.fence && getVilla(state, g.villa); if (!v) continue;
        const def = { ...v, fence: g.fence }, pose = { position: g.position, rotation: g.rotation };
        if (!byStyle.has(g.fence.style)) byStyle.set(g.fence.style, new Map());
        for (const r of fenceRuns(def)) fenceRun(byStyle.get(g.fence.style), g.fence.style, toWorld(pose, r.a), toWorld(pose, r.b), heightAt);
      }
      for (const byMat of byStyle.values()) mergeInto(root, byMat);
      scene.add(root);
    },
  };
}

/**
 * A whole villa in its own frame (origin at its centre, +z its front): building models, private paths and fence.
 * `state` resolves custom designs. The caller positions and turns the returned group.
 */
export function villaPreview(state, v) {
  const group = new THREE.Group();
  for (const it of v.items) {
    if (it.kind === 'building') {
      const bp = it.blueprint && getBlueprint(state, it.blueprint);
      const o = (bp ? blueprintProto(bp) : getProto(it.type, variantOf(it.type, it.seed || 0), 1)).clone();
      o.position.set(it.position.x, 0, it.position.z); o.rotation.y = it.rotation; group.add(o);
    } else {
      const pl = it.shape === 'curve' ? curvePoints(it.points) : it.points;
      const r = roadPlanPreview({ polyline: pl, width: DEFS[it.style].road.width, style: it.style, start: { kind: 'free' }, end: { kind: 'free' } }); r.position.y = -.01; group.add(r);
    }
  }
  if (v.fence) { const byMat = new Map(); for (const r of fenceRuns(v)) fenceRun(byMat, v.fence.style, r.a, r.b, () => 0); mergeInto(group, byMat); }
  return group;
}
/** Releases a preview's own geometry (fence, path ribbons); building models are shared and stay. */
export function disposePreview(group) { group.traverse(o => { if (o.userData.owned && o.geometry) o.geometry.dispose(); }); }
