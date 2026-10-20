// Small builders shared by the tests. They only use the public core/application modules.
import { createEmptyState, insertBuilding, computeDerived, CMD, GOALS, tileToPose, poseToTile, buildingAtPoint, mapHalf } from '../src/core/index.js';
import { createGame } from '../src/application/game.js';

export const ALL_GOALS = GOALS.map(g => g.id);

/** A state with the given buildings ([type, x, y, r?, seed?] on grid cells) and generous defaults. */
export function makeState(buildings = [], over = {}) {
  // goalsDone starts with the two starter goals so rewards for them do not blur economy assertions
  const s = createEmptyState({ coins: 10000, population: 0, employed: 0, demand: { r: 0, c: 0, i: 0 }, rngSeed: 42, goalsDone: ['g0', 'g0b'], ...over });
  for (const [type, x, y, r = 0, seed = 0] of buildings) insertBuilding(s, type, tileToPose(s, type, x, y, r), seed);
  return s;
}
/** Café at (10,11) with a road along y = 13 from x0 to x1: the usual "town centre". */
export function centre(x0 = 6, x1 = 17) { const l = [['cafe', 10, 11]]; for (let x = x0; x <= x1; x++) l.push(['road', x, 13]); return l; }
/** The building covering grid cell (x, y), or undefined. */
export const at = (state, x, y) => buildingAtPoint(state, x - mapHalf(state) + .5, y - mapHalf(state) + .5) || undefined;
/** Id of the building on cell (x, y), 0 if none (what state.grid[y * 24 + x] used to say). */
export const idAtCell = (state, x, y) => at(state, x, y)?.id || 0;
/** Grid cell and quarter turn of a building placed on the grid. */
export const cellOf = (state, b) => ({ ...poseToTile(state, b.type, b.position, b.rotation), r: Math.round(b.rotation / (Math.PI / 2)) % 4 });
export const derive = s => computeDerived(s);
export const place = (game, buildingType, x, y, extra = {}) => game.dispatch({ type: CMD.Place, buildingType, x, y, autoFace: false, r: 0, ...extra });
export { createGame, CMD };
