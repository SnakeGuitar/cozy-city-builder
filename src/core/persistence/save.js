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
import { createRoads, tilesToGraph, listNodes, listSegments } from '../domain/roads.js';
import { createEmptyState, listBuildings } from '../domain/state.js';
import { clamp } from '../util/math.js';
export const SAVE_VERSION = 7;
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
    roads: serializeRoads(state),
    buildings: listBuildings(state).map(b => ({ id: b.id, type: b.type, tier: b.tier || 1, position: { x: b.position.x, z: b.position.z }, rotation: b.rotation, seed: b.seed, well: b.well, open: b.open })),
  };
}
export function serializeRoads(state) {
  const r = state.roads || createRoads();
  return {
    nodes: listNodes(state).map(n => ({ id: n.id, position: { x: n.position.x, z: n.position.z }, ...(n.width ? { width: n.width, style: n.style } : {}), ...(n.paid ? { paid: n.paid } : {}) })),
    segments: listSegments(state).map(s => ({ id: s.id, startNodeId: s.startNodeId, endNodeId: s.endNodeId, controlPoints: s.controlPoints.map(p => ({ x: p.x, z: p.z })), width: s.width, style: s.style, oneWay: !!s.oneWay, paid: s.paid || 0 })),
    nextNodeId: r.nextNodeId, nextSegmentId: r.nextSegmentId,
  };
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
    mode: MODES.includes(g.mode) ? g.mode : 'normal',
    tutorial: { step: TUTORIAL_STEPS.some(x => x.id === tut.step) ? tut.step : 'done', signals: (Array.isArray(tut.signals) ? tut.signals : []).filter(x => typeof x === 'string' && /^[a-z_]{1,32}$/.test(x)).slice(0, 16) },
    coins: num(g.coins, 0, 0), population: num(g.population, 0, 0, 10000), employed: num(g.employed, 0, 0, 10000),
    demand: { r: num(dem.r, 0, -100, 100), c: num(dem.c, 0, -100, 100), i: num(dem.i, 0, -100, 100) },
    clock: { time: num(clock.time, .3, 0, .999999), day: int(clock.day, 1, 1), speed: SPEEDS.includes(clock.speed) ? clock.speed : 1, paused: false },
    goalsDone: [...new Set((Array.isArray(g.goalsDone) ? g.goalsDone : []).filter(id => GOALS.some(x => x.id === id)))],
    rngSeed: int(g.rngSeed, 0x5eed1e, 0, 0xffffffff),
  });
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
    pending.push({ type, tier, position: { x: pos.x, z: pos.z }, rotation, seed, id, well: num(raw.well, 50, 0, 100), open: typeof raw.open === 'boolean' ? raw.open : true });
  }
  state.nextId = Math.max(int(g.nextId, 1, 1), ...[...usedIds].map(i => i + 1), 1);
  for (const p of pending) {
    const why = canPlace(state, p.type, p.position, p.rotation);
    if (why) { warn(`${p.type} at ${p.position.x},${p.position.z}: ${why}`); if (p.id) usedIds.delete(p.id); continue; }
    if (p.type === LANDMARK && Object.values(state.buildings).some(b => b.type === LANDMARK)) { warn('second café dropped'); continue; }
    const b = insertBuilding(state, p.type, p, p.seed, p.id || state.nextId, p.tier);
    b.well = p.well; b.open = p.open;
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
  roads.nextNodeId = Math.max(int(r.nextNodeId, 1, 1), maxN + 1); roads.nextSegmentId = Math.max(int(r.nextSegmentId, 1, 1), maxS + 1);
  return roads;
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
