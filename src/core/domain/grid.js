// Tiles, footprints and placement rules. All functions are pure except occupy/release/insertBuilding/removeBuilding,
// which only touch the state passed in.
import { DEFS } from '../config/catalog.js';
import { GRID_SIZE } from '../config/world.js';
import { createBuilding } from './state.js';

export const inside = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE;
export const tileIndex = (x, y) => y * GRID_SIZE + x;
export const sizeOf = type => DEFS[type].s;

export function footprint(type, x, y) { const s = sizeOf(type), t = []; for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) t.push([x + i, y + j]); return t; }

/** null when the type fits at (x, y); otherwise 'outside' or 'blocked'. Tiles owned by `ignoreId` count as free (moving). */
export function canPlace(state, type, x, y, ignoreId = 0) {
  for (const [tx, ty] of footprint(type, x, y)) {
    if (!inside(tx, ty)) return 'outside';
    const id = state.grid[tileIndex(tx, ty)];
    if (id && id !== ignoreId) return 'blocked';
  }
  return null;
}
export function occupy(state, b) { for (const [x, y] of footprint(b.type, b.x, b.y)) state.grid[tileIndex(x, y)] = b.id; }
export function release(state, b) { for (const [x, y] of footprint(b.type, b.x, b.y)) if (state.grid[tileIndex(x, y)] === b.id) state.grid[tileIndex(x, y)] = 0; }
export function buildingAt(state, x, y) { if (!inside(x, y)) return null; const id = state.grid[tileIndex(x, y)]; return id ? state.buildings[id] || null : null; }
export const isRoadAt = (state, x, y) => buildingAt(state, x, y)?.type === 'road';

/** Chebyshev tile distance between the nearest tiles of two footprints: 0 overlapping, 1 edge-adjacent. Effect and service radii use it. */
export function rectDist(a, b) {
  const sa = sizeOf(a.type), sb = sizeOf(b.type);
  const dx = Math.max(0, a.x - (b.x + sb - 1), b.x - (a.x + sa - 1)), dy = Math.max(0, a.y - (b.y + sb - 1), b.y - (a.y + sa - 1));
  return Math.max(dx, dy);
}
/** Tiles sharing an edge with the footprint, clipped to the map. */
export function adjacentTiles(b) {
  const s = sizeOf(b.type), o = [];
  for (let i = 0; i < s; i++) o.push([b.x + i, b.y - 1], [b.x + i, b.y + s], [b.x - 1, b.y + i], [b.x + s, b.y + i]);
  return o.filter(([x, y]) => inside(x, y));
}
/** Rotation (0 front +y, 1 +x, 2 -y, 3 -x) that faces the side with most road; keeps `fallback` on ties or no road. */
export function autoFace(state, type, x, y, fallback = 0) {
  const s = sizeOf(type), score = [0, 0, 0, 0];
  for (let i = 0; i < s; i++) { score[0] += isRoadAt(state, x + i, y + s); score[1] += isRoadAt(state, x + s, y + i); score[2] += isRoadAt(state, x + i, y - 1); score[3] += isRoadAt(state, x - 1, y + i); }
  const best = Math.max(...score); if (!best || score[fallback] === best) return fallback; return score.indexOf(best);
}

/** Adds a building record and claims its tiles. Caller validates with canPlace first. */
export function insertBuilding(state, type, x, y, r, seed, id = state.nextId) {
  const b = createBuilding(id, type, x, y, r, seed);
  state.buildings[id] = b; if (id >= state.nextId) state.nextId = id + 1;
  occupy(state, b); return b;
}
export function removeBuilding(state, b) { release(state, b); delete state.buildings[b.id]; }
