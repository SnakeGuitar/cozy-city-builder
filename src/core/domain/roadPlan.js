// Planning a road before building it, and building it. Pure planning (planRoad) feeds both the preview a front end
// draws while the player drags and the BuildRoad command, so the preview and the result always agree.
//
// A request is { points: [{x, z}, …], style }: the first and last points are the ends, the points between are
// control points of a smooth curve (two points make a straight road). Ends within SNAP_RADIUS of a node join it;
// ends on an existing road split it there. Where the new road crosses another, both are split and joined (an intersection).
import { DEFS, isRoadType } from '../config/catalog.js';
import { mapHalf, queryArea, obbOf } from './space.js';
import { segmentObbDistance } from './geometry.js';
import { roadsOf, curvePoints, polylineLength, closestOnPolyline, segmentPolyline, nearestRoadPoint, roadPiecesIn, nodeRadius,
  addNode, addSegment, splitSegment, SNAP_RADIUS, listSegments } from './roads.js';

const MIN_LENGTH = .5;
export const roadWidthOf = style => DEFS[style].road.width;
/** Price of a road of `length` in `style` (the catalogue cost is per unit of length; a grid cell is one unit). */
export const roadCostOf = (style, length) => Math.ceil(DEFS[style].cost * length - 1e-9);

/** Where a road end lands: an existing node, a point on a segment (to split), or open ground. */
export function snapRoadEnd(state, p, snap = true) {
  if (!snap) return { kind: 'free', position: { x: p.x, z: p.z } };
  const r = roadsOf(state); let best = null;
  for (const n of Object.values(r.nodes)) { const d = Math.hypot(n.position.x - p.x, n.position.z - p.z); if (d <= Math.max(SNAP_RADIUS, nodeRadius(state, n.id)) && (!best || d < best.d)) best = { kind: 'node', nodeId: n.id, position: { ...n.position }, d }; }
  if (best) return best;
  const near = nearestRoadPoint(state, p.x, p.z, SNAP_RADIUS);
  if (near && near.segmentId) {
    const seg = r.segments[near.segmentId], len = polylineLength(segmentPolyline(state, seg));
    // close to an end of that segment: join the end node instead of splitting a sliver off
    if (near.s < SNAP_RADIUS) return { kind: 'node', nodeId: seg.startNodeId, position: { ...r.nodes[seg.startNodeId].position } };
    if (near.s > len - SNAP_RADIUS) return { kind: 'node', nodeId: seg.endNodeId, position: { ...r.nodes[seg.endNodeId].position } };
    return { kind: 'split', segmentId: near.segmentId, s: near.s, position: { x: near.x, z: near.z } };
  }
  if (near && near.nodeId) return { kind: 'node', nodeId: near.nodeId, position: { x: near.x, z: near.z } };
  return { kind: 'free', position: { x: p.x, z: p.z } };
}

function intersect(a, b, c, d) {
  const r = { x: b.x - a.x, z: b.z - a.z }, s = { x: d.x - c.x, z: d.z - c.z }, den = r.x * s.z - r.z * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den, u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u, x: a.x + r.x * t, z: a.z + r.z * t } : null;
}
/** Arc lengths where polyline A crosses polyline B: [{ sA, sB, x, z }]. */
function crossings(A, B) {
  const out = []; let accA = 0;
  for (let i = 1; i < A.length; i++) {
    const la = Math.hypot(A[i].x - A[i - 1].x, A[i].z - A[i - 1].z); let accB = 0;
    for (let j = 1; j < B.length; j++) {
      const lb = Math.hypot(B[j].x - B[j - 1].x, B[j].z - B[j - 1].z), hit = intersect(A[i - 1], A[i], B[j - 1], B[j]);
      if (hit) out.push({ sA: accA + la * hit.t, sB: accB + lb * hit.u, x: hit.x, z: hit.z });
      accB += lb;
    }
    accA += la;
  }
  return out;
}

/**
 * Plans a road. Pure. Returns { ok, reason?, style, width, length, cost, polyline, start, end, controlPoints, crossings }.
 * reasons: 'unknown' · 'tooShort' · 'outside' · 'blocked' (a building is in the way) · 'roadOverlap' (runs along another road)
 *          · 'sameNode' · terrain reasons from planHooks.terrain.
 */
export function planRoad(state, { points, style, snap = true }) {
  if (!isRoadType(style)) return { ok: false, reason: 'unknown' };
  if (!Array.isArray(points) || points.length < 2 || points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.z))) return { ok: false, reason: 'tooShort' };
  const width = roadWidthOf(style), hw = width / 2;
  const start = snapRoadEnd(state, points[0], snap), end = snapRoadEnd(state, points.at(-1), snap);
  if (start.kind === 'node' && end.kind === 'node' && start.nodeId === end.nodeId) return { ok: false, reason: 'sameNode', style, width };
  const controlPoints = points.slice(1, -1).map(p => ({ x: p.x, z: p.z }));
  const polyline = curvePoints([start.position, ...controlPoints, end.position]), length = polylineLength(polyline);
  const base = { style, width, length, cost: roadCostOf(style, length), polyline, start, end, controlPoints };
  if (length < MIN_LENGTH) return { ok: false, reason: 'tooShort', ...base };
  const why = checkCurve(state, polyline, width); if (why) return { ok: false, reason: why.reason, blocker: why.blocker, ...base };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of polyline) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  // crossings with other roads become intersections; running along a road is refused
  const r = roadsOf(state), cross = [];
  const endGap = s => Math.min(s, length - s);
  for (const key of roadPiecesIn(state, { minX: minX - hw, maxX: maxX + hw, minZ: minZ - hw, maxZ: maxZ + hw })) {
    if (key[0] !== 's') continue;
    const seg = r.segments[+key.slice(1)], pl = segmentPolyline(state, seg);
    for (const c of crossings(polyline, pl)) if (endGap(c.sA) > SNAP_RADIUS * .6) cross.push({ segmentId: seg.id, sNew: c.sA, sOld: c.sB, x: c.x, z: c.z });
  }
  cross.sort((a, b) => a.sNew - b.sNew);
  const nearCross = s => cross.some(c => Math.abs(c.sNew - s) < hw + 1);
  let acc = 0;
  for (let i = 1; i < polyline.length; i++) {
    acc += Math.hypot(polyline[i].x - polyline[i - 1].x, polyline[i].z - polyline[i - 1].z);
    if (endGap(acc) < SNAP_RADIUS + hw || nearCross(acc)) continue;
    const near = nearestRoadPoint(state, polyline[i].x, polyline[i].z, 0);
    // the new centre line runs inside another road away from its ends and crossings
    if (near && near.d < -Math.min(hw, near.half) * .5) return { ok: false, reason: 'roadOverlap', ...base };
  }
  return { ok: true, ...base, crossings: cross };
}

/** Rules every road curve must follow: on the map, clear of buildings, and terrain rules. null or { reason, blocker? }. */
export function checkCurve(state, polyline, width) {
  const hw = width / 2, h = mapHalf(state);
  if (polyline.some(p => Math.abs(p.x) > h - hw + 1e-9 || Math.abs(p.z) > h - hw + 1e-9)) return { reason: 'outside' };
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of polyline) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
  for (const id of queryArea(state, { minX: minX - hw, maxX: maxX + hw, minZ: minZ - hw, maxZ: maxZ + hw })) {
    const b = state.buildings[id]; if (!b || isRoadType(b.type)) continue; const o = obbOf(b);
    for (let i = 1; i < polyline.length; i++) if (segmentObbDistance(o, polyline[i - 1], polyline[i]) < hw - 1e-6) return { reason: 'blocked', blocker: id };
  }
  if (planHooks.terrain) { const why = planHooks.terrain(state, polyline, width); if (why) return { reason: why }; }
  return null;
}
/** Extension point for terrain rules (slopes, water), set by the terrain module. */
export const planHooks = { terrain: null };

/** Builds a planned road (from planRoad on the same state). Returns { nodeIds, segmentIds } created. */
export function applyRoad(state, plan) {
  const nodeIds = [], segmentIds = [];
  const before = new Set(Object.keys(roadsOf(state).nodes).map(Number));
  // splitting the crossed segments first: arc lengths along them stay valid because each crossed segment is split once
  // per crossing, latest first (the split keeps the first half's geometry)
  const byOld = new Map(); for (const c of plan.crossings) { if (!byOld.has(c.segmentId)) byOld.set(c.segmentId, []); byOld.get(c.segmentId).push(c); }
  const endNode = end => {
    if (end.kind === 'node') return end.nodeId;
    if (end.kind === 'split') return splitSegment(state, end.segmentId, end.s);
    return addNode(state, end.position).id;
  };
  const crossNodes = [];
  for (const [segId, list] of byOld) {
    let current = segId;
    for (const c of [...list].sort((a, b) => b.sOld - a.sOld)) {
      if (!roadsOf(state).segments[current]) break;
      const nodeId = splitSegment(state, current, c.sOld);
      crossNodes.push({ sNew: c.sNew, nodeId });
      current = Object.values(roadsOf(state).segments).find(s => s.endNodeId === nodeId)?.id ?? current;
    }
  }
  // ends may lie on a segment that a crossing just split: snap again on the updated network
  const startId = endNode(plan.start.kind === 'split' ? snapRoadEnd(state, plan.start.position) : plan.start);
  const endId = endNode(plan.end.kind === 'split' ? snapRoadEnd(state, plan.end.position) : plan.end);
  // the new road, cut at its crossings; control points go to the piece they lie on
  const stops = [{ s: 0, nodeId: startId }, ...crossNodes.sort((a, b) => a.sNew - b.sNew).map(c => ({ s: c.sNew, nodeId: c.nodeId })), { s: plan.length, nodeId: endId }];
  const cps = plan.controlPoints.map(p => ({ p, s: closestOnPolyline(plan.polyline, p.x, p.z).s }));
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i]; if (a.nodeId === b.nodeId) continue;
    const paid = Math.round((plan.paid ?? plan.cost) * (b.s - a.s) / plan.length * 100) / 100;
    const seg = addSegment(state, a.nodeId, b.nodeId, { width: plan.width, style: plan.style, paid, controlPoints: cps.filter(c => c.s > a.s + .2 && c.s < b.s - .2).map(c => c.p) });
    segmentIds.push(seg.id);
  }
  for (const id of Object.keys(roadsOf(state).nodes).map(Number)) if (!before.has(id)) nodeIds.push(id);
  return { nodeIds, segmentIds };
}

/** Segment (or lone node) under a ground point, for demolition and editing: { segmentId } | { nodeId } | null. */
export function roadPieceAt(state, x, z) {
  const p = nearestRoadPoint(state, x, z, 0); if (!p || p.d > 1e-9) return null;
  if (p.segmentId) return { segmentId: p.segmentId };
  const segs = listSegments(state).filter(s => s.startNodeId === p.nodeId || s.endNodeId === p.nodeId);
  if (!segs.length) return { nodeId: p.nodeId };
  // a junction pad: the segment whose centre line is nearest
  let best = null; for (const s of segs) { const pl = segmentPolyline(state, s), d = closestOnPolyline(pl, x, z).d; if (!best || d < best.d) best = { segmentId: s.id, d }; }
  return { segmentId: best.segmentId };
}
