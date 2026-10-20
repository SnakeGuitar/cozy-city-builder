// Road layout, engine-neutral: how the road graph is cut into drawable pieces. A renderer turns each chain into a
// ribbon and each pad into a junction surface.
//   chains — segments merged through plain two-way nodes (same style and width): one continuous centre line per chain
//   pads   — junctions, style changes, and grid cells that are dead ends or alone; chains stop at a pad's edge
import { roadsOf, listSegments, segmentPolyline, nodeRadius, pointAt, polylineLength } from '../core/domain/roads.js';

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

/** A grid cell keeps the square look while every road leaving it runs along the map axes. */
export function squarePad(state, p) {
  return p.segments.every(s => { const pl = segmentPolyline(state, s), n = p.node.position, q = s.startNodeId === p.node.id ? pl[1] : pl.at(-2); return Math.abs(q.x - n.x) < 1e-6 || Math.abs(q.z - n.z) < 1e-6; });
}


/** Cuts `fromStart` and `toEnd` off a polyline (null when nothing is left). */
export { trim as trimPolyline };
/** Half size of a node's pad: a square cell pad is as wide as its street; a round junction comes from nodeRadius. */
export function padHalfOf(state, p) {
  if (!p) return 0; const n = p.node;
  return n.width && squarePad(state, p) ? Math.max(n.width, ...p.segments.map(s => s.width)) / 2 : nodeRadius(state, n.id);
}
/** Unit directions of the roads leaving a pad's node, each with its half width. */
export function padExits(state, p) {
  const n = p.node;
  return p.segments.map(s => { const pl = segmentPolyline(state, s), from = s.startNodeId === n.id ? pl : [...pl].reverse(), q = pointAt(from, Math.min(.3, polylineLength(from) / 2)); const L = Math.hypot(q.x - n.position.x, q.z - n.position.z) || 1; return { x: (q.x - n.position.x) / L, z: (q.z - n.position.z) / L, hw: s.width / 2 }; });
}
/**
 * The whole drawable layout: { ribbons: [{ points, width, style, closedStart, closedEnd, segmentIds }], pads: [{ node, center, width, square, style, exits }] }.
 * Ribbon ends meet pad edges (overlapping by 0.01 so no hairline shows).
 */
export function roadLayout(state) {
  const r = roadsOf(state), pads = new Map(padNodes(state).map(p => [p.node.id, p]));
  const degree = new Map(); for (const s of Object.values(r.segments)) for (const n of [s.startNodeId, s.endNodeId]) degree.set(n, (degree.get(n) || 0) + 1);
  const ribbons = [];
  for (const c of roadChains(state)) {
    const a = padHalfOf(state, pads.get(c.startNode)), b = padHalfOf(state, pads.get(c.endNode)), pl = trim(c.points, Math.max(0, a - .01), Math.max(0, b - .01)); if (!pl) continue;
    ribbons.push({ points: pl, width: c.width, style: c.style, segmentIds: c.segmentIds,
      closedStart: !pads.has(c.startNode) && degree.get(c.startNode) === 1, closedEnd: !pads.has(c.endNode) && degree.get(c.endNode) === 1 });
  }
  const padList = [...pads.values()].map(p => {
    const square = !!(p.node.width && squarePad(state, p)), exits = padExits(state, p);
    return { node: p.node, center: p.node.position, square, width: padHalfOf(state, p) * 2, exits: square ? exits.map(d => ({ x: Math.round(d.x), z: Math.round(d.z), hw: d.hw })) : exits,
      style: p.node.style || p.segments.slice().sort((a, b) => b.width - a.width)[0]?.style || 'road' };
  });
  return { ribbons, pads: padList };
}
