// Small builders shared by the tests. They only use the public core/application modules.
import { createEmptyState, insertBuilding, computeDerived, CMD, GOALS } from '../src/core/index.js';
import { createGame } from '../src/application/game.js';

export const ALL_GOALS = GOALS.map(g => g.id);

/** A state with the given buildings ([type, x, y, r?, seed?]) and generous defaults. */
export function makeState(buildings = [], over = {}) {
  const s = createEmptyState({ coins: 10000, population: 0, employed: 0, demand: { r: 0, c: 0, i: 0 }, rngSeed: 42, ...over });
  for (const [type, x, y, r = 0, seed = 0] of buildings) insertBuilding(s, type, x, y, r, seed);
  return s;
}
/** Café at (10,11) with a road along y = 13 from x0 to x1: the usual "town centre". */
export function centre(x0 = 6, x1 = 17) { const l = [['cafe', 10, 11]]; for (let x = x0; x <= x1; x++) l.push(['road', x, 13]); return l; }
export const at = (state, x, y) => Object.values(state.buildings).find(b => x >= b.x && y >= b.y && x < b.x + (b.type === 'road' ? 1 : sizeOf(b)) && y < b.y + (b.type === 'road' ? 1 : sizeOf(b)));
import { DEFS } from '../src/core/config/catalog.js';
const sizeOf = b => DEFS[b.type].s;
export const derive = s => computeDerived(s);
export const place = (game, buildingType, x, y, extra = {}) => game.dispatch({ type: CMD.Place, buildingType, x, y, autoFace: false, r: 0, ...extra });
export { createGame, CMD };
