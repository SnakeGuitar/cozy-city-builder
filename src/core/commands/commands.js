// Player commands. Every rule about what the player may do (unlocks, money, space, the café) lives here.
// executeCommand mutates only the state it is given and returns { ok, reason?, events }.
import { DEFS, ECON, LANDMARK, isRoadType, tierOf, tierStats, maxTierOf, investedIn, TIER_STATS } from '../config/catalog.js';
import { SPEEDS } from '../config/world.js';
import { rulesFor } from '../config/rules.js';
import { autoFace, canPlace, insertBuilding, removeBuilding, setPose, tileToPose, snapToGrid, overlapping, obbFor } from '../domain/space.js';
import { roadsOf, addTileRoad, nodeAtPoint, roadHitsObb, removeSegment, touchRoads, curvePoints, segmentControl, normalizeRoads, listSegments, listNodes, segmentPolyline, segmentLength } from '../domain/roads.js';
import { planTrace, checkCurve } from '../domain/roadPlan.js';
import { makeObb } from '../domain/geometry.js';
import { normAngle, angleToQuarter, QUARTER } from '../domain/geometry.js';
import { unlockedTypes } from '../goals/goals.js';
import { nextRandom } from '../util/random.js';
import { normalizeBlueprint, validateBlueprint, getBlueprint, blueprintsOf, blueprintUsers, blueprintExtraCost, entranceOf, sameDesign, nextBlueprintId } from '../domain/blueprint.js';
import { FACE_ANGLE } from '../config/modules.js';
import { normalizeVilla, validateVilla, getVilla, villasOf, groupsOf, villaUsers, nextVillaId, nextGroupId, sameVilla, toWorld, toLocal, itemSeed, fenceRuns } from '../domain/villa.js';
import { reindex } from '../domain/space.js';
import { bumpRev } from '../domain/state.js';

export const CMD = Object.freeze({ Place: 'PlaceBuilding', Move: 'MoveBuilding', Rotate: 'RotateBuilding', Demolish: 'DemolishBuilding', Upgrade: 'UpgradeBuilding',
  BuildRoad: 'BuildRoad', DemolishRoad: 'DemolishRoad', EditRoad: 'EditRoad', RestoreRoads: 'RestoreRoads', SaveBlueprint: 'SaveBlueprint', DeleteBlueprint: 'DeleteBlueprint', Remodel: 'RemodelBuilding',
  SaveVilla: 'SaveVilla', DeleteVilla: 'DeleteVilla', PlaceVilla: 'PlaceVilla', MoveGroup: 'MoveGroup', DemolishGroup: 'DemolishGroup', UpdateGroup: 'UpdateGroup', Ungroup: 'Ungroup', SetSpeed: 'SetSpeed', TogglePause: 'TogglePause', TutorialSignal: 'TutorialSignal' });
/** Commands that change the map (the application recomputes the town after them). */
export const STRUCTURAL = new Set([CMD.Place, CMD.Move, CMD.Rotate, CMD.Demolish, CMD.Upgrade, CMD.BuildRoad, CMD.DemolishRoad, CMD.EditRoad, CMD.RestoreRoads, CMD.Remodel, CMD.PlaceVilla, CMD.MoveGroup, CMD.DemolishGroup, CMD.UpdateGroup, CMD.Ungroup]);
/** Commands that rebuild roads as part of a group (front ends drop the street undo history after them). */
export const GROUP_COMMANDS = new Set([CMD.PlaceVilla, CMD.MoveGroup, CMD.DemolishGroup, CMD.UpdateGroup]);
/** Commands that change only the road network (front ends may offer undo / redo for these). */
export const ROAD_COMMANDS = new Set([CMD.BuildRoad, CMD.DemolishRoad, CMD.EditRoad]);

const reject = (cmd, reason) => ({ ok: false, reason, events: [{ type: 'command_rejected', command: cmd.type, reason }] });
const coinsEvent = (state, delta) => ({ type: 'coins_changed', coins: state.coins, delta });
/** Coins returned for demolishing a building of `type` at `tier` (half of its price and of the upgrades paid for). */
export const refundOf = (type, tier = 1, extra = 0) => Math.floor((investedIn(type, tier) + extra) * ECON.refundRate);
/** Coins a custom building's blueprint added to its price (0 for catalogue buildings or a missing blueprint). */
export const blueprintExtraOf = (state, b) => { const bp = b.blueprint && getBlueprint(state, b.blueprint); return bp ? blueprintExtraCost(bp) : 0; };
/** What a building costs / returns under the state's rules (sandbox: nothing). `b` is a type id or a building record. */
export const costFor = (state, type) => rulesFor(state).buildCostsEnabled ? DEFS[type].cost : 0;
export const refundFor = (state, b) => rulesFor(state).refundsEnabled ? (typeof b === 'string' ? refundOf(b) : refundOf(b.type, b.tier || 1, blueprintExtraOf(state, b))) : 0;
/** Price of a custom building from a saved blueprint version under the state's rules (sandbox: free). */
export const blueprintPriceFor = (state, bp) => rulesFor(state).buildCostsEnabled ? DEFS[bp.baseType].cost + blueprintExtraCost(bp) : 0;
/**
 * Why a blueprint ({ id, version? }) cannot be built now, or null: 'missingBlueprint' · 'invalidBlueprint' · 'locked'.
 * Saved versions were valid when saved; this re-checks so a damaged library can never place a broken building.
 */
export function blueprintBlocker(state, ref) {
  const bp = getBlueprint(state, ref); if (!bp) return 'missingBlueprint';
  if (!validateBlueprint(bp).ok) return 'invalidBlueprint';
  if (!unlockedTypes(state).has(bp.baseType)) return 'locked';
  return null;
}
export const canAfford = (state, type) => rulesFor(state).unlimitedMoney || state.coins >= costFor(state, type);
/** Price of taking a building from its tier to the next one under the state's rules (sandbox: free). */
export const upgradeCostFor = (state, b) => rulesFor(state).buildCostsEnabled ? (tierOf(b.type, (b.tier || 1) + 1)?.upgradeCost ?? 0) : 0;

/** Why a building cannot be upgraded now ('missing' · 'notUpgradable' · 'maxTier' · 'notEnough'), or null. The one validation used by the command and the UI. */
export function upgradeBlocker(state, b) {
  if (!b) return 'missing';
  if (!DEFS[b.type].tiers || maxTierOf(b.type) < 2) return 'notUpgradable';
  if ((b.tier || 1) >= maxTierOf(b.type)) return 'maxTier';
  if (!rulesFor(state).unlimitedMoney && state.coins < upgradeCostFor(state, b)) return 'notEnough';
  return null;
}
/**
 * What an upgrade would change, for a confirmation preview. Pure.
 * { reason, from, to, cost, current, next, changes: [{ stat, from, to }] } — `next`/`changes` are null at the top tier.
 */
export function upgradePreview(state, id) {
  const b = state.buildings[id]; if (!b) return { reason: 'missing' };
  const from = b.tier || 1, top = from >= maxTierOf(b.type);
  const current = tierStats(b.type, from), next = top || !DEFS[b.type].tiers ? null : tierStats(b.type, from + 1);
  const changes = next ? TIER_STATS.filter(k => (current[k] ?? 0) !== (next[k] ?? 0)).map(k => ({ stat: k, from: current[k] ?? 0, to: next[k] ?? 0 })) : null;
  return { reason: upgradeBlocker(state, b), from, to: next ? from + 1 : from, max: maxTierOf(b.type), cost: next ? upgradeCostFor(state, b) : 0, current, next, changes };
}

/**
 * The pose a command asks for. Free form: { position: { x, z }, rotation } (radians). Grid form (older callers):
 * { x, y, r } — a cell and a quarter turn. Roads of the grid street tool always sit on a cell, unrotated.
 * Unless `autoFace: false`, the front turns toward the road (among quarter turns of the asked rotation).
 */
function poseFor(state, type, cmd, fallbackRotation = 0) {
  let pose;
  if (cmd.position && typeof cmd.position === 'object') pose = { position: { x: +cmd.position.x, z: +cmd.position.z }, rotation: Number.isFinite(cmd.rotation) ? normAngle(cmd.rotation) : fallbackRotation };
  else if (Number.isInteger(cmd.x) && Number.isInteger(cmd.y)) pose = tileToPose(state, type, cmd.x, cmd.y, Number.isInteger(cmd.r) ? cmd.r : angleToQuarter(fallbackRotation));
  else return null;
  if (isRoadType(type)) { const g = snapToGrid(state, type, pose.position, 0); return { position: g.position, rotation: 0 }; }
  if (cmd.autoFace !== false) { const fa = frontOffset(state, cmd); pose.rotation = normAngle(autoFace(state, type, pose.position, normAngle(pose.rotation + fa)) - fa); }
  return pose;
}
/** A custom building faces the road with its entrance: how far its entrance side is turned from the local front. */
function frontOffset(state, cmd) {
  const bp = cmd.blueprint && getBlueprint(state, cmd.blueprint), e = bp && entranceOf(bp);
  return e ? FACE_ANGLE[e.side] : 0;
}
const poseEvent = b => ({ position: { ...b.position }, rotation: b.rotation });
/** The seed the next placement will get (lets a preview show the right visual variant). Pure. */
export const peekSeed = state => Math.floor(nextRandom(state.rngSeed).value * 1e6);
function drawSeed(state) { const r = nextRandom(state.rngSeed); state.rngSeed = r.seed; return Math.floor(r.value * 1e6); }

const roadEvent = (state, extra) => ({ type: 'road_built', ...extra });
/** Price of a road plan under the state's rules (sandbox: free). */
export const roadCostFor = (state, plan) => rulesFor(state).buildCostsEnabled ? plan.cost : 0;
export const canAffordCoins = (state, n) => rulesFor(state).unlimitedMoney || state.coins >= n;

/** The grid street tool: one road cell at a cell centre, linked to road cells on the four sides. */
function placeRoadCell(state, cmd, type) {
  const pose = poseFor(state, type, cmd); if (!pose) return reject(cmd, 'outside');
  const c = pose.position, cell = makeObb(c.x, c.z, 1, 1, 0);
  const why = canPlace(state, type, c, 0); if (why) return reject(cmd, why);
  if (nodeAtPoint(state, c) || roadHitsObb(state, makeObb(c.x, c.z, .98, .98, 0))) return reject(cmd, 'blocked');
  if (overlapping(state, cell).length) return reject(cmd, 'blocked');
  if (!canAfford(state, type)) return reject(cmd, 'notEnough');
  const cost = costFor(state, type), width = Math.min(1, DEFS[type].road.width);
  state.coins -= cost;
  const { node, segments } = addTileRoad(state, type, width, c, cost);
  const events = [roadEvent(state, { style: type, nodeIds: [node.id], segmentIds: segments.map(s => s.id), cost, cell: true, position: { ...c } })];
  if (cost) events.push(coinsEvent(state, -cost));
  return { ok: true, nodeId: node.id, events };
}

// ---------------------------------------------------------------- atomic multi-step operations (villas and groups)
/**
 * A private copy of everything a villa or group operation may change. The operation runs every step on it; only when
 * all of them succeed does commitScratch put the copy back, so the real state never sees half an operation.
 */
function scratchOf(state) {
  const copy = o => JSON.parse(JSON.stringify(o));
  const s = { ...state, buildings: copy(state.buildings), roads: copy(roadsOf(state)), groups: copy(groupsOf(state)), clock: state.clock };
  reindex(s); return s;
}
function commitScratch(state, s) {
  for (const k of ['buildings', 'roads', 'groups', 'coins', 'nextId', 'rngSeed', 'nextGroupId', 'spatial']) state[k] = s[k];
  touchRoads(state); bumpRev(state);
}
/** Builds every item of a villa at a pose on `s` (buildings first, then paths). Charges as each item would. */
function buildVilla(s, v, pose, seed, events) {
  const members = [], segments = [];
  for (const it of v.items.filter(i => i.kind === 'building')) {
    const res = handlers[CMD.Place](s, { type: CMD.Place, buildingType: it.type, ...(it.blueprint ? { blueprint: it.blueprint } : {}), position: toWorld(pose, it.position), rotation: normAngle(it.rotation + pose.rotation), autoFace: false, seed: itemSeed(v, it, seed) });
    if (!res.ok) return { ok: false, reason: res.reason, itemId: it.id };
    members.push(res.id); events.push(...res.events);
  }
  for (const it of v.items.filter(i => i.kind === 'path')) {
    const res = handlers[CMD.BuildRoad](s, { type: CMD.BuildRoad, points: it.points.map(p => toWorld(pose, p)), style: it.style, shape: it.shape });
    if (!res.ok) return { ok: false, reason: res.reason, itemId: it.id };
    segments.push(...res.segmentIds); events.push(...res.events);
  }
  return { ok: true, members, segments };
}
/** Why a villa's fence cannot stand at a pose (it would cut a street or another building), or null. */
function fenceBlocker(s, v, pose, members) {
  const own = new Set(members);
  for (const r of fenceRuns(v)) {
    const a = toWorld(pose, r.a), b = toWorld(pose, r.b), L = Math.hypot(b.x - a.x, b.z - a.z);
    const o = makeObb((a.x + b.x) / 2, (a.z + b.z) / 2, .05, L, Math.atan2(b.x - a.x, b.z - a.z));
    if (roadHitsObb(s, o)) return 'fenceRoad';
    if (overlapping(s, o).some(x => !own.has(x.id))) return 'fenceBlocked';
  }
  return null;
}
/** Removes a group's buildings and road pieces from `s`, giving back what demolition would. Returns { refund, removed, segmentIds }. */
function clearGroup(s, g, refunds = true) {
  let refund = 0; const removed = [], segmentIds = [];
  for (const id of g.members) { const b = s.buildings[id]; if (!b) continue; const back = refunds ? refundFor(s, b) : 0; refund += back; removed.push({ id, buildingType: b.type, position: { ...b.position }, rotation: b.rotation, refund: back }); removeBuilding(s, b); }
  const rate = rulesFor(s).refundsEnabled && refunds ? ECON.refundRate : 0;
  for (const id of g.segments) { const seg = roadsOf(s).segments[id]; if (!seg) continue; refund += Math.floor((seg.paid || 0) * rate); removeSegment(s, id); segmentIds.push(id); }
  s.coins += refund; return { refund, removed, segmentIds };
}
const groupPose = g => ({ position: { ...g.position }, rotation: g.rotation });
/** Coins demolishing a placed villa would give back under the state's rules (its buildings and private paths). */
export function groupRefund(state, g) {
  const rate = rulesFor(state).refundsEnabled ? ECON.refundRate : 0, segs = roadsOf(state).segments;
  return g.members.reduce((a, id) => a + (state.buildings[id] ? refundFor(state, state.buildings[id]) : 0), 0) + g.segments.reduce((a, id) => a + Math.floor((segs[id]?.paid || 0) * rate), 0);
}

const handlers = {
  /**
   * Places a building: { buildingType, position, rotation } (or grid { x, y, r }), optional seed and autoFace.
   * A custom building passes `blueprint: { id, version? }` instead of a type: its base type gives the rules and the
   * footprint, the blueprint's parts add to the price. The building remembers the exact version it was built from.
   */
  [CMD.Place](state, cmd) {
    let bp = null;
    if (cmd.blueprint) { const why = blueprintBlocker(state, cmd.blueprint); if (why) return reject(cmd, why); bp = getBlueprint(state, cmd.blueprint); }
    const type = bp ? bp.baseType : cmd.buildingType, d = DEFS[type];
    if (!d) return reject(cmd, 'unknown');
    if (!unlockedTypes(state).has(type)) return reject(cmd, 'locked');
    if (isRoadType(type)) return placeRoadCell(state, cmd, type);
    if (d.unique && Object.values(state.buildings).some(b => b.type === type)) return reject(cmd, 'unique');
    const pose = poseFor(state, type, cmd); if (!pose) return reject(cmd, 'outside');
    const why = canPlace(state, type, pose.position, pose.rotation); if (why) return reject(cmd, why);
    const cost = bp ? blueprintPriceFor(state, bp) : costFor(state, type);
    if (!canAffordCoins(state, cost)) return reject(cmd, 'notEnough');
    const seed = Number.isInteger(cmd.seed) && cmd.seed >= 0 ? cmd.seed : drawSeed(state);
    state.coins -= cost;
    const b = insertBuilding(state, type, pose, seed);
    if (bp) b.blueprint = { id: bp.id, version: bp.version };
    const events = [{ type: 'building_placed', id: b.id, buildingType: type, ...poseEvent(b), seed, tier: b.tier, ...(bp ? { blueprint: { ...b.blueprint } } : {}) }];
    if (cost) events.push(coinsEvent(state, -cost));
    return { ok: true, id: b.id, events };
  },
  [CMD.Move](state, cmd) {
    const b = state.buildings[cmd.id]; if (!b) return reject(cmd, 'missing');
    const pose = poseFor(state, b.type, cmd, b.rotation); if (!pose) return reject(cmd, 'outside');
    const why = canPlace(state, b.type, pose.position, pose.rotation, b.id); if (why) return reject(cmd, why);
    const from = poseEvent(b);
    setPose(state, b, pose.position, pose.rotation);
    return { ok: true, id: b.id, events: [{ type: 'building_moved', id: b.id, buildingType: b.type, from, ...poseEvent(b) }] };
  },
  /** Turns a building in place by `by` radians (default a quarter turn), if it still fits. */
  [CMD.Rotate](state, cmd) {
    const b = state.buildings[cmd.id]; if (!b) return reject(cmd, 'missing');
    if (isRoadType(b.type)) return reject(cmd, 'notRotatable');
    const rotation = normAngle(b.rotation + (Number.isFinite(cmd.by) ? cmd.by : QUARTER));
    const why = canPlace(state, b.type, b.position, rotation, b.id); if (why) return reject(cmd, why);
    setPose(state, b, b.position, rotation);
    return { ok: true, id: b.id, events: [{ type: 'building_rotated', id: b.id, rotation: b.rotation }] };
  },
  /** Raises a building one tier. Keeps its id, position, rotation, seed and memory; only the tier changes. */
  [CMD.Upgrade](state, cmd) {
    const b = state.buildings[cmd.id], why = upgradeBlocker(state, b); if (why) return reject(cmd, why);
    const cost = upgradeCostFor(state, b), fromTier = b.tier || 1;
    state.coins -= cost; b.tier = fromTier + 1;
    const events = [{ type: 'building_upgraded', id: b.id, buildingType: b.type, fromTier, toTier: b.tier, cost, model: tierOf(b.type, b.tier).model }];
    if (cost) events.push(coinsEvent(state, -cost));
    return { ok: true, id: b.id, events };
  },
  [CMD.Demolish](state, cmd) {
    const b = state.buildings[cmd.id]; if (!b) return reject(cmd, 'missing');
    if (b.type === LANDMARK) return reject(cmd, 'cafeHeart');
    const refund = refundFor(state, b);
    state.coins += refund; removeBuilding(state, b);
    const events = [{ type: 'building_removed', id: b.id, buildingType: b.type, position: { ...b.position }, rotation: b.rotation, refund }];
    const g = b.group && groupsOf(state)[b.group]; // a villa loses this member; an empty villa (no buildings, no paths left) is dissolved
    if (g) { g.members = g.members.filter(id => id !== b.id); if (!g.members.length && !g.segments.some(id => roadsOf(state).segments[id])) { delete state.groups[g.id]; events.push({ type: 'group_removed', id: g.id, refund: 0 }); } }
    if (refund) events.push(coinsEvent(state, refund));
    return { ok: true, id: b.id, events };
  },
  /**
   * Draws a road trace atomically: { points: [{x, z}, …], style, shape?: 'curve' | 'polyline', snap? }.
   * 'curve' passes smoothly through the points; 'polyline' builds straight legs (an L takes three points).
   * The whole trace is planned first (domain/roadPlan.js planTrace); it is built and paid for at once, or not at all.
   */
  [CMD.BuildRoad](state, cmd) {
    if (!isRoadType(cmd.style)) return reject(cmd, 'unknown');
    if (!unlockedTypes(state).has(cmd.style)) return reject(cmd, 'locked');
    const trace = planTrace(state, { points: cmd.points, style: cmd.style, shape: cmd.shape || 'curve', snap: cmd.snap !== false }); if (!trace.ok) return reject(cmd, trace.reason);
    const cost = roadCostFor(state, trace); if (!canAffordCoins(state, cost)) return reject(cmd, 'notEnough');
    state.coins -= cost; state.roads = trace.roads; touchRoads(state);
    const events = [roadEvent(state, { style: cmd.style, shape: cmd.shape || 'curve', nodeIds: trace.nodeIds, segmentIds: trace.segmentIds, cost, length: trace.length })];
    if (cost) events.push(coinsEvent(state, -cost));
    return { ok: true, nodeIds: trace.nodeIds, segmentIds: trace.segmentIds, events };
  },
  /** Removes one road segment ({ segmentId }) or a lone road cell with its links ({ nodeId }); half of what it cost comes back. */
  [CMD.DemolishRoad](state, cmd) {
    const r = roadsOf(state), rate = rulesFor(state).refundsEnabled ? ECON.refundRate : 0;
    let refund = 0; const removedSegments = [], removedNodes = [];
    if (cmd.segmentId !== undefined) {
      const seg = r.segments[cmd.segmentId]; if (!seg) return reject(cmd, 'missing');
      refund = Math.floor((seg.paid || 0) * rate + 1e-9); removedSegments.push(seg.id); removedNodes.push(...removeSegment(state, seg.id));
    } else if (cmd.nodeId !== undefined) {
      const n = r.nodes[cmd.nodeId]; if (!n) return reject(cmd, 'missing');
      let paid = n.paid || 0;
      for (const s of Object.values(r.segments)) if (s.startNodeId === n.id || s.endNodeId === n.id) { paid += s.paid || 0; removedSegments.push(s.id); removedNodes.push(...removeSegment(state, s.id, { keepNodes: true })); }
      touchRoads(state); delete r.nodes[n.id]; removedNodes.push(n.id);
      for (const id of Object.keys(r.nodes).map(Number)) if (!r.nodes[id].width && !Object.values(r.segments).some(s => s.startNodeId === id || s.endNodeId === id)) { delete r.nodes[id]; removedNodes.push(id); }
      refund = Math.floor(paid * rate + 1e-9);
    } else return reject(cmd, 'missing');
    state.coins += refund;
    const events = [{ type: 'road_removed', segmentIds: removedSegments, nodeIds: [...new Set(removedNodes)], refund }];
    if (refund) events.push(coinsEvent(state, refund));
    return { ok: true, events };
  },
  /**
   * Basic curve editing: { segmentId, action: 'move' | 'add' | 'remove', index?, position? }.
   * 'move' puts control point `index` at `position`; 'add' inserts a control point at `position` in curve order;
   * 'remove' deletes control point `index`. The edited curve must stay on the map and clear of buildings.
   */
  [CMD.EditRoad](state, cmd) {
    const seg = roadsOf(state).segments[cmd.segmentId]; if (!seg) return reject(cmd, 'missing');
    const cps = seg.controlPoints.map(p => ({ ...p })), pos = cmd.position;
    const okPos = pos && Number.isFinite(pos.x) && Number.isFinite(pos.z);
    if (cmd.action === 'move') { if (!okPos || !cps[cmd.index]) return reject(cmd, 'missing'); cps[cmd.index] = { x: pos.x, z: pos.z }; }
    else if (cmd.action === 'add') {
      if (!okPos) return reject(cmd, 'missing');
      const ctrl = segmentControl(state, seg); let best = 0, bd = Infinity; // insert between the two consecutive control points it is nearest to
      for (let i = 1; i < ctrl.length; i++) { const a = ctrl[i - 1], b = ctrl[i], d = Math.hypot(pos.x - a.x, pos.z - a.z) + Math.hypot(pos.x - b.x, pos.z - b.z) - Math.hypot(b.x - a.x, b.z - a.z); if (d < bd) { bd = d; best = i - 1; } }
      cps.splice(best, 0, { x: pos.x, z: pos.z });
    } else if (cmd.action === 'remove') { if (!cps[cmd.index]) return reject(cmd, 'missing'); cps.splice(cmd.index, 1); }
    else return reject(cmd, 'unknown');
    const ends = segmentControl(state, seg), pl = curvePoints([ends[0], ...cps, ends.at(-1)]);
    const why = checkCurve(state, pl, seg.width); if (why) return reject(cmd, why.reason);
    const from = seg.controlPoints; seg.controlPoints = cps; touchRoads(state);
    return { ok: true, events: [{ type: 'road_edited', segmentId: seg.id, from, controlPoints: cps.map(p => ({ ...p })) }] };
  },
  /**
   * Puts back a whole road network (undo / redo of road operations): { roads (as saved), coins: change to apply }.
   * Refused when the restored roads would run through buildings placed since, or when the coins are not there.
   */
  [CMD.RestoreRoads](state, cmd) {
    const delta = Number.isFinite(cmd.coins) ? cmd.coins : 0;
    if (delta < 0 && !rulesFor(state).unlimitedMoney && state.coins < -delta) return reject(cmd, 'notEnough');
    const prev = state.roads; state.roads = normalizeRoads(cmd.roads);
    let why = null;
    for (const s of listSegments(state)) { const w = checkCurve(state, segmentPolyline(state, s), s.width); if (w) { why = w.reason; break; } }
    if (!why) for (const n of listNodes(state)) if (n.width && overlapping(state, makeObb(n.position.x, n.position.z, n.width, n.width, 0)).length) { why = 'blocked'; break; }
    if (why) { state.roads = prev; return reject(cmd, why); }
    if (!rulesFor(state).unlimitedMoney) state.coins += delta;
    touchRoads(state);
    const events = [{ type: 'roads_replaced' }];
    if (delta && !rulesFor(state).unlimitedMoney) events.push(coinsEvent(state, delta));
    return { ok: true, events };
  },
  /**
   * Saves a design as a new immutable version: { blueprint }. A blueprint without an id (or `asNew: true`) starts a
   * new library entry; otherwise it becomes the next version of its entry, whose base type it must keep (buildings
   * of older versions keep their footprint and rules). An unchanged design is not saved again.
   * Rejects 'invalidBlueprint' with the validation `issues` so the editor can explain them.
   */
  [CMD.SaveBlueprint](state, cmd) {
    const warnings = [], bp = normalizeBlueprint(cmd.blueprint, w => warnings.push(w)); if (!bp) return reject(cmd, 'invalidBlueprint');
    const check = validateBlueprint(bp); if (!check.ok) return { ...reject(cmd, 'invalidBlueprint'), issues: check.issues };
    const lib = state.blueprints || (state.blueprints = {}), entry = !cmd.asNew && bp.id && lib[bp.id];
    if (entry) {
      const last = entry.versions[entry.latest];
      if (last.baseType !== bp.baseType) return reject(cmd, 'baseTypeChanged');
      if (last.name === bp.name && sameDesign(last, bp)) return { ok: true, id: entry.id, version: entry.latest, unchanged: true, events: [] };
      const version = entry.latest + 1, saved = { ...bp, id: entry.id, version };
      entry.versions[version] = saved; entry.latest = version; entry.name = saved.name;
      return { ok: true, id: entry.id, version, events: [{ type: 'blueprint_saved', id: entry.id, version, name: saved.name }] };
    }
    const id = nextBlueprintId(state); state.nextBlueprintId = (state.nextBlueprintId || 1) + 1;
    lib[id] = { id, name: bp.name, latest: 1, versions: { 1: { ...bp, id, version: 1 } } };
    return { ok: true, id, version: 1, events: [{ type: 'blueprint_saved', id, version: 1, name: bp.name, created: true }] };
  },
  /** Removes a blueprint and all its versions: { id }. Refused ('inUse') while any building or villa uses it. */
  [CMD.DeleteBlueprint](state, cmd) {
    const lib = blueprintsOf(state); if (!lib[cmd.id]) return reject(cmd, 'missingBlueprint');
    const users = blueprintUsers(state, cmd.id);
    if (users.buildings.length || users.villas.length) return { ...reject(cmd, 'inUse'), users };
    delete lib[cmd.id];
    return { ok: true, events: [{ type: 'blueprint_deleted', id: cmd.id }] };
  },
  /**
   * Rebuilds a custom building from another version of its blueprint: { id, version }. Rules and footprint stay
   * (same base type); a dearer design costs the difference, a cheaper one gives back half of it.
   */
  [CMD.Remodel](state, cmd) {
    const b = state.buildings[cmd.id]; if (!b) return reject(cmd, 'missing');
    if (!b.blueprint) return reject(cmd, 'notCustom');
    const ref = { id: b.blueprint.id, version: cmd.version }, why = blueprintBlocker(state, ref); if (why) return reject(cmd, why);
    const to = getBlueprint(state, ref); if (to.baseType !== b.type) return reject(cmd, 'baseTypeChanged');
    if (to.version === b.blueprint.version) return reject(cmd, 'sameVersion');
    const diff = blueprintExtraCost(to) - blueprintExtraOf(state, b), rules = rulesFor(state);
    const cost = !rules.buildCostsEnabled ? 0 : diff > 0 ? diff : -Math.floor(-diff * (rules.refundsEnabled ? ECON.refundRate : 0));
    if (cost > 0 && !canAffordCoins(state, cost)) return reject(cmd, 'notEnough');
    const from = b.blueprint.version; state.coins -= cost; b.blueprint = { id: to.id, version: to.version };
    const events = [{ type: 'building_remodeled', id: b.id, blueprint: { ...b.blueprint }, fromVersion: from, cost }];
    if (cost) events.push(coinsEvent(state, -cost));
    return { ok: true, id: b.id, events };
  },
  /**
   * Saves a villa definition as a new immutable version: { villa, asNew? } (like SaveBlueprint). The definition is
   * normalised and validated against the state's blueprint library; issues come back with a rejection.
   */
  [CMD.SaveVilla](state, cmd) {
    const v = normalizeVilla(cmd.villa); if (!v) return reject(cmd, 'invalidVilla');
    const check = validateVilla(state, v); if (!check.ok) return { ...reject(cmd, 'invalidVilla'), issues: check.issues };
    const lib = state.villas || (state.villas = {}), entry = !cmd.asNew && v.id && lib[v.id];
    if (entry) {
      const last = entry.versions[entry.latest];
      if (last.name === v.name && sameVilla(last, v)) return { ok: true, id: entry.id, version: entry.latest, unchanged: true, events: [] };
      const version = entry.latest + 1; entry.versions[version] = { ...v, id: entry.id, version }; entry.latest = version; entry.name = v.name;
      // saved from a placed group as it stands: that group now is this version (nothing is rebuilt)
      const g = cmd.fromGroup && groupsOf(state)[cmd.fromGroup];
      if (g && g.villa.id === entry.id) { g.villa = { id: entry.id, version }; g.fence = v.fence ? { ...v.fence } : null; }
      return { ok: true, id: entry.id, version, events: [{ type: 'villa_saved', id: entry.id, version, name: v.name }, ...(g ? [{ type: 'group_updated', id: g.id, villa: { ...g.villa }, members: [...g.members], segmentIds: [...g.segments], cost: 0 }] : [])] };
    }
    const id = nextVillaId(state); state.nextVillaId = (state.nextVillaId || 1) + 1;
    lib[id] = { id, name: v.name, latest: 1, versions: { 1: { ...v, id, version: 1 } } };
    return { ok: true, id, version: 1, events: [{ type: 'villa_saved', id, version: 1, name: v.name, created: true }] };
  },
  /** Removes a villa definition: { id }. Refused ('inUse') while a placed group uses it. */
  [CMD.DeleteVilla](state, cmd) {
    if (!villasOf(state)[cmd.id]) return reject(cmd, 'missingVilla');
    const users = villaUsers(state, cmd.id); if (users.length) return { ...reject(cmd, 'inUse'), groups: users };
    delete state.villas[cmd.id];
    return { ok: true, events: [{ type: 'villa_deleted', id: cmd.id }] };
  },
  /**
   * Builds a whole villa at once: { villa: { id, version? }, position, rotation, seed? }. Every building and path is
   * placed and paid for as if built by hand; if any of them cannot be, nothing is (the rejection names the item).
   */
  [CMD.PlaceVilla](state, cmd) {
    const v = getVilla(state, cmd.villa); if (!v) return reject(cmd, 'missingVilla');
    if (!validateVilla(state, v).ok) return reject(cmd, 'invalidVilla');
    if (!cmd.position || !Number.isFinite(cmd.position.x) || !Number.isFinite(cmd.position.z)) return reject(cmd, 'outside');
    const pose = { position: { x: +cmd.position.x, z: +cmd.position.z }, rotation: normAngle(Number.isFinite(cmd.rotation) ? cmd.rotation : 0) };
    const s = scratchOf(state), events = [], seed = Number.isInteger(cmd.seed) && cmd.seed >= 0 ? cmd.seed : drawSeed(s);
    const built = buildVilla(s, v, pose, seed, events);
    if (!built.ok) return { ...reject(cmd, built.reason), itemId: built.itemId };
    const fence = fenceBlocker(s, v, pose, built.members); if (fence) return reject(cmd, fence);
    const id = nextGroupId(s); s.nextGroupId = (s.nextGroupId || 1) + 1;
    s.groups[id] = { id, villa: { id: v.id, version: v.version }, ...pose, seed, members: built.members, segments: built.segments, fence: v.fence ? { ...v.fence } : null };
    for (const m of built.members) s.buildings[m].group = id;
    const cost = state.coins - s.coins; commitScratch(state, s);
    return { ok: true, groupId: id, cost, events: [...events.filter(e => e.type !== 'coins_changed'), { type: 'villa_placed', groupId: id, villa: { id: v.id, version: v.version }, members: built.members, segmentIds: built.segments, cost }, ...(cost ? [coinsEvent(state, -cost)] : [])] };
  },
  /**
   * Moves and/or turns a placed villa as one piece: { id, position, rotation }. Buildings keep their ids, tiers and
   * memory; private paths are rebuilt at the new place without paying again. All or nothing.
   */
  [CMD.MoveGroup](state, cmd) {
    const g = groupsOf(state)[cmd.id]; if (!g) return reject(cmd, 'missingGroup');
    const v = getVilla(state, g.villa), from = groupPose(g);
    const to = { position: cmd.position && Number.isFinite(cmd.position.x) && Number.isFinite(cmd.position.z) ? { x: +cmd.position.x, z: +cmd.position.z } : { ...g.position }, rotation: normAngle(Number.isFinite(cmd.rotation) ? cmd.rotation : g.rotation) };
    const s = scratchOf(state), sg = s.groups[g.id], r = roadsOf(s);
    const members = sg.members.map(id => s.buildings[id]).filter(Boolean).map(b => ({ b: { ...b }, local: toLocal(from, b.position), turn: b.rotation - from.rotation }));
    const paths = sg.segments.map(id => r.segments[id]).filter(Boolean).map(seg => ({ style: seg.style, shape: seg.controlPoints.length ? 'curve' : 'polyline', paid: seg.paid || 0, points: segmentControl(s, seg).map(p => toLocal(from, p)) }));
    for (const m of members) removeBuilding(s, s.buildings[m.b.id]);
    for (const id of sg.segments) if (r.segments[id]) removeSegment(s, id);
    for (const m of members) {
      const position = toWorld(to, m.local), rotation = normAngle(m.turn + to.rotation), why = canPlace(s, m.b.type, position, rotation);
      if (why) return { ...reject(cmd, why), buildingId: m.b.id };
      const nb = insertBuilding(s, m.b.type, { position, rotation }, m.b.seed, m.b.id, m.b.tier);
      Object.assign(nb, { well: m.b.well, open: m.b.open, group: g.id }, m.b.blueprint ? { blueprint: m.b.blueprint } : {});
    }
    const segments = [];
    for (const p of paths) {
      const trace = planTrace(s, { points: p.points.map(q => toWorld(to, q)), style: p.style, shape: p.shape, snap: true });
      if (!trace.ok) return reject(cmd, trace.reason);
      s.roads = trace.roads; touchRoads(s);
      const total = trace.segmentIds.reduce((a, id) => a + segmentLength(s, s.roads.segments[id]), 0) || 1;
      for (const id of trace.segmentIds) s.roads.segments[id].paid = Math.round(p.paid * segmentLength(s, s.roads.segments[id]) / total); // already paid for: only the record moves
      segments.push(...trace.segmentIds);
    }
    if (v) { const fence = fenceBlocker(s, v, to, members.map(m => m.b.id)); if (fence) return reject(cmd, fence); }
    Object.assign(sg, to, { segments });
    commitScratch(state, s);
    return { ok: true, id: g.id, events: [{ type: 'group_moved', id: g.id, from, to, members: members.map(m => m.b.id), segmentIds: segments }] };
  },
  /** Demolishes a placed villa: { id }. Its buildings and private paths go; half of what was paid comes back. */
  [CMD.DemolishGroup](state, cmd) {
    const g = groupsOf(state)[cmd.id]; if (!g) return reject(cmd, 'missingGroup');
    const s = scratchOf(state), { refund, removed, segmentIds } = clearGroup(s, s.groups[g.id]);
    delete s.groups[g.id]; commitScratch(state, s);
    const events = removed.map(x => ({ type: 'building_removed', ...x }));
    if (segmentIds.length) events.push({ type: 'road_removed', segmentIds, nodeIds: [], refund: 0 });
    events.push({ type: 'group_removed', id: g.id, refund });
    if (refund) events.push(coinsEvent(state, refund));
    return { ok: true, events };
  },
  /** Rebuilds a placed villa from another version of its definition at the same place: { id, version }. All or nothing. */
  [CMD.UpdateGroup](state, cmd) {
    const g = groupsOf(state)[cmd.id]; if (!g) return reject(cmd, 'missingGroup');
    const v = getVilla(state, { id: g.villa.id, version: cmd.version }); if (!v) return reject(cmd, 'missingVilla');
    if (v.version === g.villa.version) return reject(cmd, 'sameVersion');
    if (!validateVilla(state, v).ok) return reject(cmd, 'invalidVilla');
    const s = scratchOf(state), sg = s.groups[g.id], cleared = clearGroup(s, sg), events = [];
    const built = buildVilla(s, v, groupPose(g), g.seed, events);
    if (!built.ok) return { ...reject(cmd, built.reason), itemId: built.itemId };
    const fence = fenceBlocker(s, v, groupPose(g), built.members); if (fence) return reject(cmd, fence);
    Object.assign(sg, { villa: { id: v.id, version: v.version }, members: built.members, segments: built.segments, fence: v.fence ? { ...v.fence } : null });
    for (const m of built.members) s.buildings[m].group = g.id;
    const cost = state.coins - s.coins; commitScratch(state, s);
    return { ok: true, id: g.id, cost, events: [...cleared.removed.map(x => ({ type: 'building_removed', ...x })), ...events.filter(e => e.type !== 'coins_changed'),
      { type: 'group_updated', id: g.id, villa: { ...sg.villa }, members: built.members, segmentIds: built.segments, cost }, ...(cost ? [coinsEvent(state, -cost)] : [])] };
  },
  /** Dissolves a placed villa into ordinary buildings and streets: { id }. Its fence goes with the group. */
  [CMD.Ungroup](state, cmd) {
    const g = groupsOf(state)[cmd.id]; if (!g) return reject(cmd, 'missingGroup');
    for (const id of g.members) if (state.buildings[id]) delete state.buildings[id].group;
    delete state.groups[g.id]; bumpRev(state);
    return { ok: true, events: [{ type: 'group_ungrouped', id: g.id, members: [...g.members] }] };
  },
  [CMD.SetSpeed](state, cmd) {
    if (!SPEEDS.includes(cmd.speed)) return reject(cmd, 'badSpeed');
    state.clock.speed = cmd.speed; state.clock.paused = false;
    return { ok: true, events: [{ type: 'clock_changed', speed: cmd.speed, paused: false }] };
  },
  /** A front end reports something the rules cannot see (e.g. 'camera_moved'); the tutorial may advance. */
  [CMD.TutorialSignal](state, cmd) {
    if (typeof cmd.signal !== 'string' || !/^[a-z_]{1,32}$/.test(cmd.signal)) return reject(cmd, 'badSignal');
    if (!state.tutorial.signals.includes(cmd.signal)) state.tutorial.signals.push(cmd.signal);
    return { ok: true, events: [] };
  },
  [CMD.TogglePause](state) {
    state.clock.paused = !state.clock.paused;
    return { ok: true, events: [{ type: 'clock_changed', speed: state.clock.speed, paused: state.clock.paused }] };
  },
};

/**
 * What a villa or group command would do, without doing it: { ok, reason, cost, itemId, buildingId }. Only for the
 * commands that work on a private copy (PlaceVilla, MoveGroup, UpdateGroup); used by previews.
 */
export function dryRun(state, cmd) {
  if (![CMD.PlaceVilla, CMD.MoveGroup, CMD.UpdateGroup].includes(cmd?.type)) throw new Error(`no dry run for ${cmd?.type}`);
  const shadow = { ...state }, res = executeCommand(shadow, cmd); // commits land on the shadow, never on `state`
  return { ok: res.ok, reason: res.reason || null, cost: res.ok ? state.coins - shadow.coins : 0, itemId: res.itemId ?? null, buildingId: res.buildingId ?? null };
}

export function executeCommand(state, cmd) {
  const h = cmd && handlers[cmd.type];
  return h ? h(state, cmd) : reject(cmd || {}, 'unknownCommand');
}
