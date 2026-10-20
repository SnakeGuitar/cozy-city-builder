// Villas (core/domain/villa.js) and placed groups: capture, versions, atomic placement, group moves, updates, saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { captureVilla, validateVilla, normalizeVilla, getVilla, villaCost, fenceRuns, toWorld, groupsOf, listSegments, segmentPolyline, createBlueprint, getBlueprint,
  createSaveDocument, loadSave, migrateSave, serializeGame, DEFS, normAngle } from '../src/core/index.js';
import { makeState, createGame, centre, CMD, ALL_GOALS } from './helpers.mjs';

const AREA = { minX: -10, maxX: -4, minZ: -10, maxZ: -5 };
/** A town with a little arrangement in the north-west: a cottage, a tree, a flowerbed and a private alley. */
function town(over = {}) {
  const g = createGame({ state: makeState(centre(), { coins: 20000, goalsDone: ALL_GOALS, ...over }) }), st = () => g.getSnapshot().state;
  const put = (type, x, z, r = 0) => { const res = g.dispatch({ type: CMD.Place, buildingType: type, position: { x, z }, rotation: r, autoFace: false }); assert.ok(res.ok, `${type}: ${res.reason}`); return res.id; };
  const ids = { cottage: put('cottage', -8.5, -8.5), tree: put('tree', -6.5, -8.5), flowers: put('flowerbed', -5.5, -6.5) };
  assert.ok(g.dispatch({ type: CMD.BuildRoad, points: [{ x: -9.5, z: -6.5 }, { x: -6.6, z: -6.5 }], style: 'road_alley', shape: 'polyline' }).ok);
  return { g, st, ids };
}
const saveVilla = (g, villa, extra = {}) => g.dispatch({ type: CMD.SaveVilla, villa, ...extra });
const snapshot = st => JSON.stringify(serializeGame(st));

test('capturing an arrangement keeps what lies inside, relative to the centre; never the café', () => {
  const { st } = town();
  const { villa, center } = captureVilla(st(), AREA, { name: 'Casita con huerto' });
  assert.deepEqual(center, { x: -7, z: -7.5 }); assert.deepEqual(villa.size, { w: 6, d: 5 });
  assert.deepEqual(villa.items.map(i => i.kind === 'building' ? i.type : i.kind), ['cottage', 'tree', 'flowerbed', 'path']);
  assert.deepEqual(villa.items[0].position, { x: -1.5, z: -1 });
  assert.ok(validateVilla(st(), villa).ok);
  const all = captureVilla(st(), { minX: -12, maxX: 12, minZ: -12, maxZ: 12 }).villa;
  assert.ok(!all.items.some(i => i.type === 'cafe'), 'the landmark is never part of a villa');
});

test('validation: names, emptiness, items outside the frame, overlapping buildings, missing designs', () => {
  const { st } = town(), { villa } = captureVilla(st(), AREA, { name: 'V' });
  const codes = v => validateVilla(st(), v).issues.map(i => i.code);
  assert.deepEqual(codes({ ...villa, name: '' }), ['name']);
  assert.deepEqual(codes({ ...villa, items: [] }), ['empty']);
  const moved = JSON.parse(JSON.stringify(villa)); moved.items[0].position.x = -2.9; assert.ok(codes(moved).includes('outside'));
  const clash = JSON.parse(JSON.stringify(villa)); clash.items[1].position = { ...clash.items[0].position }; assert.ok(codes(clash).includes('overlap'));
  const custom = JSON.parse(JSON.stringify(villa)); custom.items[0].blueprint = { id: 'bp7', version: 1 }; assert.ok(codes(custom).includes('missingBlueprint'));
  const warnings = []; const n = normalizeVilla({ ...villa, items: [...villa.items, { id: 99, kind: 'building', type: 'cafe', position: { x: 0, z: 0 } }, { id: 98, kind: 'path', style: 'cottage', points: [] }] }, w => warnings.push(w));
  assert.equal(n.items.length, villa.items.length); assert.equal(warnings.length, 2);
  assert.equal(normalizeVilla({ schema: 99 }), null, 'a newer schema is refused');
});

test('placing a villa builds everything at once, rotated, and charges the sum of its parts', () => {
  const { g, st } = town(), { villa } = captureVilla(st(), AREA, { name: 'Huerto' });
  const saved = saveVilla(g, villa); assert.ok(saved.ok); assert.equal(saved.id, 'vl1');
  const v = getVilla(st(), { id: 'vl1' }), c0 = st().coins, n0 = Object.keys(st().buildings).length, s0 = listSegments(st()).length;
  const res = g.dispatch({ type: CMD.PlaceVilla, villa: { id: 'vl1' }, position: { x: 5, z: -7.5 }, rotation: Math.PI / 2 });
  assert.ok(res.ok, res.reason);
  const grp = groupsOf(st())[res.groupId];
  assert.equal(grp.members.length, 3); assert.ok(grp.segments.length >= 1);
  assert.equal(Object.keys(st().buildings).length, n0 + 3); assert.ok(listSegments(st()).length > s0);
  assert.equal(c0 - st().coins, res.cost); assert.ok(Math.abs(res.cost - villaCost(st(), v)) <= 2, `charged ${res.cost}, estimated ${villaCost(st(), v)}`);
  const cottage = st().buildings[grp.members[0]], want = toWorld({ position: { x: 5, z: -7.5 }, rotation: Math.PI / 2 }, v.items[0].position);
  assert.deepEqual(cottage.position, want); assert.equal(cottage.rotation, normAngle(v.items[0].rotation + Math.PI / 2)); assert.equal(cottage.group, res.groupId);
  assert.ok(res.events.some(e => e.type === 'villa_placed') && res.events.filter(e => e.type === 'coins_changed').length === 1);
});

test('all or nothing: if one item does not fit, the town does not change at all', () => {
  const { g, st } = town(); saveVilla(g, captureVilla(st(), AREA, { name: 'X' }).villa);
  assert.ok(g.dispatch({ type: CMD.Place, buildingType: 'tree', position: { x: 8.5, z: -6.5 }, rotation: 0, autoFace: false }).ok); // where the flowerbed would go
  const before = snapshot(st());
  const res = g.dispatch({ type: CMD.PlaceVilla, villa: { id: 'vl1' }, position: { x: 7, z: -7.5 }, rotation: 0 });
  assert.equal(res.ok, false); assert.equal(res.reason, 'blocked'); assert.equal(res.itemId, 3, 'the rejection names the item');
  assert.equal(snapshot(st()), before);
  const poor = town(); saveVilla(poor.g, captureVilla(poor.st(), AREA, { name: 'X' }).villa); poor.st().coins = 50; // enough for the tree, not for the whole villa
  const b2 = snapshot(poor.st()), r2 = poor.g.dispatch({ type: CMD.PlaceVilla, villa: { id: 'vl1' }, position: { x: 5, z: -7.5 } });
  assert.equal(r2.reason, 'notEnough'); assert.equal(snapshot(poor.st()), b2, 'not even the items it could afford');
});

test('seed variants: copies differ when asked, and repeat exactly otherwise; placing is deterministic', () => {
  const run = variants => { const { g, st } = town(); saveVilla(g, captureVilla(st(), AREA, { name: 'S', variants }).villa);
    const a = g.dispatch({ type: CMD.PlaceVilla, villa: { id: 'vl1' }, position: { x: 5, z: -7.5 }, seed: 11 }), b = g.dispatch({ type: CMD.PlaceVilla, villa: { id: 'vl1' }, position: { x: 5, z: 4.5 }, seed: 12 });
    const seeds = id => groupsOf(st())[id].members.map(m => st().buildings[m].seed); return { a: seeds(a.groupId), b: seeds(b.groupId), st: snapshot(st()) }; };
  const plain = run(false), varied = run(true);
  assert.deepEqual(plain.a, plain.b, 'without variants every copy looks the same');
  assert.notDeepEqual(varied.a, varied.b, 'with variants each copy differs');
  assert.equal(run(true).st, varied.st, 'same commands, same town');
});

test('a placed villa moves and turns as one piece: same buildings, paths rebuilt free, all or nothing', () => {
  const { g, st } = town(); saveVilla(g, captureVilla(st(), AREA, { name: 'M' }).villa);
  const { groupId } = g.dispatch({ type: CMD.PlaceVilla, villa: { id: 'vl1' }, position: { x: 5, z: -7.5 } });
  const grp = () => groupsOf(st())[groupId], first = st().buildings[grp().members[0]];
  g.dispatch({ type: CMD.Upgrade, id: first.id }); const tier = st().buildings[first.id].tier, c0 = st().coins;
  const res = g.dispatch({ type: CMD.MoveGroup, id: groupId, position: { x: 4, z: 6 }, rotation: Math.PI });
  assert.ok(res.ok, res.reason);
  assert.equal(st().coins, c0, 'moving costs nothing'); assert.equal(st().buildings[first.id].tier, tier, 'tiers survive');
  assert.deepEqual(grp().position, { x: 4, z: 6 }); assert.equal(grp().rotation, Math.PI);
  for (const id of grp().segments) for (const p of segmentPolyline(st(), st().roads.segments[id])) assert.ok(p.z > 3, 'the path came along');
  const before = snapshot(st()), bad = g.dispatch({ type: CMD.MoveGroup, id: groupId, position: { x: 0, z: 0 } }); // onto the café
  assert.equal(bad.ok, false); assert.equal(snapshot(st()), before);
});

test('updating to a newer version, demolishing, ungrouping; definitions in use cannot be deleted', () => {
  const { g, st } = town(); saveVilla(g, captureVilla(st(), AREA, { name: 'U' }).villa);
  const { groupId } = g.dispatch({ type: CMD.PlaceVilla, villa: { id: 'vl1' }, position: { x: 5, z: -7.5 } });
  const v2 = JSON.parse(JSON.stringify(getVilla(st(), { id: 'vl1' }))); v2.items.push({ id: v2.nextItemId, kind: 'building', type: 'bench', position: { x: 2.4, z: -1.8 }, rotation: 0, seed: 1 });
  assert.equal(saveVilla(g, v2).version, 2);
  assert.equal(g.dispatch({ type: CMD.DeleteVilla, id: 'vl1' }).reason, 'inUse');
  const up = g.dispatch({ type: CMD.UpdateGroup, id: groupId, version: 2 }); assert.ok(up.ok, up.reason);
  assert.equal(groupsOf(st())[groupId].members.length, 4); assert.deepEqual(groupsOf(st())[groupId].villa, { id: 'vl1', version: 2 });
  const copy = g.dispatch({ type: CMD.PlaceVilla, villa: { id: 'vl1' }, position: { x: 5, z: 6 } }).groupId;
  const members = [...groupsOf(st())[copy].members];
  assert.ok(g.dispatch({ type: CMD.Ungroup, id: copy }).ok);
  assert.ok(members.every(id => st().buildings[id] && !st().buildings[id].group), 'ungrouped buildings stay as ordinary ones');
  const c0 = st().coins, d = g.dispatch({ type: CMD.DemolishGroup, id: groupId });
  assert.ok(d.ok); assert.ok(st().coins > c0, 'half of what it cost comes back'); assert.equal(groupsOf(st())[groupId], undefined);
  assert.ok(g.dispatch({ type: CMD.DeleteVilla, id: 'vl1' }).ok, 'no group uses it any more');
});

test('custom designs inside villas are protected; fences never cut a street', () => {
  const { g, st } = town();
  const bp = createBlueprint({ name: 'Mía', baseType: 'cottage' }); g.dispatch({ type: CMD.SaveBlueprint, blueprint: bp });
  const v = captureVilla(st(), AREA, { name: 'F', fence: { style: 'picket', gate: 'front' } }).villa;
  v.items.push({ id: v.nextItemId++, kind: 'building', type: 'cottage', blueprint: { id: 'bp1', version: 1 }, position: { x: 1.5, z: -1.5 }, rotation: 0, seed: 3 });
  assert.ok(saveVilla(g, v).ok);
  assert.equal(g.dispatch({ type: CMD.DeleteBlueprint, id: 'bp1' }).reason, 'inUse', 'a villa uses the design');
  assert.equal(fenceRuns(getVilla(st(), { id: 'vl1' })).length, 5, 'four sides, the front split by the gate');
  const across = g.dispatch({ type: CMD.PlaceVilla, villa: { id: 'vl1' }, position: { x: 0, z: 3.5 } }); // the town street runs along z = 1.5
  assert.equal(across.ok, false); assert.ok(['fenceRoad', 'road', 'blocked'].includes(across.reason));
  assert.ok(g.dispatch({ type: CMD.PlaceVilla, villa: { id: 'vl1' }, position: { x: 5, z: -7.5 } }).ok);
});

test('saves keep villas, groups and memberships; older saves get none; damaged groups fall back to plain buildings', () => {
  const { g, st } = town(); saveVilla(g, captureVilla(st(), AREA, { name: 'P', fence: { style: 'hedge', gate: 'left' } }).villa);
  const { groupId } = g.dispatch({ type: CMD.PlaceVilla, villa: { id: 'vl1' }, position: { x: 5, z: -7.5 } });
  const doc = JSON.parse(JSON.stringify(createSaveDocument(st()))), back = loadSave(doc);
  assert.deepEqual(back.warnings, []);
  assert.deepEqual(back.state.villas, st().villas); assert.deepEqual(back.state.groups, st().groups);
  for (const id of st().groups[groupId].members) assert.equal(back.state.buildings[id].group, groupId);
  assert.deepEqual(createSaveDocument(back.state), createSaveDocument(st()), 'round trip is stable');
  const v9 = JSON.parse(JSON.stringify(doc)); v9.v = 9; for (const k of ['villas', 'nextVillaId', 'groups', 'nextGroupId']) delete v9.game[k];
  assert.equal(migrateSave(v9).from, 9); assert.deepEqual(loadSave(v9).state.groups, {});
  const broken = JSON.parse(JSON.stringify(doc)); broken.game.villas = [];
  const r = loadSave(broken);
  assert.deepEqual(r.state.groups, {}); assert.ok(st().groups[groupId].members.every(id => r.state.buildings[id] && !r.state.buildings[id].group));
  assert.ok(r.warnings.some(w => /villa is missing/.test(w)));
});

test('previews: a dry run tells what placing or moving would do and changes nothing; saving from a group adopts the version', async () => {
  const { dryRun, groupAsVilla } = await import('../src/core/index.js');
  const { g, st } = town(); saveVilla(g, captureVilla(st(), AREA, { name: 'D' }).villa);
  const before = snapshot(st()), coins = st().coins;
  const ok = dryRun(st(), { type: CMD.PlaceVilla, villa: { id: 'vl1' }, position: { x: 5, z: -7.5 }, seed: 1 });
  assert.ok(ok.ok); assert.ok(ok.cost > 0); assert.equal(st().coins, coins); assert.equal(snapshot(st()), before);
  const bad = dryRun(st(), { type: CMD.PlaceVilla, villa: { id: 'vl1' }, position: { x: -7, z: -7.5 }, seed: 1 });
  assert.equal(bad.ok, false); assert.equal(bad.reason, 'blocked');
  const { groupId } = g.dispatch({ type: CMD.PlaceVilla, villa: { id: 'vl1' }, position: { x: 5, z: -7.5 }, seed: 1 });
  const tree = groupsOf(st())[groupId].members[1]; assert.ok(g.dispatch({ type: CMD.Demolish, id: tree }).ok);
  const now = groupAsVilla(st(), groupsOf(st())[groupId]); assert.equal(now.items.filter(i => i.kind === 'building').length, 2, 'the tree is gone');
  const res = saveVilla(g, { ...now, name: 'D sin árbol' }, { fromGroup: groupId });
  assert.equal(res.version, 2); assert.deepEqual(groupsOf(st())[groupId].villa, { id: 'vl1', version: 2 });
  assert.ok(validateVilla(st(), getVilla(st(), { id: 'vl1', version: 2 })).ok);
  assert.throws(() => dryRun(st(), { type: CMD.Ungroup, id: groupId }));
});
