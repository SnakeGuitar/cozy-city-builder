// Blueprints: parametric, versioned designs for custom buildings. Plain JSON data, no engine.
//
// A blueprint is a tree of parts. Each part is a module from config/modules.js with its own size, colour and look,
// hung on an anchor: 'ground' (the lot), 'top' (on its parent) or a face of its parent ('front', 'right', 'back',
// 'left'). Positions are offsets in the anchor's frame, so parts follow their parent when it moves, turns or is
// resized: a window on the front face stays on the front face when the wall gets deeper. Nothing is ever baked
// into the blueprint; renderers draw it from these parameters (non-destructive editing).
//
// Frames (world units, same conventions as domain/geometry.js): the lot is centred on the origin, footprint
// s × s where s is the base type's size; a part's local +z is its front; rotation turns it like Three.js rotation.y.
// Face anchors: offset.x runs along the face (the face frame's local +x), offset.y rises from the parent's
// base, offset.z moves out of the face. Top anchor: offset.x / offset.z on the parent's roof plane, offset.y above it.
//
// The rules of a custom building come from its base type (a catalogue entry): kind, jobs, capacity, tiers. A blueprint
// only adds its parts' price on top of the base price and changes how the building looks.
import { DEFS, LANDMARK } from '../config/catalog.js';
import { MODULES, ANCHORS, FACES, FACE_ANGLE, BLUEPRINT_LIMITS, BLUEPRINT_KINDS, NEEDS_ENTRANCE } from '../config/modules.js';
import { normAngle, cosSin } from './geometry.js';
import { clamp } from '../util/math.js';

export const BLUEPRINT_SCHEMA = 1;
const EPS = 1e-6;
const HEX = /^#[0-9a-f]{6}$/i;

/** Base types a blueprint may use: building kinds with rules, never roads or the unique landmark. */
export const blueprintBaseTypes = () => Object.keys(DEFS).filter(t => BLUEPRINT_KINDS.includes(DEFS[t].kind) && t !== LANDMARK && !DEFS[t].unique);
export const isBlueprintBase = t => !!DEFS[t] && BLUEPRINT_KINDS.includes(DEFS[t].kind) && t !== LANDMARK && !DEFS[t].unique;
/** Side of the square lot (the base type's footprint). */
export const lotSize = bp => DEFS[bp.baseType]?.s || 1;

/** A new part record for `module` with its defaults. */
export function createPart(id, module, { parent = null, anchor, offset, rotation = 0, size, color, variant = 0 } = {}) {
  const m = MODULES[module]; if (!m) throw new Error(`unknown module ${module}`);
  return { id, module, parent, anchor: anchor || (parent === null ? 'ground' : m.attach.includes('top') ? 'top' : 'front'),
    offset: { x: offset?.x ?? 0, y: offset?.y ?? 0, z: offset?.z ?? 0 }, rotation: normAngle(rotation),
    size: { w: size?.w ?? m.size.w, h: size?.h ?? m.size.h, d: size?.d ?? m.size.d }, color: color || m.color, variant };
}

/**
 * A starting design for a base type: a body that fills most of the lot, a roof, a door on the front and, for homes
 * and shops, windows. Deterministic (no randomness): the same base type always starts the same way.
 */
export function createBlueprint({ name = '', baseType = 'cottage', seed = 1 } = {}) {
  if (!isBlueprintBase(baseType)) throw new Error(`not a blueprint base type: ${baseType}`);
  const s = DEFS[baseType].s, kind = DEFS[baseType].kind, parts = [];
  let id = 1; const add = (module, o) => { const p = createPart(id++, module, o); parts.push(p); return p; };
  if (kind === 'nature' || kind === 'deco') {
    add('plinth', { size: { w: s * .9, h: .04, d: s * .9 } });
    add('shrub', { offset: { x: -s * .2, z: -s * .2 } }); add('planter', { offset: { x: s * .25, z: s * .2 } });
  } else {
    const w = s * .78, d = s * .7, h = kind === 'industry' ? .55 : .5;
    const body = add('body', { size: { w, h, d } });
    add(kind === 'industry' ? 'roof_shed' : 'roof_gable', { parent: body.id, anchor: 'top', size: { w: w + .08, h: .3 * s, d: d + .08 } });
    add(kind === 'shop' ? 'shopfront' : kind === 'industry' ? 'gate' : 'door', { parent: body.id, anchor: 'front', offset: { x: 0, y: .02 } });
    if (kind === 'house' || kind === 'service') for (const x of [-w * .3, w * .3]) add('window_sash', { parent: body.id, anchor: 'front', offset: { x, y: .22 } });
    if (kind === 'shop') add('awning', { parent: body.id, anchor: 'front', offset: { x: 0, y: .34 }, size: { w: .52, h: .1, d: .14 } });
  }
  return { schema: BLUEPRINT_SCHEMA, id: null, version: 0, name: String(name).slice(0, BLUEPRINT_LIMITS.nameLength), baseType, seed: seed >>> 0, parts, nextPartId: id };
}

// ---------------------------------------------------------------- schema migrations and validation at the boundary
/** Schema migrations: each takes schema n and returns n + 1. Schema 1 is the first; later ones are added here. */
const MIGRATIONS = {};
/** Brings a stored blueprint to the current schema. Throws on a newer schema or a document it cannot read. */
export function migrateBlueprint(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('not a blueprint');
  let bp = raw; const from = Number.isInteger(raw.schema) ? raw.schema : 1;
  if (from > BLUEPRINT_SCHEMA) throw new Error(`blueprint schema ${from} is newer than ${BLUEPRINT_SCHEMA}`);
  for (let v = from; v < BLUEPRINT_SCHEMA; v++) { if (!MIGRATIONS[v]) throw new Error(`no blueprint migration from schema ${v}`); bp = MIGRATIONS[v](bp); }
  return { ...bp, schema: BLUEPRINT_SCHEMA };
}

const num = (v, def, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : def);
/**
 * An untrusted blueprint → a well-formed one (or null when it is not a blueprint at all). Unknown modules, parts with
 * a missing parent and parent cycles are dropped (with their children); numbers are clamped to the module's limits.
 * Validity as a design (fits the lot, has an entrance …) is a separate question: validateBlueprint.
 */
export function normalizeBlueprint(raw, warn = () => {}) {
  let bp; try { bp = migrateBlueprint(raw); } catch (e) { warn(`blueprint: ${e.message}`); return null; }
  const baseType = isBlueprintBase(bp.baseType) ? bp.baseType : (warn(`blueprint: base type ${bp.baseType} replaced by cottage`), 'cottage');
  const list = Array.isArray(bp.parts) ? bp.parts : [], parts = [], ids = new Set();
  for (const p of list) {
    if (!p || typeof p !== 'object' || !MODULES[p.module]) { warn(`blueprint: unknown module ${p?.module}`); continue; }
    if (!Number.isInteger(p.id) || p.id < 1 || ids.has(p.id)) { warn(`blueprint: bad part id ${p.id}`); continue; }
    const m = MODULES[p.module], anchor = ANCHORS.includes(p.anchor) ? p.anchor : 'ground', parent = Number.isInteger(p.parent) ? p.parent : null;
    const sz = p.size && typeof p.size === 'object' ? p.size : {}, off = p.offset && typeof p.offset === 'object' ? p.offset : {};
    ids.add(p.id);
    parts.push({ id: p.id, module: p.module, parent: anchor === 'ground' ? null : parent, anchor,
      offset: { x: num(off.x, 0, -10, 10), y: num(off.y, 0, -10, 10), z: num(off.z, 0, -10, 10) }, rotation: normAngle(num(p.rotation, 0, -100, 100)),
      size: { w: num(sz.w, m.size.w, m.min.w, m.max.w), h: num(sz.h, m.size.h, m.min.h, m.max.h), d: num(sz.d, m.size.d, m.min.d, m.max.d) },
      color: typeof p.color === 'string' && HEX.test(p.color) ? p.color.toLowerCase() : m.color, variant: Number.isInteger(p.variant) ? clamp(p.variant, 0, m.variants - 1) : 0 });
  }
  // drop parts whose parent chain is broken or circular (and, with them, their own children)
  const byId = new Map(parts.map(p => [p.id, p])), good = new Set();
  const rooted = p => { const seen = new Set(); let q = p; while (q) { if (good.has(q.id)) return true; if (seen.has(q.id)) return false; seen.add(q.id); if (q.parent === null) return q.anchor === 'ground'; q = byId.get(q.parent); } return false; };
  const kept = parts.filter(p => { if (rooted(p)) { good.add(p.id); return true; } warn(`blueprint: part ${p.id} has no valid parent`); return false; });
  const maxId = kept.reduce((a, p) => Math.max(a, p.id), 0);
  return { schema: BLUEPRINT_SCHEMA, id: typeof bp.id === 'string' && /^bp\d{1,9}$/.test(bp.id) ? bp.id : null, version: Number.isInteger(bp.version) && bp.version >= 0 ? bp.version : 0,
    name: typeof bp.name === 'string' ? bp.name.trim().slice(0, BLUEPRINT_LIMITS.nameLength) : '', baseType, seed: Number.isInteger(bp.seed) ? bp.seed >>> 0 : 1,
    parts: kept, nextPartId: Math.max(maxId + 1, Number.isInteger(bp.nextPartId) ? bp.nextPartId : 1) };
}

// ---------------------------------------------------------------- resolved geometry (blueprint-local frame)
const rot = (a, x, z) => { const [c, s] = cosSin(a); return { x: x * c + z * s, z: -x * s + z * c }; };
/**
 * Every part's pose in the lot frame: Map id → { part, module, x, y, z (centre of its base), ry, w, h, d, depth }.
 * Parts whose parent is missing are skipped (normalizeBlueprint never leaves any).
 */
export function resolveParts(bp) {
  const byId = new Map(bp.parts.map(p => [p.id, p])), out = new Map();
  const solve = (p, depth = 0) => {
    if (out.has(p.id)) return out.get(p.id);
    if (depth > 64) return null;
    const m = MODULES[p.module], { w, h, d } = p.size; let r;
    if (p.anchor === 'ground' || p.parent === null) r = { x: p.offset.x, y: p.offset.y, z: p.offset.z, ry: p.rotation };
    else {
      const par = byId.get(p.parent), P = par && solve(par, depth + 1); if (!P) return null;
      if (p.anchor === 'top') { const o = rot(P.ry, p.offset.x, p.offset.z); r = { x: P.x + o.x, y: P.y + P.h + p.offset.y, z: P.z + o.z, ry: P.ry + p.rotation }; }
      else {
        const fa = P.ry + FACE_ANGLE[p.anchor], half = (p.anchor === 'front' || p.anchor === 'back' ? P.d : P.w) / 2;
        const o = rot(fa, p.offset.x, half + p.offset.z + d / 2); r = { x: P.x + o.x, y: P.y + p.offset.y, z: P.z + o.z, ry: fa + p.rotation };
      }
      r.depth = P.depth + 1;
    }
    const res = { part: p, module: m, x: r.x, y: r.y, z: r.z, ry: normAngle(r.ry), w, h, d, depth: r.depth || 0 };
    out.set(p.id, res); return res;
  };
  for (const p of bp.parts) solve(p);
  return out;
}
/** XZ corners of a resolved part's box. */
export function partCorners(r) {
  return [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([i, j]) => { const o = rot(r.ry, i * r.w / 2, j * r.d / 2); return { x: r.x + o.x, z: r.z + o.z }; });
}
/** Lot-frame box around every part: { minX, maxX, minZ, maxZ, height }. */
export function blueprintBounds(bp, resolved = resolveParts(bp)) {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity, height: 0 };
  for (const r of resolved.values()) {
    for (const c of partCorners(r)) { b.minX = Math.min(b.minX, c.x); b.maxX = Math.max(b.maxX, c.x); b.minZ = Math.min(b.minZ, c.z); b.maxZ = Math.max(b.maxZ, c.z); }
    b.height = Math.max(b.height, r.y + r.h);
  }
  return b;
}

/** Side of the lot an outward direction (lot frame) points to. */
const sideOf = (dx, dz) => (Math.abs(dz) >= Math.abs(dx) ? (dz >= 0 ? 'front' : 'back') : (dx >= 0 ? 'right' : 'left'));
/** The first entrance part and where it opens: { partId, x, z (its outer point), side } or null. */
export function entranceOf(bp, resolved = resolveParts(bp)) {
  for (const r of resolved.values()) if (r.module.entrance) {
    const o = rot(r.ry, 0, r.d / 2 + .02);
    return { partId: r.part.id, x: r.x + o.x, z: r.z + o.z, side: sideOf(o.x, o.z) };
  }
  return null;
}

// ---------------------------------------------------------------- price and complexity
/** Coins one part adds: its module's price scaled by how big it is compared to the module's default. */
export function partCost(p) {
  const m = MODULES[p.module], k = (p.size.w * p.size.h * p.size.d) / (m.size.w * m.size.h * m.size.d);
  return Math.max(1, Math.round(m.cost * Math.sqrt(k)));
}
/** Coins the parts add on top of the base type's price. */
export const blueprintExtraCost = bp => bp.parts.reduce((a, p) => a + partCost(p), 0);
/** Whole price of a building built from this blueprint (tier 1). */
export const blueprintCost = bp => (DEFS[bp.baseType]?.cost || 0) + blueprintExtraCost(bp);
/** Complexity points (draw and check cost); the limit is BLUEPRINT_LIMITS.weight. */
export const blueprintWeight = bp => bp.parts.reduce((a, p) => a + MODULES[p.module].weight, 0);

/**
 * Checks a design. Every issue says what is wrong and which part, so the editor can explain how to fix it:
 * { ok, issues: [{ level: 'error' | 'warning', code, partId?, value?, limit? }] }. Errors block saving and building.
 *   empty · name · tooManyParts · tooComplex · tooDeep · anchor · outsideLot · tooTall · noEntrance — errors
 *   overhang (a face part sticks out past its face) · noRoof (a building kind with no roof part) — warnings
 */
export function validateBlueprint(bp) {
  const issues = [], err = (code, o = {}) => issues.push({ level: 'error', code, ...o }), warnOf = (code, o = {}) => issues.push({ level: 'warning', code, ...o });
  const L = BLUEPRINT_LIMITS, kind = DEFS[bp.baseType]?.kind;
  if (!isBlueprintBase(bp.baseType)) err('baseType');
  if (!bp.name || !bp.name.trim()) err('name');
  if (!bp.parts.length) { err('empty'); return { ok: false, issues }; }
  if (bp.parts.length > L.parts) err('tooManyParts', { value: bp.parts.length, limit: L.parts });
  const weight = blueprintWeight(bp); if (weight > L.weight) err('tooComplex', { value: weight, limit: L.weight });
  const resolved = resolveParts(bp), half = lotSize(bp) / 2 + .02;
  for (const r of resolved.values()) {
    const p = r.part, m = r.module;
    if (r.depth > L.depth) err('tooDeep', { partId: p.id, value: r.depth, limit: L.depth });
    const kindOfAnchor = FACES.includes(p.anchor) ? 'face' : p.anchor;
    if (!m.attach.includes(kindOfAnchor)) err('anchor', { partId: p.id, value: p.anchor });
    if (partCorners(r).some(c => Math.abs(c.x) > half || Math.abs(c.z) > half)) err('outsideLot', { partId: p.id });
    if (r.y + r.h > L.height + EPS) err('tooTall', { partId: p.id, value: +(r.y + r.h).toFixed(2), limit: L.height });
    if (kindOfAnchor === 'face') {
      const par = resolved.get(p.parent), faceW = (p.anchor === 'front' || p.anchor === 'back' ? par.w : par.d);
      if (Math.abs(p.offset.x) + r.w / 2 > faceW / 2 + EPS || p.offset.y < -EPS || p.offset.y + r.h > par.h + .25) warnOf('overhang', { partId: p.id });
    }
  }
  if (NEEDS_ENTRANCE.includes(kind) && !bp.parts.some(p => MODULES[p.module].entrance)) err('noEntrance');
  if (NEEDS_ENTRANCE.includes(kind) && !bp.parts.some(p => MODULES[p.module].roof)) warnOf('noRoof');
  return { ok: !issues.some(i => i.level === 'error'), issues };
}

// ---------------------------------------------------------------- the library kept in the game state
// state.blueprints: { [id]: { id, name, versions: { [n]: blueprint }, latest } }. Versions are immutable once saved:
// buildings and villas point at { id, version }, so editing a design never changes what is already built.
export const blueprintsOf = state => state.blueprints || {};
/** A saved blueprint version ({ id, version }; version omitted → latest), or null. */
export function getBlueprint(state, ref) {
  const e = ref && blueprintsOf(state)[ref.id]; if (!e) return null;
  return e.versions[ref.version ?? e.latest] || null;
}
/** Buildings (and villas, when given) that use any version of a blueprint: { buildings: [ids], villas: [ids] }. */
export function blueprintUsers(state, id) {
  const buildings = Object.values(state.buildings).filter(b => b.blueprint?.id === id).map(b => b.id).sort((a, b) => a - b);
  const villas = Object.values(state.villas || {}).filter(v => Object.values(v.versions).some(ver => ver.items.some(it => it.blueprint?.id === id))).map(v => v.id).sort();
  return { buildings, villas };
}
/** A fresh blueprint id for this state. */
export const nextBlueprintId = state => 'bp' + (state.nextBlueprintId || 1);
/** Whether two blueprints differ in anything that is drawn or priced (name aside). */
export const sameDesign = (a, b) => JSON.stringify([a.baseType, a.seed, a.parts]) === JSON.stringify([b.baseType, b.seed, b.parts]);
