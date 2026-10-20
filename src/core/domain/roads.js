// The road network as a graph. Plain, serializable data inside the state:
//
//   state.roads = {
//     nodes:    { [id]: { id, position: { x, z }, width?, style? } },   // width/style: the pad of a node with no segments
//     segments: { [id]: { id, startNodeId, endNodeId, controlPoints: [{ x, z }], width, style, oneWay } },
//     nextNodeId, nextSegmentId,
//   }
//
// A segment's centre line passes through its start node, its control points and its end node as a centripetal
// Catmull-Rom curve. Geometry derived from it (sampled polylines, bounds, a spatial index) is cached per revision of
// the roads object and never saved. Nothing here knows about buildings; placement rules live in roadPlan.js.
import { DEFS, isRoadType } from '../config/catalog.js';
import { pointSegment, segmentObbDistance, pointObbDistance, obbAabb, makeObb, obbOverlap } from './geometry.js';

export const ROAD_STEP = .2;          // sampling step of a curve, in world units
export const SNAP_RADIUS = .55;       // a road end this close to a node or a road joins it

export const createRoads = () => ({ nodes: {}, segments: {}, nextNodeId: 1, nextSegmentId: 1 });
export const roadsOf = state => state.roads || (state.roads = createRoads());
/** Marks the network as changed (drops cached geometry). Every mutation below calls it. */
export function touchRoads(state) { const r = roadsOf(state); geoCache.delete(r); return r; }

export const listSegments = state => Object.values(roadsOf(state).segments).sort((a, b) => a.id - b.id);
export const listNodes = state => Object.values(roadsOf(state).nodes).sort((a, b) => a.id - b.id);
export const nodeOf = (state, id) => roadsOf(state).nodes[id];
/** Segments that end at a node. */
export const segmentsAt = (state, nodeId) => listSegments(state).filter(s => s.startNodeId === nodeId || s.endNodeId === nodeId);

// ---------------------------------------------------------------- curves
/** Centripetal Catmull-Rom through `pts` ([{x, z}]), sampled about every `step`. Two points give a straight line. */
export function curvePoints(pts, step = ROAD_STEP) {
  if (pts.length < 2) return pts.map(p => ({ x: p.x, z: p.z }));
  if (pts.length === 2) {
    const [a, b] = pts, n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step)), out = [];
    for (let i = 0; i <= n; i++) out.push({ x: a.x + (b.x - a.x) * i / n, z: a.z + (b.z - a.z) * i / n });
    return out;
  }
  const P = [{ x: 2 * pts[0].x - pts[1].x, z: 2 * pts[0].z - pts[1].z }, ...pts, { x: 2 * pts.at(-1).x - pts.at(-2).x, z: 2 * pts.at(-1).z - pts.at(-2).z }];
  const out = [{ x: pts[0].x, z: pts[0].z }];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const kt = (a, b) => Math.max(1e-6, Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)));
    const t0 = 0, t1 = t0 + kt(p0, p1), t2 = t1 + kt(p1, p2), t3 = t2 + kt(p2, p3);
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / step));
    for (let j = 1; j <= n; j++) {
      const t = t1 + (t2 - t1) * j / n, L = (a, b, ta, tb) => ({ x: (tb - t) / (tb - ta) * a.x + (t - ta) / (tb - ta) * b.x, z: (tb - t) / (tb - ta) * a.z + (t - ta) / (tb - ta) * b.z });
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3), B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      out.push(j === n ? { x: p2.x, z: p2.z } : L(B1, B2, t1, t2));
    }
  }
  return out;
}
export const polylineLength = pl => { let s = 0; for (let i = 1; i < pl.length; i++) s += Math.hypot(pl[i].x - pl[i - 1].x, pl[i].z - pl[i - 1].z); return s; };
/** Closest point of a polyline to (x, z): distance, point, unit tangent and arc length `s` from the start. */
export function closestOnPolyline(pl, x, z) {
  let best = null, acc = 0;
  for (let i = 1; i < pl.length; i++) {
    const a = pl[i - 1], b = pl[i], len = Math.hypot(b.x - a.x, b.z - a.z), r = pointSegment(x, z, a.x, a.z, b.x, b.z);
    if (!best || r.d < best.d) best = { d: r.d, x: a.x + (b.x - a.x) * r.t, z: a.z + (b.z - a.z) * r.t, tx: len ? (b.x - a.x) / len : 1, tz: len ? (b.z - a.z) / len : 0, s: acc + len * r.t, i };
    acc += len;
  }
  return best || (pl.length ? { d: Math.hypot(x - pl[0].x, z - pl[0].z), x: pl[0].x, z: pl[0].z, tx: 1, tz: 0, s: 0, i: 0 } : null);
}
/** Point and tangent at arc length s along a polyline. */
export function pointAt(pl, s) {
  let acc = 0;
  for (let i = 1; i < pl.length; i++) {
    const a = pl[i - 1], b = pl[i], len = Math.hypot(b.x - a.x, b.z - a.z);
    if (acc + len >= s || i === pl.length - 1) { const k = len ? Math.max(0, Math.min(1, (s - acc) / len)) : 0; return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, tx: len ? (b.x - a.x) / len : 1, tz: len ? (b.z - a.z) / len : 0 }; }
    acc += len;
  }
  return pl[0] ? { x: pl[0].x, z: pl[0].z, tx: 1, tz: 0 } : null;
}

/** Control polygon of a segment: start node, control points, end node. */
export function segmentControl(state, seg) { const r = roadsOf(state); return [r.nodes[seg.startNodeId].position, ...seg.controlPoints, r.nodes[seg.endNodeId].position]; }

// ---------------------------------------------------------------- cached geometry and index (derived, per revision)
const geoCache = new WeakMap();
const CELL = 2;
function geometry(state) {
  const r = roadsOf(state); let g = geoCache.get(r);
  if (g) return g;
  g = { lines: new Map(), boxes: new Map(), cells: new Map() };
  const addBox = (key, box) => { g.boxes.set(key, box); for (let i = Math.floor(box.minX / CELL); i <= Math.floor(box.maxX / CELL); i++) for (let j = Math.floor(box.minZ / CELL); j <= Math.floor(box.maxZ / CELL); j++) { const k = i + ',' + j; if (!g.cells.has(k)) g.cells.set(k, []); g.cells.get(k).push(key); } };
  for (const seg of Object.values(r.segments)) {
    const pl = curvePoints(segmentControl(state, seg)); g.lines.set(seg.id, pl);
    const hw = seg.width / 2; let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pl) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    addBox('s' + seg.id, { minX: minX - hw, maxX: maxX + hw, minZ: minZ - hw, maxZ: maxZ + hw });
  }
  for (const n of Object.values(r.nodes)) { const rad = nodeRadius(state, n.id); addBox('n' + n.id, { minX: n.position.x - rad, maxX: n.position.x + rad, minZ: n.position.z - rad, maxZ: n.position.z + rad }); }
  geoCache.set(r, g); return g;
}
/** Sampled centre line of a segment (cached). */
export const segmentPolyline = (state, seg) => geometry(state).lines.get(seg.id) || curvePoints(segmentControl(state, seg));
export const segmentLength = (state, seg) => polylineLength(segmentPolyline(state, seg));
/** A junction of drawn roads is paved a little wider than its widest road, so corners have room for curbs. */
export const JUNCTION_SCALE = 1.3;
/**
 * Radius of the paved pad around a node: half the widest road meeting there (times JUNCTION_SCALE where two or more
 * drawn roads form a junction), or the node's own width when alone. Grid road cells (nodes with a width) keep exactly half a cell.
 */
export function nodeRadius(state, nodeId) {
  const r = roadsOf(state), n = r.nodes[nodeId], at = [];
  for (const s of Object.values(r.segments)) if (s.startNodeId === nodeId || s.endNodeId === nodeId) at.push(s);
  const w = Math.max(0, ...at.map(s => s.width));
  // a junction: three or more roads, or two that differ (a plain bend of one street has no pad of its own)
  const junction = at.length >= 3 || (at.length === 2 && (at[0].style !== at[1].style || at[0].width !== at[1].width));
  return (w || n?.width || 1) / 2 * (!n?.width && junction ? JUNCTION_SCALE : 1);
}
/** Road pieces ('s<id>' segments, 'n<id>' nodes) whose bounds meet an axis-aligned area. Sorted. */
export function roadPiecesIn(state, area) {
  const g = geometry(state), out = new Set();
  for (let i = Math.floor(area.minX / CELL); i <= Math.floor(area.maxX / CELL); i++) for (let j = Math.floor(area.minZ / CELL); j <= Math.floor(area.maxZ / CELL); j++)
    for (const key of g.cells.get(i + ',' + j) || []) { const b = g.boxes.get(key); if (b.maxX >= area.minX && b.minX <= area.maxX && b.maxZ >= area.minZ && b.minZ <= area.maxZ) out.add(key); }
  return [...out].sort();
}

/**
 * Nearest road centre point to (x, z) within `maxDist` of the road's edge:
 * { x, z, nx, nz, half, d, segmentId?, nodeId?, s?, tx?, tz? } — (nx, nz) points from the road toward the query point.
 */
export function nearestRoadPoint(state, x, z, maxDist = 1) {
  const r = roadsOf(state); let best = null;
  for (const key of roadPiecesIn(state, { minX: x - maxDist - 1, maxX: x + maxDist + 1, minZ: z - maxDist - 1, maxZ: z + maxDist + 1 })) {
    const id = +key.slice(1);
    if (key[0] === 's') {
      const seg = r.segments[id], c = closestOnPolyline(segmentPolyline(state, seg), x, z), d = c.d - seg.width / 2;
      if (d <= maxDist && (!best || d < best.d)) { const L = Math.hypot(x - c.x, z - c.z); best = { x: c.x, z: c.z, nx: L > 1e-9 ? (x - c.x) / L : -c.tz, nz: L > 1e-9 ? (z - c.z) / L : c.tx, half: seg.width / 2, d, segmentId: id, s: c.s, tx: c.tx, tz: c.tz }; }
    } else if (r.nodes[id].width) {
      // a grid road cell is a square pad: distance to the square, normal from its nearest side
      const n = r.nodes[id], h = n.width / 2, dx = x - n.position.x, dz = z - n.position.z, ox = Math.abs(dx) - h, oz = Math.abs(dz) - h;
      const d = ox > 0 || oz > 0 ? Math.hypot(Math.max(ox, 0), Math.max(oz, 0)) : Math.max(ox, oz), alongX = ox >= oz;
      const nx = alongX ? Math.sign(dx || 1) : 0, nz = alongX ? 0 : Math.sign(dz || 1);
      const ex = alongX ? n.position.x + nx * h : n.position.x + Math.max(-h, Math.min(h, dx)), ez = alongX ? n.position.z + Math.max(-h, Math.min(h, dz)) : n.position.z + nz * h;
      if (d <= maxDist && (!best || d < best.d - 1e-9)) best = { x: ex, z: ez, nx, nz, half: 0, d, nodeId: id };
    } else {
      const n = r.nodes[id], rad = nodeRadius(state, id), L = Math.hypot(x - n.position.x, z - n.position.z), d = L - rad;
      if (d <= maxDist && (!best || d < best.d - 1e-9)) best = { x: n.position.x, z: n.position.z, nx: L > 1e-9 ? (x - n.position.x) / L : 1, nz: L > 1e-9 ? (z - n.position.z) / L : 0, half: rad, d, nodeId: id };
    }
  }
  return best;
}
/** Is the ground point on a road surface? */
export function onRoad(state, x, z) { const p = nearestRoadPoint(state, x, z, 0); return !!p && p.d <= 1e-9; }

/** Does any road surface overlap an oriented box (more than touching)? Grid road cells are square pads. */
export function roadHitsObb(state, o, eps = 1e-6) {
  const r = roadsOf(state);
  for (const key of roadPiecesIn(state, obbAabb(o))) {
    const id = +key.slice(1);
    if (key[0] === 's') {
      const seg = r.segments[id], pl = segmentPolyline(state, seg), hw = seg.width / 2;
      for (let i = 1; i < pl.length; i++) if (segmentObbDistance(o, pl[i - 1], pl[i]) < hw - eps) return true;
    } else {
      const n = r.nodes[id];
      if (n.width) { if (obbOverlap(o, makeObb(n.position.x, n.position.z, n.width, n.width, 0), eps)) return true; }
      else if (pointObbDistance(o, n.position.x, n.position.z) < nodeRadius(state, id) - eps) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- mutations (validated by callers)
export function addNode(state, position, extra = {}) {
  const r = touchRoads(state), id = r.nextNodeId++;
  r.nodes[id] = { id, position: { x: position.x, z: position.z }, ...extra }; return r.nodes[id];
}
/** paid: coins spent on this segment (half comes back when it is demolished). */
export function addSegment(state, startNodeId, endNodeId, { controlPoints = [], width, style, oneWay = false, paid = 0 } = {}) {
  const r = touchRoads(state), id = r.nextSegmentId++;
  r.segments[id] = { id, startNodeId, endNodeId, controlPoints: controlPoints.map(p => ({ x: p.x, z: p.z })), width, style, oneWay, paid }; return r.segments[id];
}
/** Removes a segment and any end node left with no road (unless `keepNodes`). Returns the removed node ids. */
export function removeSegment(state, id, { keepNodes = false } = {}) {
  const r = touchRoads(state), seg = r.segments[id]; if (!seg) return [];
  delete r.segments[id];
  const gone = [];
  if (!keepNodes) for (const n of [seg.startNodeId, seg.endNodeId]) if (r.nodes[n] && !Object.values(r.segments).some(s => s.startNodeId === n || s.endNodeId === n) && !r.nodes[n].width) { delete r.nodes[n]; gone.push(n); }
  return gone;
}
/**
 * Splits a segment at arc length `s` (or reuses an end node when s is within `tol` of an end). The two halves keep
 * the segment's width and style; control points go to the half they lie on. Returns the node id at the split.
 */
export function splitSegment(state, id, s, tol = .05) {
  const r = roadsOf(state), seg = r.segments[id], pl = segmentPolyline(state, seg), len = polylineLength(pl);
  if (s <= tol) return seg.startNodeId; if (s >= len - tol) return seg.endNodeId;
  const p = pointAt(pl, s), before = [], after = [];
  for (const cp of seg.controlPoints) (closestOnPolyline(pl, cp.x, cp.z).s < s ? before : after).push(cp);
  const node = addNode(state, p);
  const props = { width: seg.width, style: seg.style, oneWay: seg.oneWay }, k = s / len;
  removeSegment(state, id, { keepNodes: true });
  addSegment(state, seg.startNodeId, node.id, { ...props, controlPoints: before, paid: Math.round(seg.paid * k * 100) / 100 });
  addSegment(state, node.id, seg.endNodeId, { ...props, controlPoints: after, paid: Math.round(seg.paid * (1 - k) * 100) / 100 });
  return node.id;
}

// ---------------------------------------------------------------- tile roads (the grid street tool and old saves)
const key = p => Math.round(p.x * 1000) + ',' + Math.round(p.z * 1000);
/** The node standing exactly at a position, if any. */
export function nodeAtPoint(state, p, tol = 1e-6) { for (const n of Object.values(roadsOf(state).nodes)) if (Math.abs(n.position.x - p.x) <= tol && Math.abs(n.position.z - p.z) <= tol) return n; return null; }
/**
 * A road cell of the grid tool at cell centre `c`: a node (remembering its style and width for a lone pad) joined by
 * straight segments to road nodes on the four neighbouring cell centres. Returns { node, segments }.
 */
export function addTileRoad(state, style, width, c, paid = 0) {
  const node = addNode(state, c, { style, width, paid }), segments = [];
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const n = nodeAtPoint(state, { x: c.x + dx, z: c.z + dz }); if (!n) continue;
    segments.push(addSegment(state, Math.min(n.id, node.id), Math.max(n.id, node.id), { width: Math.min(width, n.width || width), style }));
  }
  return { node, segments };
}
/** Converts grid road cells ([{ style, width, position }], in creation order) into nodes and segments, like the grid tool would. */
export function tilesToGraph(state, cells) { for (const c of cells) addTileRoad(state, c.style, c.width, c.position, c.paid || 0); return state; }
export { key as positionKey };

// ---------------------------------------------------------------- plain data in and out (saves, undo)
export function serializeRoads(state) {
  const r = state.roads || createRoads();
  return {
    nodes: listNodes(state).map(n => ({ id: n.id, position: { x: n.position.x, z: n.position.z }, ...(n.width ? { width: n.width, style: n.style } : {}), ...(n.paid ? { paid: n.paid } : {}) })),
    segments: listSegments(state).map(s => ({ id: s.id, startNodeId: s.startNodeId, endNodeId: s.endNodeId, controlPoints: s.controlPoints.map(p => ({ x: p.x, z: p.z })), width: s.width, style: s.style, oneWay: !!s.oneWay, paid: s.paid || 0 })),
    nextNodeId: r.nextNodeId, nextSegmentId: r.nextSegmentId,
  };
}
/** Validates an untrusted road network: drops bad nodes and segments (and segments whose ends are gone). */
export function normalizeRoads(raw, warn = () => {}) {
  const roads = createRoads(), r = raw && typeof raw === 'object' ? raw : {};
  const finite = p => p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.z) && Math.abs(p.x) < 1e4 && Math.abs(p.z) < 1e4;
  for (const n of Array.isArray(r.nodes) ? r.nodes : []) {
    if (!n || !Number.isInteger(n.id) || n.id < 1 || roads.nodes[n.id] || !finite(n.position)) { warn('road node dropped'); continue; }
    const node = { id: n.id, position: { x: n.position.x, z: n.position.z } };
    if (n.width !== undefined) { if (Number.isFinite(n.width) && n.width > 0 && n.width <= 3 && isRoadType(n.style)) { node.width = n.width; node.style = n.style; } else warn(`road node ${n.id}: bad pad`); }
    if (Number.isFinite(n.paid) && n.paid > 0) node.paid = n.paid;
    roads.nodes[n.id] = node;
  }
  for (const s of Array.isArray(r.segments) ? r.segments : []) {
    if (!s || !Number.isInteger(s.id) || s.id < 1 || roads.segments[s.id] || !roads.nodes[s.startNodeId] || !roads.nodes[s.endNodeId] || s.startNodeId === s.endNodeId) { warn('road segment dropped'); continue; }
    const style = isRoadType(s.style) ? s.style : (warn(`road segment ${s.id}: style reset`), 'road');
    const cps = (Array.isArray(s.controlPoints) ? s.controlPoints : []).filter(finite).slice(0, 16).map(p => ({ x: p.x, z: p.z }));
    roads.segments[s.id] = { id: s.id, startNodeId: s.startNodeId, endNodeId: s.endNodeId, controlPoints: cps,
      width: Number.isFinite(s.width) && s.width >= .2 && s.width <= 3 ? s.width : DEFS[style].road.width, style, oneWay: s.oneWay === true, paid: Number.isFinite(s.paid) && s.paid >= 0 ? s.paid : 0 };
  }
  const maxN = Math.max(0, ...Object.keys(roads.nodes).map(Number)), maxS = Math.max(0, ...Object.keys(roads.segments).map(Number));
  roads.nextNodeId = Math.max((Number.isInteger(r.nextNodeId) && r.nextNodeId > 0 ? r.nextNodeId : 1), maxN + 1); roads.nextSegmentId = Math.max((Number.isInteger(r.nextSegmentId) && r.nextSegmentId > 0 ? r.nextSegmentId : 1), maxS + 1);
  return roads;
}

