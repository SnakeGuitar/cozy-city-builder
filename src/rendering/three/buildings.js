// Building views: Map<BuildingId, view>. Simulation records never hold Three.js objects; this module does.
import * as THREE from 'three';
import { DEFS, isRoadType } from '../../core/config/catalog.js';
import { C, M, T, edgeMat, selEdgeMat } from './art.js';
import { getProto, variantOf } from './models/index.js';
import { buildingCenter } from './coords.js';

const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ map: T.blob(), transparent: true, depthWrite: false, opacity: .55 });
export const glowMat = new THREE.SpriteMaterial({ map: T.puff(), color: '#ffcb72', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
const easeBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const Y = new THREE.Vector3(0, 1, 0);

export function createBuildingViews(scene, ambient) {
  const root = new THREE.Group(); scene.add(root);
  const views = new Map(); // id -> { group, sway[], swayPh, smoke[], smokeT, type }
  const anims = [];
  let selectedId = 0;

  function build(b) {
    const d = DEFS[b.type], group = new THREE.Group(), o = getProto(b.type, variantOf(b.type, b.seed), b.tier || 1).clone();
    o.rotation.y = b.rotation; group.add(o);
    const blob = new THREE.Mesh(blobGeo, blobMat); blob.scale.set(d.s * 1.3, 1, d.s * 1.3); blob.position.y = .006; blob.userData.blob = true; group.add(blob);
    for (const a of o.userData.anchors.glow) { const sp = new THREE.Sprite(glowMat); sp.position.copy(a); sp.scale.setScalar(.5); o.add(sp); }
    group.position.copy(buildingCenter(b)); group.userData.bid = b.id;
    const view = { group, type: b.type, sway: o.children.filter(c => c.userData.sub === 'sway'), swayPh: b.seed % 100 / 16,
      smoke: o.userData.anchors.smoke.map(v => new THREE.Vector3().copy(v).applyAxisAngle(Y, o.rotation.y).add(group.position)), smokeT: Math.random() * 2 };
    root.add(group); views.set(b.id, view);
    if (b.id === selectedId) setEdges(view, true);
    return view;
  }
  function setEdges(view, on) { view.group.traverse(o => { if (o.isLineSegments) o.material = on ? selEdgeMat : edgeMat; }); }
  function drop(id, animate) {
    const v = views.get(id); if (!v) return; views.delete(id);
    if (animate) { anims.push({ group: v.group, t: 0, kind: 'out' }); ambient.dust(v.group.position, DEFS[v.type].s); } else root.remove(v.group);
  }
  /** Wooden scaffolding around a building's bounds (upgrade animation). */
  function scaffold(group) {
    const box = new THREE.Box3().setFromObject(group), sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const s = new THREE.Group(), pole = M.wood(C.wood), plank = M.wood('#c49a6c'), w = sz.x / 2 + .05, d = sz.z / 2 + .05, h = sz.y + .1;
    for (const sx of [-1, 1]) for (const sz2 of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(.025, h, .025), pole); m.position.set(c.x + sx * w, h / 2, c.z + sz2 * d); s.add(m); }
    for (let y = .25; y < h; y += .3) for (const [dx, dz, lx, lz] of [[0, d, 2 * w, .05], [0, -d, 2 * w, .05], [w, 0, .05, 2 * d], [-w, 0, .05, 2 * d]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(lx, .02, lz), plank); m.position.set(c.x + dx, y, c.z + dz); s.add(m);
    }
    s.traverse(o => { if (o.isMesh) o.castShadow = true; }); return s;
  }
  return {
    root,
    /** A building reached a new tier: scaffolding, the old model sinks, the new one springs up with sparkles. */
    upgrade(b) {
      if (anims.some(a => a.kind === 'sink' && a.id === b.id && !a.done)) return; // already rebuilding: it will show the latest tier
      const v = views.get(b.id); if (!v) { this.add(b); return; }
      views.delete(b.id);
      const sc = scaffold(v.group); scene.add(sc);
      anims.push({ group: v.group, t: 0, kind: 'sink', id: b.id, scaffold: sc, then: () => {
        root.remove(v.group); if (views.has(b.id)) drop(b.id, false); const nv = build(b); anims.push({ group: nv.group, t: 0, kind: 'in' });
        const p = nv.group.position, s = DEFS[b.type].s;
        for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; ambient.puff(p.clone().add(new THREE.Vector3(Math.cos(a) * s * .55, .2 + (i % 3) * .25, Math.sin(a) * s * .55)), { color: ['#ffd76a', '#fff3c4', '#f2b84b'][i % 3], vy: .5, vx: Math.cos(a) * .15, vz: Math.sin(a) * .15, life: 1.4, s0: .1, grow: .05, a: .95 }); }
        ambient.dust(p, s);
      } });
    },
    /** Rebuild every view from state (new game, load). */
    rebuildAll(state, { animate = false } = {}) {
      for (const id of [...views.keys()]) drop(id, false);
      for (const b of Object.values(state.buildings)) if (!isRoadType(b.type)) { const v = build(b); if (animate) anims.push({ group: v.group, t: -Math.random() * .6, kind: 'in' }); }
    },
    add(b, { animate = true } = {}) { const v = build(b); if (animate) { anims.push({ group: v.group, t: 0, kind: 'in' }); ambient.dust(v.group.position, DEFS[b.type].s); } },
    remove: drop,
    /** Position or rotation changed: rebuild the view in place. */
    replace(b, { animate = true } = {}) { drop(b.id, false); this.add(b, { animate }); },
    setHidden(id, hidden) { const v = views.get(id); if (v) v.group.visible = !hidden; },
    select(id) { const old = views.get(selectedId); if (old) setEdges(old, false); selectedId = id || 0; const v = views.get(selectedId); if (v) setEdges(v, true); },
    has: id => views.has(id),
    /** Visual-only animation: placement bounce, removal shrink, tree sway and chimney smoke. */
    update(rdt, clock) {
      for (let i = anims.length - 1; i >= 0; i--) {
        const a = anims[i], o = a.group; a.t += rdt;
        if (a.kind === 'sink') { // upgrade: the scaffold rises, the old model shrinks into it, then the new one replaces it
          const k = Math.min(1, a.t / .8); a.scaffold.scale.set(1, Math.min(1, a.t / .3), 1); o.scale.set(1, 1 - .25 * k, 1);
          if (k >= 1 && !a.done) { a.done = true; a.then(); }
          if (a.t > 1.4) { a.scaffold.scale.y = Math.max(.001, 1 - (a.t - 1.4) / .3); if (a.t > 1.7) { scene.remove(a.scaffold); anims.splice(i, 1); } }
          continue;
        }
        const k = Math.max(0, Math.min(1, a.t / (a.kind === 'in' ? .55 : .35)));
        if (a.kind === 'in') { const e = easeBack(k); o.scale.set(.85 + .15 * Math.min(1, e), Math.max(.01, e), .85 + .15 * Math.min(1, e)); o.position.y = (1 - k) * (1 - k) * .5; }
        else o.scale.setScalar(Math.max(.001, 1 - k));
        if (k >= 1) { if (a.kind === 'out') root.remove(o); else { o.scale.set(1, 1, 1); o.position.y = 0; } anims.splice(i, 1); }
      }
      for (const v of views.values()) {
        for (const s of v.sway) { s.rotation.z = Math.sin(clock * 1.3 + v.swayPh) * .035; s.rotation.x = Math.sin(clock * .9 + v.swayPh * 2) * .025; }
        if (v.smoke.length && v.group.visible && (v.smokeT -= rdt) <= 0) { v.smokeT = (v.type === 'bakery' ? .7 : 1.4) + Math.random(); for (const p of v.smoke) ambient.puff(p, { s0: .08, grow: .16, a: .45 }); }
      }
    },
    /** Building id under a ray, ignoring shadow blobs. */
    pick(ray) {
      for (const h of ray.intersectObjects(root.children, true)) {
        if (!h.object.isMesh || h.object.userData.blob) continue;
        let o = h.object; while (o && o.userData.bid === undefined) o = o.parent;
        if (o && views.has(o.userData.bid) && o.visible) return o.userData.bid;
      }
      return 0;
    },
  };
}
