// Game state: one plain, JSON-friendly object. No engine objects, no DOM, no timers.
//
// Persistent fields are written to saves (core/persistence). Building `well` and `open` are
// "simulation memory": lagged values the next tick depends on (housing preference, whether a
// shop kept its doors open). Everything else the UI shows is derived (core/simulation).
import { DEFS, LANDMARK } from '../config/catalog.js';
import { GRID_SIZE, NEW_GAME } from '../config/world.js';
import { MODES } from '../config/rules.js';

export function createEmptyState(overrides = {}) {
  return {
    mode: 'normal',                      // 'normal' | 'sandbox' — selects the rules (config/rules.js)
    coins: 0, population: 0, employed: 0, demand: { r: 0, c: 0, i: 0 },
    clock: { time: .3, day: 1, speed: 1, paused: false },
    goalsDone: [], nextId: 1, rngSeed: 1,
    tutorial: { step: 'done', signals: [] }, // core/tutorial: current step id and front-end signals seen
    buildings: {},                       // id -> building record
    grid: new Array(GRID_SIZE * GRID_SIZE).fill(0), // tile -> building id (0 = empty), derived from buildings
    ...overrides,
  };
}

export function createBuilding(id, type, x, y, r, seed) {
  if (!DEFS[type]) throw new Error(`unknown building type: ${type}`);
  return { id, type, x, y, r, seed, well: 50, open: true };
}

/** Buildings in ascending id order. Every system iterates in this order, which keeps results deterministic. */
export function listBuildings(state) { return Object.values(state.buildings).sort((a, b) => a.id - b.id); }
export const kindOf = b => DEFS[b.type].kind;
export const defOf = b => DEFS[b.type];
export const findLandmark = state => listBuildings(state).find(b => b.type === LANDMARK) || null;

/** A new, completely empty game in the given mode. Nothing is pre-placed; the café comes first. */
export function createNewGameState(mode = 'normal', firstStep = 'explore') {
  if (!MODES.includes(mode)) throw new Error(`unknown mode ${mode}`);
  return createEmptyState({ mode, coins: NEW_GAME.coins, population: NEW_GAME.population, employed: NEW_GAME.employed, demand: { ...NEW_GAME.demand },
    clock: { time: NEW_GAME.time, day: 1, speed: NEW_GAME.speed, paused: false }, rngSeed: NEW_GAME.rngSeed,
    tutorial: { step: mode === 'normal' ? firstStep : 'done', signals: [] } });
}
