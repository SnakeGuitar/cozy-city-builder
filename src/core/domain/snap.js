// Optional snapping for free placement, as pure functions over the state. A front end decides which snaps are on;
// the rules for what "snapped" means live here so every front end (web, Godot) snaps the same way.
//   snapPosition   — round a position to a step (half a cell by default)
//   snapAngle      — round a rotation to a step (15°, 45°, 90° …)
//   snapToRoad     — turn the front toward the nearest road and stand the footprint at its edge
//   snapToBuildings — square up with the nearest building and slide flush against one of its sides
import { isRoadType } from '../config/catalog.js';
import { footprintOf, queryArea, obbOf } from './space.js';
import { normAngle, cosSin, toLocal, QUARTER, pointObbDistance } from './geometry.js';
import { roadQueries } from './roadQuery.js';

const GAP = 1e-4; // leave a hair between snapped neighbours so they never count as overlapping

export const snapPosition = (p, step = .5) => ({ x: Math.round(p.x / step) * step, z: Math.round(p.z / step) * step });
export const snapAngle = (a, step = Math.PI / 12) => normAngle(Math.round(a / step) * step);

/** Nearest road edge to a ground point within `maxDist`, from every registered road representation, or null. */
export function nearestRoad(state, x, z, maxDist = 1.2) {
  let best = null;
  for (const q of roadQueries) { const r = q(state, x, z, maxDist); if (r && (!best || r.d < best.d)) best = r; }
  return best;
}

/**
 * Faces the nearest road and moves the building so its front edge meets the road edge (keeping its place along the road).
 * Returns { position, rotation, road } or null when no road is within `maxDist` of the pose.
 */
export function snapToRoad(state, type, pose, maxDist = 1.2) {
  const f = footprintOf(type), reach = maxDist + f.depth / 2;
  const r = nearestRoad(state, pose.position.x, pose.position.z, reach); if (!r) return null;
  const rotation = normAngle(Math.atan2(-r.nx, -r.nz)), off = r.half + f.depth / 2 + f.clearance / 2 + GAP;
  return { position: { x: r.x + r.nx * off, z: r.z + r.nz * off }, rotation, road: r };
}

/**
 * Squares the building up with the nearest building (rotation to the neighbour's frame, nearest quarter turn) and slides
 * it flush against the neighbour's closest side, centred or edge-aligned when close to that. Null when nothing is near.
 */
export function snapToBuildings(state, type, pose, maxDist = .6, ignoreId = 0) {
  const f = footprintOf(type), me = Math.max(f.width, f.depth) / 2 + maxDist;
  const area = { minX: pose.position.x - me, maxX: pose.position.x + me, minZ: pose.position.z - me, maxZ: pose.position.z + me };
  let best = null;
  for (const id of queryArea(state, area)) {
    if (id === ignoreId) continue; const b = state.buildings[id]; if (!b || isRoadType(b.type)) continue;
    const d = pointObbDistance(obbOf(b), pose.position.x, pose.position.z) - Math.min(f.width, f.depth) / 2;
    if (d <= maxDist && (!best || d < best.d)) best = { b, d };
  }
  if (!best) return null;
  const n = obbOf(best.b);
  // rotation: the neighbour's, plus the quarter turn nearest to what the player asked for
  const rel = Math.round(normAngle(pose.rotation - best.b.rotation) / QUARTER) % 4, rotation = normAngle(best.b.rotation + rel * QUARTER);
  const odd = rel % 2 === 1, sw = (odd ? f.depth : f.width) / 2 + f.clearance / 2, sd = (odd ? f.width : f.depth) / 2 + f.clearance / 2;
  let { lx, lz } = toLocal(n, pose.position.x, pose.position.z);
  const gapX = Math.abs(lx) - (n.hw + sw), gapZ = Math.abs(lz) - (n.hd + sd);
  const align = (v, half, mine) => { for (const c of [0, half - mine, -(half - mine)]) if (Math.abs(v - c) < .25) return c; return v; };
  if (gapX >= gapZ) { lx = Math.sign(lx || 1) * (n.hw + sw + GAP); lz = align(lz, n.hd, sd); }
  else { lz = Math.sign(lz || 1) * (n.hd + sd + GAP); lx = align(lx, n.hw, sw); }
  const [c, s] = cosSin(best.b.rotation); // local → world: x' = lx·c + lz·s, z' = −lx·s + lz·c
  return { position: { x: n.x + lx * c + lz * s, z: n.z - lx * s + lz * c }, rotation, neighbour: best.b.id };
}
