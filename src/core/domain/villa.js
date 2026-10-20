// Villas: reusable, versioned compositions of buildings (catalogue or custom), private paths, gardens, trees and
// decoration, with an optional fence and gate. Plain JSON data, no engine.
//
// A villa is designed in town: the player builds an arrangement, frames it with a rectangle and saves it
// (captureVilla). The definition stores every item relative to the rectangle's centre (local frame: +z is the front,
// where the gate goes by default). Placing a villa builds all of it at once or nothing (commands.js PlaceVilla) and
// records a *group* in the state: which buildings and road segments belong to that placed villa, so it can be moved,
// turned, updated to a newer version, demolished or ungrouped as a unit.
//
// Definition: { schema, id, version, name, size: { w, d }, seed, variants, fence: null | { style, gate }, items }
//   item: { id, kind: 'building', type, blueprint?: { id, version }, position: { x, z }, rotation, seed }
//       | { id, kind: 'path', style, shape: 'polyline' | 'curve', points: [{ x, z }, …] }
// Group: { id, villa: { id, version }, position, rotation, seed, members: [buildingId…], segments: [segmentId…], fence }
import { DEFS, LANDMARK, isRoadType } from '../config/catalog.js';
import { footprintObb, obbFor } from './space.js';
import { obbCorners, obbOverlap, normAngle, cosSin } from './geometry.js';
import { roadsOf, segmentControl, segmentPolyline, polylineLength } from './roads.js';
import { getBlueprint, blueprintExtraCost } from './blueprint.js';
import { clamp } from '../util/math.js';

export const VILLA_SCHEMA = 1;
export const VILLA_LIMITS = Object.freeze({ items: 60, side: 14, minSide: 2, nameLength: 40, pathPoints: 24 });
export const FENCE_STYLES = Object.freeze(['picket', 'hedge', 'iron', 'stone']);
export const GATE_SIDES = Object.freeze(['front', 'right', 'back', 'left']);
const GATE_ANGLE = { front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 };
export const FENCE_INSET = .06;   // the fence runs this far inside the villa's edge
export const GATE_WIDTH = 1;      // opening left in the fence at the gate

const r4 = v => Math.round(v * 1e4) / 1e4 + 0;
const rot = (a, x, z) => { const [c, s] = cosSin(a); return { x: x * c + z * s, z: -x * s + z * c }; };
/** A local point/pose of a definition placed at { position, rotation }. */
export const toWorld = (pose, p) => { const o = rot(pose.rotation, p.x, p.z); return { x: r4(pose.position.x + o.x), z: r4(pose.position.z + o.z) }; };
export const toLocal = (pose, p) => { const o = rot(-pose.rotation, p.x - pose.position.x, p.z - pose.position.z); return { x: r4(o.x), z: r4(o.z) }; };

// ---------------------------------------------------------------- capture from town
/**
 * The arrangement inside a rectangle as a villa definition (no id yet): every building whose footprint lies inside
 * (never the landmark) and every road segment whose ends and curve lie inside (private paths). The centre is
 * rounded to half units so grid towns stay on the grid. Returns { villa, skipped: { buildings, segments } }.
 */
export function captureVilla(state, area, { name = '', fence = null, variants = false, seed = 1 } = {}) {
  const cx = Math.round((area.minX + area.maxX)) / 2, cz = Math.round((area.minZ + area.maxZ)) / 2;
  const w = clamp(Math.round(area.maxX - area.minX), VILLA_LIMITS.minSide, VILLA_LIMITS.side), d = clamp(Math.round(area.maxZ - area.minZ), VILLA_LIMITS.minSide, VILLA_LIMITS.side);
  const box = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 }, inside = p => p.x >= box.minX - 1e-6 && p.x <= box.maxX + 1e-6 && p.z >= box.minZ - 1e-6 && p.z <= box.maxZ + 1e-6;
  const pose = { position: { x: cx, z: cz }, rotation: 0 }, items = [], skipped = { buildings: 0, segments: 0 };
  let id = 1;
  for (const b of Object.values(state.buildings).sort((a, b) => a.id - b.id)) {
    const corners = obbCorners(footprintObb(b.type, b.position, b.rotation));
    if (!corners.every(inside)) { if (corners.some(inside)) skipped.buildings++; continue; }
    if (b.type === LANDMARK || DEFS[b.type].unique) { skipped.buildings++; continue; }
    items.push({ id: id++, kind: 'building', type: b.type, ...(b.blueprint ? { blueprint: { ...b.blueprint } } : {}), position: toLocal(pose, b.position), rotation: normAngle(r4(b.rotation)), seed: b.seed });
  }
  for (const s of Object.values(roadsOf(state).segments).sort((a, b) => a.id - b.id)) {
    const pl = segmentPolyline(state, s);
    if (!pl.every(inside)) { if (pl.some(inside)) skipped.segments++; continue; }
    const ctl = segmentControl(state, s);
    items.push({ id: id++, kind: 'path', style: s.style, shape: s.controlPoints.length ? 'curve' : 'polyline', points: ctl.map(p => toLocal(pose, p)) });
  }
  return { villa: { schema: VILLA_SCHEMA, id: null, version: 0, name: String(name).slice(0, VILLA_LIMITS.nameLength), size: { w, d }, seed: seed >>> 0, variants: !!variants, fence: fence ? { ...fence } : null, items, nextItemId: id }, skipped, center: { x: cx, z: cz } };
}

/**
 * A placed group as it stands now, as a definition in the group's own frame (its members may have been moved or
 * demolished one by one since): what "save as a new version" stores and what a group move previews.
 */
export function groupAsVilla(state, g) {
  const base = getVilla(state, g.villa), pose = { position: g.position, rotation: g.rotation }, items = []; let id = 1;
  for (const bid of g.members) { const b = state.buildings[bid]; if (!b) continue;
    items.push({ id: id++, kind: 'building', type: b.type, ...(b.blueprint ? { blueprint: { ...b.blueprint } } : {}), position: toLocal(pose, b.position), rotation: normAngle(r4(b.rotation - g.rotation)), seed: b.seed }); }
  for (const sid of g.segments) { const seg = roadsOf(state).segments[sid]; if (!seg) continue;
    items.push({ id: id++, kind: 'path', style: seg.style, shape: seg.controlPoints.length ? 'curve' : 'polyline', points: segmentControl(state, seg).map(p => toLocal(pose, p)) }); }
  return { schema: VILLA_SCHEMA, id: base?.id ?? g.villa.id, version: base?.version ?? g.villa.version, name: base?.name || '', size: base ? { ...base.size } : { w: 4, d: 4 }, seed: base?.seed ?? 1,
    variants: !!base?.variants, fence: g.fence ? { ...g.fence } : null, items, nextItemId: id };
}

// ---------------------------------------------------------------- boundary: normalise and validate
const num = (v, def, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : def);
const pt = (p, lim) => p && typeof p === 'object' && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: clamp(p.x, -lim, lim), z: clamp(p.z, -lim, lim) } : null;
/** Migrates a stored villa to the current schema; throws on a newer one. Schema 1 is the first. */
export function migrateVilla(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('not a villa');
  const from = Number.isInteger(raw.schema) ? raw.schema : 1;
  if (from > VILLA_SCHEMA) throw new Error(`villa schema ${from} is newer than ${VILLA_SCHEMA}`);
  return { ...raw, schema: VILLA_SCHEMA };
}
/** An untrusted villa → a well-formed one, or null. Unknown types, roads as buildings and broken paths are dropped. */
export function normalizeVilla(raw, warn = () => {}) {
  let v; try { v = migrateVilla(raw); } catch (e) { warn(`villa: ${e.message}`); return null; }
  const size = v.size && typeof v.size === 'object' ? v.size : {};
  const w = num(size.w, 4, VILLA_LIMITS.minSide, VILLA_LIMITS.side), d = num(size.d, 4, VILLA_LIMITS.minSide, VILLA_LIMITS.side), lim = VILLA_LIMITS.side;
  const items = [], ids = new Set();
  for (const it of Array.isArray(v.items) ? v.items : []) {
    if (!it || typeof it !== 'object' || !Number.isInteger(it.id) || it.id < 1 || ids.has(it.id)) { warn('villa: item without a valid id'); continue; }
    if (it.kind === 'building') {
      const p = pt(it.position, lim);
      if (!DEFS[it.type] || isRoadType(it.type) || it.type === LANDMARK || DEFS[it.type].unique || !p) { warn(`villa: building item ${it.id} (${it.type}) dropped`); continue; }
      const bp = it.blueprint && typeof it.blueprint === 'object' && typeof it.blueprint.id === 'string' && Number.isInteger(it.blueprint.version) ? { id: it.blueprint.id, version: it.blueprint.version } : null;
      ids.add(it.id); items.push({ id: it.id, kind: 'building', type: it.type, ...(bp ? { blueprint: bp } : {}), position: p, rotation: normAngle(num(it.rotation, 0, -100, 100)), seed: Number.isInteger(it.seed) ? it.seed >>> 0 : 0 });
    } else if (it.kind === 'path') {
      const points = (Array.isArray(it.points) ? it.points : []).map(q => pt(q, lim)).filter(Boolean).slice(0, VILLA_LIMITS.pathPoints);
      if (!isRoadType(it.style) || points.length < 2) { warn(`villa: path item ${it.id} dropped`); continue; }
      ids.add(it.id); items.push({ id: it.id, kind: 'path', style: it.style, shape: it.shape === 'curve' ? 'curve' : 'polyline', points });
    } else warn(`villa: unknown item kind ${it.kind}`);
  }
  const f = v.fence && typeof v.fence === 'object' && FENCE_STYLES.includes(v.fence.style) ? { style: v.fence.style, gate: GATE_SIDES.includes(v.fence.gate) ? v.fence.gate : 'front' } : null;
  const maxId = items.reduce((a, it) => Math.max(a, it.id), 0);
  return { schema: VILLA_SCHEMA, id: typeof v.id === 'string' && /^vl\d{1,9}$/.test(v.id) ? v.id : null, version: Number.isInteger(v.version) && v.version >= 0 ? v.version : 0,
    name: typeof v.name === 'string' ? v.name.trim().slice(0, VILLA_LIMITS.nameLength) : '', size: { w, d }, seed: Number.isInteger(v.seed) ? v.seed >>> 0 : 1, variants: !!v.variants, fence: f, items,
    nextItemId: Math.max(maxId + 1, Number.isInteger(v.nextItemId) ? v.nextItemId : 1) };
}

/** Local footprint box of a building item. */
const itemObb = it => obbFor(it.type, it.position, it.rotation);
/**
 * Checks a definition against the state's blueprint library: { ok, issues: [{ level, code, itemId? }] }.
 *   name · empty · tooManyItems · outside (an item leaves the rectangle) · overlap (two buildings collide) ·
 *   missingBlueprint (a custom building whose design version is gone) — errors
 */
export function validateVilla(state, v) {
  const issues = [], err = (code, o = {}) => issues.push({ level: 'error', code, ...o });
  if (!v.name || !v.name.trim()) err('name');
  if (!v.items.length) err('empty');
  if (v.items.length > VILLA_LIMITS.items) err('tooManyItems', { value: v.items.length, limit: VILLA_LIMITS.items });
  const hw = v.size.w / 2 + 1e-6, hd = v.size.d / 2 + 1e-6, out = p => Math.abs(p.x) > hw || Math.abs(p.z) > hd;
  const blds = v.items.filter(it => it.kind === 'building');
  for (const it of blds) {
    if (obbCorners(footprintObb(it.type, it.position, it.rotation)).some(out)) err('outside', { itemId: it.id });
    if (it.blueprint) { const bp = getBlueprint(state, it.blueprint); if (!bp || bp.baseType !== it.type) err('missingBlueprint', { itemId: it.id }); }
  }
  for (let i = 0; i < blds.length; i++) for (let j = i + 1; j < blds.length; j++) if (obbOverlap(itemObb(blds[i]), itemObb(blds[j]))) err('overlap', { itemId: blds[j].id });
  for (const it of v.items) if (it.kind === 'path' && it.points.some(out)) err('outside', { itemId: it.id });
  return { ok: !issues.length, issues };
}

// ---------------------------------------------------------------- price, contents, fence
/** Rough price of a definition (catalogue or design price of each building, plus each path's length × its style's price per unit). Placing it charges the exact amounts. */
export function villaCost(state, v) {
  let c = 0;
  for (const it of v.items) {
    if (it.kind === 'building') { const bp = it.blueprint && getBlueprint(state, it.blueprint); c += DEFS[it.type].cost + (bp ? blueprintExtraCost(bp) : 0); }
    else c += Math.ceil(polylineLength(it.points) * DEFS[it.style].cost);
  }
  return c;
}
/** Counts per kind for summaries: { buildings, custom, paths, byType: { type: n } }. */
export function villaContents(v) {
  const byType = {}; let buildings = 0, custom = 0, paths = 0;
  for (const it of v.items) if (it.kind === 'building') { buildings++; if (it.blueprint) custom++; byType[it.type] = (byType[it.type] || 0) + 1; } else paths++;
  return { buildings, custom, paths, byType };
}
/**
 * Fence pieces in the villa's local frame: straight runs along the four sides, FENCE_INSET inside the edge, with a
 * GATE_WIDTH opening centred on the gate side: [{ a: { x, z }, b: { x, z } }].
 */
export function fenceRuns(v) {
  if (!v.fence) return [];
  const hw = v.size.w / 2 - FENCE_INSET, hd = v.size.d / 2 - FENCE_INSET, g = GATE_WIDTH / 2;
  const sides = { front: [{ x: -hw, z: hd }, { x: hw, z: hd }], right: [{ x: hw, z: hd }, { x: hw, z: -hd }], back: [{ x: hw, z: -hd }, { x: -hw, z: -hd }], left: [{ x: -hw, z: -hd }, { x: -hw, z: hd }] };
  const runs = [];
  for (const side of GATE_SIDES) {
    const [a, b] = sides[side];
    if (side !== v.fence.gate) { runs.push({ a, b }); continue; }
    const m = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, L = Math.hypot(b.x - a.x, b.z - a.z), ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
    runs.push({ a, b: { x: m.x - ux * g, z: m.z - uz * g } }, { a: { x: m.x + ux * g, z: m.z + uz * g }, b });
  }
  return runs.filter(r => Math.hypot(r.b.x - r.a.x, r.b.z - r.a.z) > .05);
}
/** Where the gate opens (local), or null without a fence. */
export const gateOf = v => v.fence ? { ...{ front: { x: 0, z: v.size.d / 2 }, right: { x: v.size.w / 2, z: 0 }, back: { x: 0, z: -v.size.d / 2 }, left: { x: -v.size.w / 2, z: 0 } }[v.fence.gate], side: v.fence.gate } : null;

// ---------------------------------------------------------------- the libraries in the game state
export const villasOf = state => state.villas || {};
export const groupsOf = state => state.groups || {};
/** A saved villa version ({ id, version? }; latest when omitted), or null. */
export function getVilla(state, ref) { const e = ref && villasOf(state)[ref.id]; return e ? e.versions[ref.version ?? e.latest] || null : null; }
export const nextVillaId = state => 'vl' + (state.nextVillaId || 1);
export const nextGroupId = state => 'g' + (state.nextGroupId || 1);
/** Placed groups that use a villa (any version). */
export const villaUsers = (state, id) => Object.values(groupsOf(state)).filter(g => g.villa.id === id).map(g => g.id).sort();
/** The group a building belongs to, or null. */
export const groupOfBuilding = (state, b) => (b && b.group && groupsOf(state)[b.group]) || null;
export const sameVilla = (a, b) => JSON.stringify([a.size, a.fence, a.variants, a.items]) === JSON.stringify([b.size, b.fence, b.variants, b.items]);
/** Seed of an item in a placed group: its own seed, or (variants) one derived from the group's seed, so copies differ. */
export function itemSeed(v, it, groupSeed) {
  if (!v.variants) return it.seed || 0;
  let h = (groupSeed ^ Math.imul(it.id, 0x9e3779b1)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) % 1000000;
}
export { GATE_ANGLE };
