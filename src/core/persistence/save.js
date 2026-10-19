// Save documents: plain JSON, versioned, migrated step by step, validated before use.
//   v1 — Strawberry Borough: flat object, buildings as [type, x, y, r, seed] tuples.
//   v2 — Villa Limón: flat object mixing game and UI preferences; buildings {id, t, x, y, r, s}.
//   v3 — { v, game, ui }: `game` is everything the rules need, `ui` is presentation prefs kept opaque here.
import { DEFS, LANDMARK } from '../config/catalog.js';
import { GOALS } from '../config/goals.js';
import { GRID_SIZE, SPEEDS } from '../config/world.js';
import { canPlace, insertBuilding } from '../domain/grid.js';
import { createEmptyState, listBuildings } from '../domain/state.js';
import { clamp } from '../util/math.js';
export const SAVE_VERSION = 3;
// v1 (Strawberry Borough) building ids → current ids
export const LEGACY_TYPES = Object.freeze({ houseA: 'fr_trad', houseB: 'fr_trad', houseC: 'fr_cont' });
const LANDMARK_SPOTS = [[10, 11], [2, 2], [20, 2]];
const UI_KEYS_V2 = ['newT', 'muted', 'tips', 'tut', 'tab', 'filt', 'lang', 'cam'];

export function serializeGame(state) {
  return {
    coins: state.coins, population: state.population, employed: state.employed, demand: { ...state.demand },
    clock: { time: state.clock.time, day: state.clock.day, speed: state.clock.speed }, goalsDone: [...state.goalsDone],
    nextId: state.nextId, rngSeed: state.rngSeed,
    buildings: listBuildings(state).map(b => ({ id: b.id, type: b.type, x: b.x, y: b.y, r: b.r, seed: b.seed, well: b.well, open: b.open })),
  };
}
export const createSaveDocument = (state, ui = {}) => ({ v: SAVE_VERSION, game: serializeGame(state), ui });

// ---------------------------------------------------------------- migrations: each takes version n and returns n+1
const MIGRATIONS = {
  1: d => {
    if (!Array.isArray(d.b)) throw new Error('v1 save without buildings');
    let id = 1;
    return { v: 2, coins: +d.coins || 0, P: +d.pop || 0, E: 0, dem: { r: 20, c: 0, i: 10 }, time: d.time ?? .3, day: d.day || 1, speed: d.speed || 1,
      done: (Array.isArray(d.done) ? d.done : []).filter(g => ['g1', 'g2', 'g3'].includes(g)), // later v1 goals meant something else
      newT: [], muted: !!d.muted, tips: d.tips !== false, tut: d.tut, tab: 'homes', lang: d.lang, cam: d.cam,
      b: d.b.filter(Array.isArray).map(([t, x, y, r, s]) => ({ id: id++, t: LEGACY_TYPES[t] || t, x, y, r, s })), nextId: d.b.length + 1 };
  },
  2: d => {
    if (!Array.isArray(d.b)) throw new Error('v2 save without buildings');
    const ui = {}; for (const k of UI_KEYS_V2) if (d[k] !== undefined) ui[k] = d[k];
    return { v: 3, ui, game: { coins: d.coins, population: d.P, employed: d.E, demand: d.dem, clock: { time: d.time, day: d.day, speed: d.speed },
      goalsDone: d.done, nextId: d.nextId, buildings: d.b.filter(o => o && typeof o === 'object').map(o => ({ id: o.id, type: o.t, x: o.x, y: o.y, r: o.r, seed: o.s })) } };
  },
};

/** Brings any known save document to the current version. Throws on unknown or malformed documents. */
export function migrateSave(doc) {
  if (!doc || typeof doc !== 'object' || !Number.isInteger(doc.v)) throw new Error('not a save document');
  if (doc.v > SAVE_VERSION) throw new Error(`save version ${doc.v} is newer than ${SAVE_VERSION}`);
  const from = doc.v; let d = doc;
  while (d.v < SAVE_VERSION) { const m = MIGRATIONS[d.v]; if (!m) throw new Error(`no migration from v${d.v}`); d = m(d); }
  if (!d.game || typeof d.game !== 'object') throw new Error('save without game data');
  return { doc: d, from };
}

// ---------------------------------------------------------------- validation: never trust a save
const num = (v, def, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : def);
const int = (v, def, lo = -Infinity, hi = Infinity) => (Number.isInteger(v) ? clamp(v, lo, hi) : def);

/** Builds a valid state from an untrusted `game` object. Invalid entries are dropped or normalised, with a warning each. */
export function normalizeGame(game) {
  const warnings = [], warn = m => warnings.push(m);
  const g = game && typeof game === 'object' ? game : {};
  const clock = g.clock && typeof g.clock === 'object' ? g.clock : {};
  const dem = g.demand && typeof g.demand === 'object' ? g.demand : {};
  const state = createEmptyState({
    coins: num(g.coins, 0, 0), population: num(g.population, 0, 0, 10000), employed: num(g.employed, 0, 0, 10000),
    demand: { r: num(dem.r, 0, -100, 100), c: num(dem.c, 0, -100, 100), i: num(dem.i, 0, -100, 100) },
    clock: { time: num(clock.time, .3, 0, .999999), day: int(clock.day, 1, 1), speed: SPEEDS.includes(clock.speed) ? clock.speed : 1, paused: false },
    goalsDone: [...new Set((Array.isArray(g.goalsDone) ? g.goalsDone : []).filter(id => GOALS.some(x => x.id === id)))],
    rngSeed: int(g.rngSeed, 0x5eed1e, 0, 0xffffffff),
  });
  const list = Array.isArray(g.buildings) ? g.buildings : (warn('buildings missing'), []);
  const usedIds = new Set(), pending = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') { warn('building entry is not an object'); continue; }
    const type = LEGACY_TYPES[raw.type] || raw.type;
    if (!DEFS[type]) { warn(`unknown building type ${raw.type}`); continue; }
    if (!Number.isInteger(raw.x) || !Number.isInteger(raw.y)) { warn(`${type}: bad coordinates`); continue; }
    const r = Number.isInteger(raw.r) && raw.r >= 0 && raw.r < 4 ? raw.r : (warn(`${type}: rotation ${raw.r} reset to 0`), 0);
    const seed = int(raw.seed, 0, 0, 0xffffffff);
    let id = int(raw.id, 0, 0);
    if (!id || usedIds.has(id)) { if (raw.id !== undefined) warn(`${type}: duplicate or invalid id ${raw.id}`); id = 0; }
    if (id) usedIds.add(id);
    pending.push({ type, x: raw.x, y: raw.y, r, seed, id, well: num(raw.well, 50, 0, 100), open: typeof raw.open === 'boolean' ? raw.open : true });
  }
  state.nextId = Math.max(int(g.nextId, 1, 1), ...[...usedIds].map(i => i + 1), 1);
  for (const p of pending) {
    const why = canPlace(state, p.type, p.x, p.y);
    if (why) { warn(`${p.type} at ${p.x},${p.y}: ${why}`); if (p.id) usedIds.delete(p.id); continue; }
    if (p.type === LANDMARK && Object.values(state.buildings).some(b => b.type === LANDMARK)) { warn('second café dropped'); continue; }
    const b = insertBuilding(state, p.type, p.x, p.y, p.r, p.seed, p.id || state.nextId);
    b.well = p.well; b.open = p.open;
  }
  if (!Object.values(state.buildings).some(b => b.type === LANDMARK)) {
    const spot = LANDMARK_SPOTS.find(([x, y]) => !canPlace(state, LANDMARK, x, y));
    if (spot) { insertBuilding(state, LANDMARK, spot[0], spot[1], 0, 1); warn('café was missing and has been restored'); }
  }
  return { state, warnings };
}

/** Untrusted parsed JSON → { state, ui, from, warnings }. Throws if the document cannot be understood at all. */
export function loadSave(doc) {
  const { doc: d, from } = migrateSave(doc);
  const { state, warnings } = normalizeGame(d.game);
  return { state, ui: d.ui && typeof d.ui === 'object' ? d.ui : {}, from, warnings };
}
