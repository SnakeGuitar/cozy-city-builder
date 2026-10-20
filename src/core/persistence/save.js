// Save documents: plain JSON, versioned, migrated step by step, validated before use.
//   v1 — Strawberry Borough: flat object, buildings as [type, x, y, r, seed] tuples.
//   v2 — Villa Limón: flat object mixing game and UI preferences; buildings {id, t, x, y, r, s}.
//   v3 — { v, game, ui }: `game` is everything the rules need, `ui` is presentation prefs kept opaque here.
//   v4 — { v, mode, game, ui }: explicit mode ('normal' | 'sandbox'), tutorial progress, starter goals g0/g0b.
//   v5 — every building records its tier (1–3); older buildings become tier 1.
//   v6 — continuous coordinates: buildings store position { x, z } (world units, map centred on the origin) and
//        rotation (radians) instead of grid cell x, y and quarter turn r. The migration reproduces each building's
//        drawn position exactly: x = cell x − 12 + s / 2, z = cell y − 12 + s / 2, rotation = r · π/2 (24-cell maps).
//   v7 — roads are a graph (game.roads: nodes, segments with control points, width and style). Road cells that
//        were stored as buildings become nodes at their cell centres joined to their four neighbours, as the grid
//        street tool builds them; each keeps its style, width and price. Building ids do not change.
//   v8 — game.map = { size, seed, generatorVersion, biomePreset, terrain }: generated terrain is stored with the game
//        (heights and cell data), so a map never changes when the generator does. Older towns get the classic
//        meadow: 24 × 24, flat, preset 'classic', terrain null — exactly the ground they were built on.
//   v9 — custom buildings: game.blueprints = [{ id, name, latest, versions: [blueprint …] }] (domain/blueprint.js,
//        each version carries its own `schema`, migrated separately) and game.nextBlueprintId; a building built from
//        a blueprint stores blueprint: { id, version }. Older towns get an empty library; nothing else changes.
//
// Repair policy: saves up to v3 always had a café, so one without it is damaged and the café is restored.
// From v4 an empty map (no café yet) is a normal new game and is never "repaired".
import { DEFS, LANDMARK, maxTierOf, isRoadType } from '../config/catalog.js';
import { GOALS } from '../config/goals.js';
import { SPEEDS } from '../config/world.js';
import { MODES } from '../config/rules.js';
import { TUTORIAL_STEPS } from '../tutorial/tutorial.js';
import { canPlace, insertBuilding, tileToPose, reindex } from '../domain/space.js';
import { normAngle, quarterToAngle } from '../domain/geometry.js';
import { createRoads, tilesToGraph, serializeRoads, normalizeRoads } from '../domain/roads.js';
import { createMap } from '../domain/terrain.js';
import { MAP_PRESETS, MAP_SIZES, GENERATOR_VERSION, CLASSIC_PRESET, BIOME_IDS, MAP_MARGIN } from '../config/biomes.js';
import { createEmptyState, listBuildings } from '../domain/state.js';
import { clamp } from '../util/math.js';
import { normalizeBlueprint, validateBlueprint } from '../domain/blueprint.js';
export const SAVE_VERSION = 9;
const LEGACY_MAP = 24; // every map before v6 was 24 × 24 cells
// v1 (Strawberry Borough) building ids → current ids
export const LEGACY_TYPES = Object.freeze({ houseA: 'fr_trad', houseB: 'fr_trad', houseC: 'fr_cont' });
const LANDMARK_SPOTS = [[10, 11], [2, 2], [20, 2]];
const UI_KEYS_V2 = ['newT', 'muted', 'tips', 'tut', 'tab', 'filt', 'lang', 'cam'];

export function serializeGame(state) {
  return {
    mode: state.mode, tutorial: { step: state.tutorial.step, signals: [...state.tutorial.signals] },
    coins: state.coins, population: state.population, employed: state.employed, demand: { ...state.demand },
    clock: { time: state.clock.time, day: state.clock.day, speed: state.clock.speed }, goalsDone: [...state.goalsDone],
    nextId: state.nextId, rngSeed: state.rngSeed,
    map: serializeMap(state),
    roads: serializeRoads(state),
    blueprints: serializeBlueprints(state), nextBlueprintId: state.nextBlueprintId || 1,
    buildings: listBuildings(state).map(b => ({ id: b.id, type: b.type, tier: b.tier || 1, position: { x: b.position.x, z: b.position.z }, rotation: b.rotation, seed: b.seed, well: b.well, open: b.open,
      ...(b.blueprint ? { blueprint: { id: b.blueprint.id, version: b.blueprint.version } } : {}) })),
  };
}
export { serializeRoads, normalizeRoads };
/** The blueprint library as a list sorted by id number; versions in ascending order. Plain copies. */
export function serializeBlueprints(state) {
  return Object.values(state.blueprints || {}).sort((a, b) => +a.id.slice(2) - +b.id.slice(2))
    .map(e => ({ id: e.id, name: e.name, latest: e.latest, versions: Object.keys(e.versions).map(Number).sort((a, b) => a - b).map(v => JSON.parse(JSON.stringify(e.versions[v]))) }));
}
/**
 * Validates an untrusted library. Each version is migrated, normalised and checked; versions that fail are dropped
 * with a warning (buildings using them fall back to their base type's model and keep working).
 */
export function normalizeBlueprints(raw, warn = () => {}) {
  const lib = {}; let top = 0;
  for (const e of Array.isArray(raw) ? raw : []) {
    if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !/^bp\d{1,9}$/.test(e.id) || lib[e.id]) { warn('blueprint entry without a valid id'); continue; }
    const versions = {};
    for (const v of Array.isArray(e.versions) ? e.versions : []) {
      const bp = normalizeBlueprint(v, m => warn(`${e.id}: ${m}`));
      if (!bp || !Number.isInteger(v.version) || v.version < 1 || versions[v.version]) { warn(`${e.id}: unreadable version dropped`); continue; }
      if (!validateBlueprint(bp).ok) { warn(`${e.id} v${v.version}: invalid design dropped`); continue; }
      versions[v.version] = { ...bp, id: e.id, version: v.version };
    }
    const nums = Object.keys(versions).map(Number); if (!nums.length) { warn(`${e.id}: no usable version, removed`); continue; }
    const latest = Math.max(...nums);
    lib[e.id] = { id: e.id, name: versions[latest].name, latest, versions }; top = Math.max(top, +e.id.slice(2));
  }
  return { blueprints: lib, next: top + 1 };
}
export function serializeMap(state) {
  const m = state.map || createMap(), T = m.terrain;
  return { size: m.size, seed: m.seed, generatorVersion: m.generatorVersion, biomePreset: m.biomePreset,
    terrain: T ? { n: T.n, origin: T.origin, margin: T.margin, waterLevel: T.waterLevel, heights: [...T.heights], cells: { ...T.cells } } : null };
}
/**
 * Validates an untrusted map. Stored terrain is kept when it is well formed; a generated map without terrain is
 * regenerated from its seed when this generator version can; anything else falls back to the classic meadow.
 */
export function normalizeMap(raw, warn = () => {}) {
  const m = raw && typeof raw === 'object' ? raw : null;
  if (!m || m.biomePreset === CLASSIC_PRESET || m.biomePreset === undefined) return createMap();
  if (!MAP_PRESETS.includes(m.biomePreset) || !MAP_SIZES.includes(m.size) || !Number.isInteger(m.seed) || m.seed < 0) { warn('map: unknown preset, size or seed, using the classic meadow'); return createMap(); }
  const T = m.terrain, n = m.size + 2 * MAP_MARGIN + 1, cells = (n - 1) * (n - 1);
  const ok = T && T.n === n && T.origin === -(m.size / 2 + MAP_MARGIN) && Array.isArray(T.heights) && T.heights.length === n * n && T.heights.every(h => Number.isInteger(h) && Math.abs(h) < 1e6)
    && T.cells && ['biome', 'flags', 'moisture', 'temperature', 'waterDist'].every(k => typeof T.cells[k] === 'string' && T.cells[k].length === cells)
    && /^[0-3]*$/.test(T.cells.flags) && [...T.cells.biome].every(c => BIOME_IDS[c.charCodeAt(0) - 97]);
  if (ok) return { size: m.size, seed: m.seed, generatorVersion: Number.isInteger(m.generatorVersion) ? m.generatorVersion : GENERATOR_VERSION, biomePreset: m.biomePreset,
    terrain: { n, origin: T.origin, margin: MAP_MARGIN, waterLevel: Number.isFinite(T.waterLevel) ? T.waterLevel : 0, heights: [...T.heights], cells: { ...T.cells } } };
  if (m.generatorVersion === GENERATOR_VERSION) { warn('map: terrain data damaged, regenerated from its seed'); return { ...createMap({ size: m.size, seed: m.seed, preset: m.biomePreset }) }; }
  warn('map: terrain data unreadable, using the classic meadow'); return createMap();
}
export const createSaveDocument = (state, ui = {}) => ({ v: SAVE_VERSION, mode: state.mode, game: serializeGame(state), ui });

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
  3: d => {
    if (!d.game || typeof d.game !== 'object') throw new Error('v3 save without game data');
    // older towns already passed the starter goals and the tutorial
    const done = Array.isArray(d.game.goalsDone) ? d.game.goalsDone : [];
    return { v: 4, mode: 'normal', ui: d.ui, game: { ...d.game, mode: 'normal', tutorial: { step: 'done', signals: [] }, goalsDone: [...new Set(['g0', 'g0b', ...done])] } };
  },
  4: d => {
    if (!d.game || typeof d.game !== 'object') throw new Error('v4 save without game data');
    const list = Array.isArray(d.game.buildings) ? d.game.buildings : [];
    return { ...d, v: 5, game: { ...d.game, buildings: list.map(b => (b && typeof b === 'object' ? { ...b, tier: 1 } : b)) } };
  },
  8: d => {
    if (!d.game || typeof d.game !== 'object') throw new Error('v8 save without game data');
    return { ...d, v: 9, game: { ...d.game, blueprints: [], nextBlueprintId: 1 } };
  },
  7: d => {
    if (!d.game || typeof d.game !== 'object') throw new Error('v7 save without game data');
    return { ...d, v: 8, game: { ...d.game, map: serializeMap({ map: createMap() }) } }; // the ground every older town stood on
  },
  6: d => {
    if (!d.game || typeof d.game !== 'object') throw new Error('v6 save without game data');
    const list = Array.isArray(d.game.buildings) ? d.game.buildings : [];
    const cells = list.filter(b => b && typeof b === 'object' && isRoadType(LEGACY_TYPES[b.type] || b.type) && b.position).sort((a, b) => (a.id || 0) - (b.id || 0));
    const tmp = { roads: createRoads() };
    // each cell was bought at its street's price
    tilesToGraph(tmp, cells.map(b => ({ style: b.type, width: Math.min(1, DEFS[b.type].road.width), position: b.position, paid: DEFS[b.type].cost })));
    return { ...d, v: 7, game: { ...d.game, buildings: list.filter(b => !cells.includes(b)), roads: serializeRoads(tmp) } };
  },
  5: d => {
    if (!d.game || typeof d.game !== 'object') throw new Error('v5 save without game data');
    const list = Array.isArray(d.game.buildings) ? d.game.buildings : [];
    return { ...d, v: 6, game: { ...d.game, buildings: list.map(b => (b && typeof b === 'object' ? legacyToPose(b) : b)) } };
  },
};

/** A building stored by grid cell (x, y, r) → the same building by world pose. Entries it cannot read pass through for validation. */
function legacyToPose(b) {
  const { x, y, r, ...rest } = b, type = LEGACY_TYPES[b.type] || b.type;
  if (!DEFS[type] || !Number.isInteger(x) || !Number.isInteger(y)) return b;
  const q = Number.isInteger(r) && r >= 0 && r < 4 ? r : 0, s = DEFS[type].s;
  return { ...rest, position: { x: x - LEGACY_MAP / 2 + s / 2, z: y - LEGACY_MAP / 2 + s / 2 }, rotation: Number.isInteger(r) && r >= 0 && r < 4 ? quarterToAngle(q) : undefined };
}

/** Brings any known save document to the current version. Throws on unknown or malformed documents. */
export function migrateSave(doc) {
  if (!doc || typeof doc !== 'object' || !Number.isInteger(doc.v)) throw new Error('not a save document');
  if (doc.v > SAVE_VERSION) throw new Error(`save version ${doc.v} is newer than ${SAVE_VERSION}`);
  const from = doc.v; let d = doc;
  while (d.v < SAVE_VERSION) { const m = MIGRATIONS[d.v]; if (!m) throw new Error(`no migration from v${d.v}`); d = m(d); }
  if (!d.game || typeof d.game !== 'object') throw new Error('save without game data');
  if (!MODES.includes(d.mode) || (d.game.mode !== undefined && d.game.mode !== d.mode)) throw new Error('save has no valid mode');
  return { doc: d, from };
}

// ---------------------------------------------------------------- validation: never trust a save
const num = (v, def, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : def);
const int = (v, def, lo = -Infinity, hi = Infinity) => (Number.isInteger(v) ? clamp(v, lo, hi) : def);

/** Builds a valid state from an untrusted `game` object. Invalid entries are dropped or normalised, with a warning each. */
export function normalizeGame(game, { repairLandmark = false } = {}) {
  const warnings = [], warn = m => warnings.push(m);
  const g = game && typeof game === 'object' ? game : {};
  const clock = g.clock && typeof g.clock === 'object' ? g.clock : {};
  const dem = g.demand && typeof g.demand === 'object' ? g.demand : {};
  const tut = g.tutorial && typeof g.tutorial === 'object' ? g.tutorial : {};
  const state = createEmptyState({
    mode: MODES.includes(g.mode) ? g.mode : 'normal', map: normalizeMap(g.map, warn),
    tutorial: { step: TUTORIAL_STEPS.some(x => x.id === tut.step) ? tut.step : 'done', signals: (Array.isArray(tut.signals) ? tut.signals : []).filter(x => typeof x === 'string' && /^[a-z_]{1,32}$/.test(x)).slice(0, 16) },
    coins: num(g.coins, 0, 0), population: num(g.population, 0, 0, 10000), employed: num(g.employed, 0, 0, 10000),
    demand: { r: num(dem.r, 0, -100, 100), c: num(dem.c, 0, -100, 100), i: num(dem.i, 0, -100, 100) },
    clock: { time: num(clock.time, .3, 0, .999999), day: int(clock.day, 1, 1), speed: SPEEDS.includes(clock.speed) ? clock.speed : 1, paused: false },
    goalsDone: [...new Set((Array.isArray(g.goalsDone) ? g.goalsDone : []).filter(id => GOALS.some(x => x.id === id)))],
    rngSeed: int(g.rngSeed, 0x5eed1e, 0, 0xffffffff),
  });
  const lib = normalizeBlueprints(g.blueprints, warn);
  state.blueprints = lib.blueprints; state.nextBlueprintId = Math.max(lib.next, int(g.nextBlueprintId, 1, 1));
  const list = Array.isArray(g.buildings) ? g.buildings : (warn('buildings missing'), []);
  const usedIds = new Set(), pending = [], strayCells = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') { warn('building entry is not an object'); continue; }
    const type = LEGACY_TYPES[raw.type] || raw.type;
    if (!DEFS[type]) { warn(`unknown building type ${raw.type}`); continue; }
    if (isRoadType(type)) { const src0 = raw.position === undefined && raw.x !== undefined ? legacyToPose({ ...raw, type }) : raw; if (src0.position && Number.isFinite(src0.position.x) && Number.isFinite(src0.position.z)) strayCells.push({ style: type, width: Math.min(1, DEFS[type].road.width), position: { ...src0.position } }); continue; }
    const src = raw.position === undefined && raw.x !== undefined ? legacyToPose({ ...raw, type }) : raw; // defensive: grid fields in a v6 document
    const pos = src.position;
    if (!pos || typeof pos !== 'object' || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) { warn(`${type}: bad coordinates`); continue; }
    const rotation = Number.isFinite(src.rotation) ? normAngle(src.rotation) : (warn(`${type}: rotation ${src.rotation} reset to 0`), 0);
    const seed = int(raw.seed, 0, 0, 0xffffffff);
    let id = int(raw.id, 0, 0);
    if (!id || usedIds.has(id)) { if (raw.id !== undefined) warn(`${type}: duplicate or invalid id ${raw.id}`); id = 0; }
    if (id) usedIds.add(id);
    const top = maxTierOf(type), tier = raw.tier === undefined ? 1 : Number.isInteger(raw.tier) && raw.tier >= 1 && raw.tier <= top ? raw.tier : (warn(`${type}: tier ${raw.tier} reset to ${clamp(int(raw.tier, 1), 1, top)}`), clamp(int(raw.tier, 1), 1, top));
    let blueprint = null;
    if (raw.blueprint !== undefined) {
      const ref = raw.blueprint, bp = ref && typeof ref === 'object' && Number.isInteger(ref.version) && state.blueprints[ref.id]?.versions[ref.version];
      if (bp && bp.baseType === type) blueprint = { id: ref.id, version: ref.version };
      else warn(`${type}: blueprint ${ref?.id} v${ref?.version} missing, drawn as a ${type}`);
    }
    pending.push({ type, tier, position: { x: pos.x, z: pos.z }, rotation, seed, id, well: num(raw.well, 50, 0, 100), open: typeof raw.open === 'boolean' ? raw.open : true, blueprint });
  }
  state.nextId = Math.max(int(g.nextId, 1, 1), ...[...usedIds].map(i => i + 1), 1);
  for (const p of pending) {
    const why = canPlace(state, p.type, p.position, p.rotation);
    if (why) { warn(`${p.type} at ${p.position.x},${p.position.z}: ${why}`); if (p.id) usedIds.delete(p.id); continue; }
    if (p.type === LANDMARK && Object.values(state.buildings).some(b => b.type === LANDMARK)) { warn('second café dropped'); continue; }
    const b = insertBuilding(state, p.type, p, p.seed, p.id || state.nextId, p.tier);
    b.well = p.well; b.open = p.open; if (p.blueprint) b.blueprint = p.blueprint;
  }
  state.roads = normalizeRoads(g.roads, warn);
  // road cells found among buildings (damaged or hand-edited documents) join the network instead of vanishing
  if (strayCells.length) { tilesToGraph(state, strayCells); warn(`${strayCells.length} road cells moved from buildings to the road network`); }
  if (repairLandmark && !Object.values(state.buildings).some(b => b.type === LANDMARK)) {
    const spot = LANDMARK_SPOTS.map(([x, y]) => tileToPose(state, LANDMARK, x, y, 0)).find(p => !canPlace(state, LANDMARK, p.position, p.rotation));
    if (spot) { insertBuilding(state, LANDMARK, spot, 1); warn('café was missing and has been restored'); }
  }
  return { state: reindex(state), warnings };
}

/**
 * Untrusted parsed JSON → { state, ui, from, warnings }. Throws if the document cannot be understood at all,
 * or if `expectMode` is given and the save belongs to the other mode (a normal game never turns into sandbox).
 */
export function loadSave(doc, { expectMode } = {}) {
  const { doc: d, from } = migrateSave(doc);
  if (expectMode && d.mode !== expectMode) throw new Error(`save is a ${d.mode} game, expected ${expectMode}`);
  const { state, warnings } = normalizeGame({ ...d.game, mode: d.mode }, { repairLandmark: from < 4 });
  return { state, ui: d.ui && typeof d.ui === 'object' ? d.ui : {}, from, warnings };
}
