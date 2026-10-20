// The road network drawn from the core's graph (state.roads). Segments that continue through a plain two-way node
// (same style and width) are merged into one chain, so curves and bends are a single ribbon with mitred joints.
// Junctions, dead-end cells of the grid tool and lone cells get a pad below the ribbons; the chains stop at the pad's
// edge so their curbs never cross a side street. Free road ends without a pad get an end curb.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { edgeMat } from './art.js';
import { DEFS } from '../../core/config/catalog.js';
import { roadsOf, listSegments, segmentPolyline, nodeRadius, pointAt, polylineLength } from '../../core/domain/roads.js';
import { createRoadBatch, addPad, addRibbon, finishBatch } from './roadMesh.js';

const lookOf = style => DEFS[style]?.road?.look || 'classic';
const same = (a, b) => a.style === b.style && Math.abs(a.width - b.width) < 1e-9;

/** Groups segments into chains through plain two-way nodes. Pure: [{ points, startNode, endNode, style, width, segmentIds }]. */
export function roadChains(state) {
  const segs = listSegments(state), at = new Map(), used = new Set(), out = [];
  for (const s of segs) for (const n of [s.startNodeId, s.endNodeId]) { if (!at.has(n)) at.set(n, []); at.get(n).push(s); }
  const passable = n => { const l = at.get(n) || []; return l.length === 2 && same(l[0], l[1]) && l[0].id !== l[1].id; };
  const oriented = (s, from) => { const pl = segmentPolyline(state, s); return s.startNodeId === from ? pl : [...pl].reverse(); };
  const walk = (seg, from) => {
    const chain = { points: [], startNode: from, style: seg.style, width: seg.width, segmentIds: [] };
    let s = seg, node = from;
    while (s && !used.has(s.id)) {
      used.add(s.id); chain.segmentIds.push(s.id);
      const pl = oriented(s, node); chain.points.push(...(chain.points.length ? pl.slice(1) : pl));
      node = s.startNodeId === node ? s.endNodeId : s.startNodeId;
      if (!passable(node)) break;
      s = at.get(node).find(x => x.id !== s.id);
    }
    chain.endNode = node; return chain;
  };
  for (const s of segs) if (!used.has(s.id)) for (const n of [s.startNodeId, s.endNodeId]) if (!passable(n) && !used.has(s.id)) out.push(walk(s, n));
  for (const s of segs) if (!used.has(s.id)) out.push(walk(s, s.startNodeId)); // closed loops of plain nodes
  return out;
}
/** Nodes that get a pad: junctions, style changes, and grid cells that are dead ends or alone. */
export function padNodes(state) {
  const r = roadsOf(state), deg = new Map(), segsAt = new Map();
  for (const s of Object.values(r.segments)) for (const n of [s.startNodeId, s.endNodeId]) { deg.set(n, (deg.get(n) || 0) + 1); if (!segsAt.has(n)) segsAt.set(n, []); segsAt.get(n).push(s); }
  return Object.values(r.nodes).filter(n => { const d = deg.get(n.id) || 0, l = segsAt.get(n.id) || []; return d >= 3 || (d === 2 && !same(l[0], l[1])) || (!!n.width && d !== 2) || d === 0; })
    .map(n => ({ node: n, segments: segsAt.get(n.id) || [] }));
}
function trim(pl, fromStart, toEnd) {
  const L = polylineLength(pl); if (L - fromStart - toEnd < .02) return null;
  const out = [pointAt(pl, fromStart)]; let acc = 0;
  for (let i = 1; i < pl.length; i++) { acc += Math.hypot(pl[i].x - pl[i - 1].x, pl[i].z - pl[i - 1].z); if (acc > fromStart + 1e-6 && acc < L - toEnd - 1e-6) out.push(pl[i]); }
  out.push(pointAt(pl, L - toEnd)); return out;
}

/** Adds the whole network to a batch. `heightAt(x, z)` drapes it on the ground (flat by default). */
export function addNetwork(batch, state, heightAt = () => 0) {
  const r = roadsOf(state), pads = new Map(padNodes(state).map(p => [p.node.id, p]));
  const degree = new Map(); for (const s of Object.values(r.segments)) for (const n of [s.startNodeId, s.endNodeId]) degree.set(n, (degree.get(n) || 0) + 1);
  const deg = id => degree.get(id) || 0;
  // a square cell pad is as wide as its street; a round junction is a little wider than its widest road
  const padHalf = id => { const p = pads.get(id); if (!p) return 0; const n = p.node; return n.width && squarePad(state, p) ? Math.max(n.width, ...p.segments.map(s => s.width)) / 2 : nodeRadius(state, id); };
  for (const c of roadChains(state)) {
    const a = padHalf(c.startNode), b = padHalf(c.endNode), pl = trim(c.points, Math.max(0, a - .01), Math.max(0, b - .01)); if (!pl) continue;
    addRibbon(batch, pl.map(p => ({ x: p.x, y: heightAt(p.x, p.z), z: p.z })), c.width, lookOf(c.style), {
      closedStart: !pads.has(c.startNode) && deg(c.startNode) === 1, closedEnd: !pads.has(c.endNode) && deg(c.endNode) === 1, decoSeed: c.segmentIds[0] * 7 });
  }
  for (const p of pads.values()) {
    const n = p.node, dirs = p.segments.map(s => { const pl = segmentPolyline(state, s), from = s.startNodeId === n.id ? pl : [...pl].reverse(), q = pointAt(from, Math.min(.3, polylineLength(from) / 2)); const L = Math.hypot(q.x - n.position.x, q.z - n.position.z) || 1; return { x: (q.x - n.position.x) / L, z: (q.z - n.position.z) / L, hw: s.width / 2 }; });
    const square = n.width && squarePad(state, p), width = square ? Math.max(n.width, ...p.segments.map(s => s.width)) : padHalf(n.id) * 2;
    const style = n.style || p.segments.slice().sort((a, b) => b.width - a.width)[0]?.style || 'road';
    // square pads use exact axis directions; disc pads any
    addPad(batch, { x: n.position.x, y: heightAt(n.position.x, n.position.z) - .002, z: n.position.z }, width, lookOf(style), square ? dirs.map(d => ({ x: Math.round(d.x), z: Math.round(d.z), hw: d.hw })) : dirs);
  }
  return batch;
}
/** A grid cell keeps the square look while every road leaving it runs along the map axes. */
function squarePad(state, p) {
  return p.segments.every(s => { const pl = segmentPolyline(state, s), n = p.node.position, q = s.startNodeId === p.node.id ? pl[1] : pl.at(-2); return Math.abs(q.x - n.x) < 1e-6 || Math.abs(q.z - n.z) < 1e-6; });
}

export function createRoadView(scene) {
  let group = null;
  return {
    rebuild(state, heightAt) {
      if (group) { scene.remove(group); group.traverse(o => o.geometry && o.geometry.dispose()); }
      group = finishBatch(addNetwork(createRoadBatch(), state, heightAt), mergeGeometries, edgeMat);
      scene.add(group);
    },
  };
}

/** A short straight piece of a street look centred on the origin (catalogue thumbnails, build ghosts). */
export function roadPreview(type, length = 2) {
  const batch = createRoadBatch(), w = Math.min(1.5, DEFS[type].road.width), look = DEFS[type].road.look;
  addRibbon(batch, [{ x: 0, y: 0, z: -length / 2 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: length / 2 }], w, look, { decoSeed: 1 });
  return finishBatch(batch, mergeGeometries, edgeMat);
}
/** A planned road (preview while drawing): the ribbon along the planned centre line, tinted by validity. */
export function roadPlanPreview(plan, heightAt = () => 0) {
  const batch = createRoadBatch();
  if (plan.polyline && plan.polyline.length > 1) addRibbon(batch, plan.polyline.map(p => ({ x: p.x, y: heightAt(p.x, p.z) + .01, z: p.z })), plan.width, lookOf(plan.style), { closedStart: plan.start?.kind === 'free', closedEnd: plan.end?.kind === 'free' });
  return finishBatch(batch, mergeGeometries, edgeMat);
}
