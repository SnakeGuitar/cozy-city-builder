// Build-mode helpers drawn in the world: grid, occupied tiles, footprint, effect range, ghost preview, relation lines.
import * as THREE from 'three';
import { GRID_SIZE } from '../../core/config/world.js';
import { DEFS, isRoadType } from '../../core/config/catalog.js';
import { M, T } from './art.js';
import { getProto } from './models/index.js';
import { roadPreview, roadPlanPreview } from './roads.js';
import { roadsOf, segmentPolyline, nodeRadius } from '../../core/domain/roads.js';
import { HALF } from './coords.js';
import { footprintOf, lotAabb } from '../../core/domain/space.js';

const N = GRID_SIZE;
export const RELATION_COLOURS = { inc: '#b98a12', well: '#4f8a1e', svc: '#3f7a8c' };

/** `ground(x, z)` is the terrain height (0 on flat maps): every marker sits on it. */
export function createOverlays(scene, ground = () => 0) {
  const gridMat = new THREE.LineBasicMaterial({ color: '#6a4631', transparent: true, opacity: .16 });
  /** Grid lines over the whole map, draped on the ground in half-cell steps. */
  function makeGrid(half) {
    const pts = [], push = (x0, z0, x1, z1) => pts.push(x0, ground(x0, z0) + .04, z0, x1, ground(x1, z1) + .04, z1);
    for (let i = -half; i <= half; i++) for (let t = -half; t < half; t += .5) { push(i, t, i, t + .5); push(t, i, t + .5, i); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, gridMat); l.visible = false; scene.add(l); return l;
  }
  let gridLines = makeGrid(N / 2);
  // occupied ground: one rotated quad per building footprint (grows when the town does)
  const occGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), occMat = new THREE.MeshBasicMaterial({ color: '#c9584f', transparent: true, opacity: .16, depthWrite: false });
  let occ = new THREE.InstancedMesh(occGeo, occMat, 64); occ.count = 0; occ.visible = false; occ.renderOrder = 2; scene.add(occ);
  const markMat = new THREE.MeshBasicMaterial({ map: T.frame(), color: '#6fa35a', transparent: true, depthWrite: false, opacity: .95 });
  const foot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), markMat); foot.visible = false; foot.renderOrder = 3; scene.add(foot);
  const range = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.frame(), color: '#e8c33a', transparent: true, depthWrite: false, opacity: .7 })); range.visible = false; range.renderOrder = 2; scene.add(range);
  const ghostMats = new Map(), ghostEdge = new THREE.LineBasicMaterial({ color: '#6a4631', transparent: true, opacity: .3 });
  let ghost = null, ghostKey = '';
  const relations = new THREE.Group(); scene.add(relations);

  function ghostOf(type, variant, tier = 1) {
    const o = isRoadType(type) ? roadPreview(type, 1) : getProto(type, variant, tier).clone();
    o.traverse(c => { if (c.isMesh) { if (!ghostMats.has(c.material)) { const g = c.material.clone(); g.transparent = true; g.opacity = .62; ghostMats.set(c.material, g); } c.material = ghostMats.get(c.material); c.castShadow = false; } if (c.isLineSegments) c.material = ghostEdge; });
    return o;
  }
  // ---- roads: the plan being drawn (styled ghost over a validity band) and the piece under the demolish cursor
  const bandMat = new THREE.MeshBasicMaterial({ color: '#5f9a2c', transparent: true, opacity: .4, depthWrite: false });
  const hiMat = new THREE.MeshBasicMaterial({ color: '#c8553f', transparent: true, opacity: .45, depthWrite: false, depthTest: false });
  const selMat = new THREE.MeshBasicMaterial({ color: '#e8c33a', transparent: true, opacity: .5, depthWrite: false, depthTest: false });
  const handleMat = new THREE.MeshBasicMaterial({ color: '#fff8e6', depthTest: false }), handleOn = new THREE.MeshBasicMaterial({ color: '#4f8a1e', depthTest: false });
  const ringMat = new THREE.MeshBasicMaterial({ color: '#6a4631', depthTest: false, side: THREE.DoubleSide });
  const handleGeo = new THREE.SphereGeometry(.13, 14, 10), ringGeo = new THREE.RingGeometry(.15, .2, 24).rotateX(-Math.PI / 2);
  let plan = null, planBand = null, hi = null, hiKey = '', sel = null, selKey = '', handles = null, markers = null;
  const endRingGeo = new THREE.RingGeometry(.22, .3, 28).rotateX(-Math.PI / 2), endDotGeo = new THREE.CircleGeometry(.14, 20).rotateX(-Math.PI / 2), crossGeo = new THREE.BoxGeometry(.5, .02, .09);
  const joinedMat = new THREE.MeshBasicMaterial({ color: '#4f8a1e', depthTest: false }), freeMat = new THREE.MeshBasicMaterial({ color: '#fff8e6', depthTest: false }), problemMat = new THREE.MeshBasicMaterial({ color: '#c8553f', depthTest: false });
  /** A road piece as a highlight mesh. */
  function pieceMesh(state, piece, mat) {
    const r = roadsOf(state); let m = null;
    if (piece.segmentId && r.segments[piece.segmentId]) { const s = r.segments[piece.segmentId]; m = new THREE.Mesh(band(segmentPolyline(state, s), s.width / 2 + .05, .06), mat); }
    else if (piece.nodeId && r.nodes[piece.nodeId]) { const n = r.nodes[piece.nodeId], w = n.width || nodeRadius(state, n.id) * 2; m = new THREE.Mesh(new THREE.PlaneGeometry(w + .1, w + .1).rotateX(-Math.PI / 2), mat); m.position.set(n.position.x, ground(n.position.x, n.position.z) + .06, n.position.z); }
    if (m) { m.renderOrder = 4; scene.add(m); } return m;
  }
  /** A flat band along a polyline (half width hw), y above the ground. */
  function band(pl, hw, y) {
    const pos = [], idx = [];
    pl.forEach((p, i) => { const a = pl[Math.max(0, i - 1)], b = pl[Math.min(pl.length - 1, i + 1)], L = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L;
      pos.push(p.x + nx * hw, ground(p.x + nx * hw, p.z + nz * hw) + y, p.z + nz * hw, p.x - nx * hw, ground(p.x - nx * hw, p.z - nz * hw) + y, p.z - nz * hw); if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
  }
  const disposeGroup = o => { if (!o) return; scene.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); }); };

  return {
    /** Shows a road plan from core/domain/roadPlan.js while it is drawn; `ok` tints it green or red. */
    roadPlan(p, ok) {
      disposeGroup(plan); disposeGroup(planBand); plan = planBand = null;
      if (!p || !p.polyline || p.polyline.length < 2) return;
      plan = roadPlanPreview(p, ground); plan.traverse(c => { if (c.isMesh) { if (!ghostMats.has(c.material)) { const g = c.material.clone(); g.transparent = true; g.opacity = .7; ghostMats.set(c.material, g); } c.material = ghostMats.get(c.material); } if (c.isLineSegments) c.material = ghostEdge; });
      bandMat.color.set(ok ? '#5f9a2c' : '#c8553f');
      planBand = new THREE.Mesh(band(p.polyline, p.width / 2 + .08, .015), bandMat); planBand.renderOrder = 3;
      scene.add(planBand); scene.add(plan);
    },
    hideRoadPlan() { disposeGroup(plan); disposeGroup(planBand); plan = planBand = null; },
    /** Highlights a road piece ({ segmentId } | { nodeId }) for demolition, or clears it with null. */
    /** Highlights a road piece: red under the demolish cursor, or (selected = true) the selected road in yellow. null clears. */
    roadHighlight(state, piece, selected = false) {
      const key = piece && state ? JSON.stringify(piece) + (selected ? JSON.stringify(roadsOf(state).segments[piece.segmentId]?.controlPoints || '') : '') : '';
      if (selected) { if (key === selKey) return; selKey = key; disposeGroup(sel); sel = key ? pieceMesh(state, piece, selMat) : null; return; }
      if (key === hiKey) return; hiKey = key; disposeGroup(hi); hi = key ? pieceMesh(state, piece, hiMat) : null;
    },
    /**
     * Markers for a road being drawn: { ends: [{ position, joined }], problem: { x, z } | null }, or null to hide.
     * A joined end (it meets an existing road) is a filled green disc in a ring; a free end only a ring; a problem a red cross.
     */
    roadMarkers(m) {
      disposeGroup(markers); markers = null; if (!m) return;
      markers = new THREE.Group();
      for (const e of m.ends || []) {
        const y = ground(e.position.x, e.position.z) + .12, ring = new THREE.Mesh(endRingGeo, e.joined ? joinedMat : freeMat); ring.position.set(e.position.x, y, e.position.z); ring.renderOrder = 13; markers.add(ring);
        if (e.joined) { const dot = new THREE.Mesh(endDotGeo, joinedMat); dot.position.set(e.position.x, y, e.position.z); dot.renderOrder = 13; markers.add(dot); }
      }
      if (m.problem) {
        const y = ground(m.problem.x, m.problem.z) + .14;
        for (const a of [Math.PI / 4, -Math.PI / 4]) { const bar = new THREE.Mesh(crossGeo, problemMat); bar.position.set(m.problem.x, y, m.problem.z); bar.rotation.y = a; bar.renderOrder = 14; markers.add(bar); }
        const ring = new THREE.Mesh(endRingGeo, problemMat); ring.position.set(m.problem.x, y, m.problem.z); ring.scale.setScalar(1.4); ring.renderOrder = 14; markers.add(ring);
      }
      scene.add(markers);
    },
    /** Drag handles on a curve's control points (null hides them); the active one is green. */
    roadHandles(points, active = -1) {
      disposeGroup(handles); handles = null; if (!points) return;
      handles = new THREE.Group();
      points.forEach((p, i) => { const h = new THREE.Mesh(handleGeo, i === active ? handleOn : handleMat); const y = ground(p.x, p.z) + .15; h.position.set(p.x, y, p.z); h.renderOrder = 12; const ring = new THREE.Mesh(ringGeo, ringMat); ring.position.set(p.x, y, p.z); ring.renderOrder = 11; handles.add(h, ring); });
      scene.add(handles);
    },
    setBuildMode(on) { gridLines.visible = occ.visible = on; },
    /** A map was loaded: grid lines for its size and ground. */
    setMap(state) { const vis = gridLines.visible; scene.remove(gridLines); gridLines.geometry.dispose(); gridLines = makeGrid((state.map?.size || N) / 2); gridLines.visible = vis; },
    /** Occupied ground from the buildings' footprints (rotated as placed). */
    refreshOccupancy(state) {
      const list = Object.values(state.buildings);
      if (list.length > occ.instanceMatrix.count) { const vis = occ.visible; scene.remove(occ); occ.dispose(); occ = new THREE.InstancedMesh(occGeo, occMat, Math.max(64, list.length * 2)); occ.visible = vis; occ.renderOrder = 2; scene.add(occ); }
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      list.forEach((b, i) => { const f = footprintOf(b.type); q.setFromAxisAngle(up, b.rotation); m.compose(new THREE.Vector3(b.position.x, ground(b.position.x, b.position.z) + .05, b.position.z), q, new THREE.Vector3(f.width * .94, 1, f.depth * .94)); occ.setMatrixAt(i, m); });
      occ.count = list.length; occ.instanceMatrix.needsUpdate = true;
    },
    /** The footprint of `type` at a pose, green when it fits. */
    footprint(type, position, rotation, ok) { const f = footprintOf(type); foot.visible = true; foot.position.set(position.x, ground(position.x, position.z) + .05, position.z); foot.rotation.y = rotation; foot.scale.set(f.width, 1, f.depth); markMat.color.set(ok ? '#5f9a2c' : '#c8553f'); },
    hideFootprint() { foot.visible = false; },
    /** Largest effect or service radius of a type around a pose (`r` overrides the radius, e.g. a tier's). */
    range(type, position, rotation, r) {
      const d = DEFS[type]; r = r || d.r || (d.fx ? Math.max(...d.fx.map(f => f.r)) : 0);
      if (!r) { range.visible = false; return; }
      const a = lotAabb({ type, position, rotation }), w = a.maxX - a.minX, dd = a.maxZ - a.minZ;
      range.position.set((a.minX + a.maxX) / 2, ground(position.x, position.z) + .045, (a.minZ + a.maxZ) / 2); range.scale.set(w + 2 * r, 1, dd + 2 * r); range.visible = true;
    },
    hideRange() { range.visible = false; },
    ghost(type, variant, position, rotation, ok, time, tier = 1) {
      const key = type + ':' + variant + ':' + tier;
      if (ghostKey !== key) { if (ghost) scene.remove(ghost); ghost = ghostOf(type, variant, tier); ghostKey = key; scene.add(ghost); }
      ghost.visible = true;
      ghost.position.set(position.x, ground(position.x, position.z) + (ok ? .06 + Math.sin(time * 3.3) * .015 : .02), position.z); ghost.rotation.y = rotation;
    },
    hideGhost() { if (ghost) ghost.visible = false; },
    clearGhost() { if (ghost) scene.remove(ghost); ghost = null; ghostKey = ''; },
    /** links: [{ from: Vector3, to: Vector3, kind: 'inc'|'well'|'svc' }] */
    relations(links) {
      relations.clear();
      for (const { from, to, kind } of links) {
        const mid = from.clone().lerp(to, .5); mid.y += .6 + from.distanceTo(to) * .12;
        const geo = new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(from, mid, to).getPoints(30));
        const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: RELATION_COLOURS[kind], dashSize: .12, gapSize: .08, transparent: true, opacity: .9, depthTest: false }));
        line.computeLineDistances(); line.renderOrder = 10; relations.add(line);
      }
    },
  };
}
