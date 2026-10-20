// Where buildings stand: footprints in world units, lots, a spatial index and the placement rules.
// A building record holds `position { x, z }` (its centre) and `rotation` (radians); see geometry.js for conventions.
// Grid placement is a quantization of the same state (tileToPose); free and grid buildings live side by side.
//
// footprint { width, depth, clearance } — the ground a building covers, in world units (default: its tile size s × s).
//   Two buildings may not overlap once each is grown by half its clearance; touching is allowed.
// lot — the footprint rounded up to whole cells. Neighbourhood effects and service ranges measure lot to lot
//   (lotDistance), which keeps the original tile distances exactly for grid-aligned towns.
import { DEFS, isRoadType } from '../config/catalog.js';
import { GRID_SIZE } from '../config/world.js';
import { createBuilding } from './state.js';
import { makeObb, obbAabb, obbOverlap, obbCorners, normAngle, quarterToAngle, cosSin, lotDistance, pointInObb, QUARTER } from './geometry.js';

export const CELL = 1;                       // one grid cell, in world units
const INDEX_CELL = 2;                        // spatial hash bucket size
const EPS = 1e-6;

/** Side of the square map, in cells. */
export const mapSize = state => state.map?.size || GRID_SIZE;
export const mapHalf = state => mapSize(state) / 2;

export function footprintOf(type) {
  const d = DEFS[type], f = d.footprint;
  return f ? { width: f.width, depth: f.depth, clearance: f.clearance || 0 } : { width: d.s, depth: d.s, clearance: 0 };
}
/** Whole cells a footprint spans along its local width and depth (at least 1). */
export function spanOf(type) { const f = footprintOf(type); return { w: Math.max(1, Math.ceil(f.width + f.clearance - EPS)), d: Math.max(1, Math.ceil(f.depth + f.clearance - EPS)) }; }

/** The collision box of a type at a pose (footprint grown by half its clearance on every side). */
export function obbFor(type, position, rotation) { const f = footprintOf(type); return makeObb(position.x, position.z, f.width + f.clearance, f.depth + f.clearance, rotation); }
export const obbOf = b => obbFor(b.type, b.position, b.rotation);
/** The visual footprint box (without clearance). */
export function footprintObb(type, position, rotation) { const f = footprintOf(type); return makeObb(position.x, position.z, f.width, f.depth, rotation); }
/** Axis-aligned bounds of a building's lot. */
export function lotAabb(b) { const s = spanOf(b.type); return obbAabb(makeObb(b.position.x, b.position.z, s.w, s.d, b.rotation)); }
/** Lot distance between two buildings (0 overlapping, 1 neighbours, n + 1 with n cells between). */
export const rectDist = (a, b) => lotDistance(lotAabb(a), lotAabb(b));

// ---------------------------------------------------------------- grid quantization
/** Pose of a building placed on grid cell (x, y) with quarter rotation r (0..3): the original tile coordinates. */
export function tileToPose(state, type, x, y, r = 0) {
  const rot = quarterToAngle(r), s = spanOf(type), odd = Math.round(rot / QUARTER) % 2 === 1;
  const w = odd ? s.d : s.w, d = odd ? s.w : s.d, h = mapHalf(state);
  return { position: { x: x - h + w / 2, z: y - h + d / 2 }, rotation: rot };
}
/** Grid cell (x, y) of a pose's lot corner, if it sits on the grid. */
export function poseToTile(state, type, position, rotation) {
  const s = spanOf(type), odd = Math.round(normAngle(rotation) / QUARTER) % 2 === 1, w = odd ? s.d : s.w, d = odd ? s.w : s.d, h = mapHalf(state);
  return { x: Math.round(position.x + h - w / 2), y: Math.round(position.z + h - d / 2) };
}
/** Snaps a free pose to the grid: rotation to the nearest quarter turn, centre so the lot covers whole cells. */
export function snapToGrid(state, type, position, rotation) {
  const r = Math.round(normAngle(rotation) / QUARTER) % 4, s = spanOf(type), w = r % 2 ? s.d : s.w, d = r % 2 ? s.w : s.d, h = mapHalf(state);
  const x = Math.round(position.x + h - w / 2), y = Math.round(position.z + h - d / 2);
  return { ...tileToPose(state, type, x, y, r), tile: { x, y, r } };
}

// ---------------------------------------------------------------- spatial index (derived, never saved)
const key = (i, j) => i + ',' + j;
function cellsOfBox(bx) { const out = []; for (let i = Math.floor(bx.minX / INDEX_CELL); i <= Math.floor(bx.maxX / INDEX_CELL); i++) for (let j = Math.floor(bx.minZ / INDEX_CELL); j <= Math.floor(bx.maxZ / INDEX_CELL); j++) out.push(key(i, j)); return out; }
function indexAdd(state, b) { for (const k of cellsOfBox(obbAabb(obbOf(b)))) (state.spatial[k] ||= []).push(b.id); }
function indexRemove(state, b) { for (const k of cellsOfBox(obbAabb(obbOf(b)))) { const l = state.spatial[k]; if (!l) continue; const i = l.indexOf(b.id); if (i >= 0) l.splice(i, 1); if (!l.length) delete state.spatial[k]; } }
/** Rebuilds the spatial index from the buildings (after a load). */
export function reindex(state) { state.spatial = {}; for (const id of Object.keys(state.buildings).map(Number).sort((a, b) => a - b)) indexAdd(state, state.buildings[id]); return state; }
/** Ids of buildings whose boxes may touch an axis-aligned area. Ascending. */
export function queryArea(state, area) {
  if (!state.spatial) reindex(state);
  const ids = new Set(); for (const k of cellsOfBox(area)) for (const id of state.spatial[k] || []) ids.add(id);
  return [...ids].sort((a, b) => a - b);
}

// ---------------------------------------------------------------- placement rules
/** True when every corner of the box lies on the map. */
export function insideMap(state, o) { const h = mapHalf(state); return obbCorners(o).every(c => c.x >= -h - EPS && c.x <= h + EPS && c.z >= -h - EPS && c.z <= h + EPS); }
/** Buildings whose collision box overlaps `o` (ignoring `ignoreId`). */
export function overlapping(state, o, ignoreId = 0) {
  const out = [];
  for (const id of queryArea(state, obbAabb(o))) { if (id === ignoreId) continue; const b = state.buildings[id]; if (b && obbOverlap(o, obbOf(b))) out.push(b); }
  return out;
}
/**
 * null when `type` fits at the pose; otherwise why not: 'outside' (off the map), 'blocked' (overlaps a building),
 * or a terrain reason from `terrainCheck` (set by the terrain module). `ignoreId` is the building being moved.
 */
export function canPlace(state, type, position, rotation, ignoreId = 0) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z) || !Number.isFinite(rotation)) return 'outside';
  const o = obbFor(type, position, rotation);
  if (!insideMap(state, o)) return 'outside';
  if (overlapping(state, o, ignoreId).length) return 'blocked';
  return placementHooks.terrain ? placementHooks.terrain(state, type, o) : null;
}
/** Extension points filled by other core modules (terrain), so this module stays small and free of cycles. */
export const placementHooks = { terrain: null };

/** The building whose footprint contains a ground point (topmost id first), or null. */
export function buildingAtPoint(state, x, z) {
  const ids = queryArea(state, { minX: x, maxX: x, minZ: z, maxZ: z });
  for (let i = ids.length - 1; i >= 0; i--) { const b = state.buildings[ids[i]]; if (b && pointInObb(footprintObb(b.type, b.position, b.rotation), x, z, EPS)) return b; }
  return null;
}
/** Is there a road under this ground point? */
export function roadAt(state, x, z) { const b = buildingAtPoint(state, x, z); return !!b && isRoadType(b.type); }

/**
 * Rotation that turns the front toward the side with most road, among the four quarter turns of `fallback`'s frame.
 * Samples one point per cell along each side, half a cell outside the lot. Keeps `fallback` on ties or with no road.
 */
export function autoFace(state, type, position, fallback = 0) {
  const base = normAngle(fallback) % QUARTER, s = spanOf(type), score = [0, 0, 0, 0], cand = [0, 1, 2, 3].map(k => normAngle(base + k * QUARTER));
  for (let k = 0; k < 4; k++) {
    const a = cand[k], [c, sn] = cosSin(a), fx = sn, fz = c, rx = c, rz = -sn; // front and right directions
    const w = s.w, d = s.d;
    for (let i = 0; i < w; i++) { const t = -w / 2 + .5 + i, px = position.x + fx * (d / 2 + .5) + rx * t, pz = position.z + fz * (d / 2 + .5) + rz * t; if (roadAt(state, px, pz)) score[k]++; }
  }
  const best = Math.max(...score), fb = cand.findIndex(a => Math.abs(a - normAngle(fallback)) < 1e-9);
  if (!best || (fb >= 0 && score[fb] === best)) return normAngle(fallback);
  return cand[score.indexOf(best)];
}

/** Adds a building record at a pose and indexes it. Caller validates with canPlace first. */
export function insertBuilding(state, type, pose, seed, id = state.nextId, tier = 1) {
  const b = createBuilding(id, type, { x: pose.position.x, z: pose.position.z }, normAngle(pose.rotation), seed, tier);
  state.buildings[id] = b; if (id >= state.nextId) state.nextId = id + 1;
  if (!state.spatial) reindex(state); else indexAdd(state, b);
  return b;
}
export function removeBuilding(state, b) { if (state.spatial) indexRemove(state, b); delete state.buildings[b.id]; }
/** Moves / turns a building in place, keeping the index in step. */
export function setPose(state, b, position, rotation) {
  if (state.spatial) indexRemove(state, b);
  b.position = { x: position.x, z: position.z }; b.rotation = normAngle(rotation);
  if (state.spatial) indexAdd(state, b);
}
