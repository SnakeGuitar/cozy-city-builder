// Continuous coordinates: oriented footprints, SAT collisions, the spatial index, grid quantization and the v6 migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { canPlace, insertBuilding, removeBuilding, rectDist, autoFace, buildingAtPoint, tileToPose, poseToTile, snapToGrid, queryArea, reindex,
  makeObb, obbOverlap, obbCorners, segmentObbDistance, pointObbDistance, normAngle, quarterToAngle, footprintOf, spanOf, CMD,
  loadSave, serializeGame, createSaveDocument, migrateSave, SAVE_VERSION } from '../src/core/index.js';
import { makeState, createGame, centre, cellOf, idAtCell } from './helpers.mjs';

const pose = (x, z, rotation = 0) => ({ position: { x, z }, rotation });

test('angles normalise to [0, 2π) and quarter turns stay exact', () => {
  assert.equal(normAngle(-Math.PI / 2), 3 * Math.PI / 2); assert.equal(normAngle(5 * Math.PI / 2 + 1e-12), Math.PI / 2);
  assert.equal(normAngle(7), 7 - 2 * Math.PI); assert.deepEqual([0, 1, 2, 3].map(quarterToAngle), [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]);
});

test('SAT: oriented boxes overlap, touch or stay apart', () => {
  const a = makeObb(0, 0, 2, 1, 0);
  assert.ok(obbOverlap(a, makeObb(1.5, 0, 2, 1, 0)), 'overlapping side by side');
  assert.ok(!obbOverlap(a, makeObb(2, 0, 2, 1, 0)), 'sharing an edge is allowed');
  assert.ok(!obbOverlap(a, makeObb(2.5, 0, 2, 1, Math.PI / 4)), 'axis-aligned bounds overlap, the rotated boxes do not');
  assert.ok(obbOverlap(a, makeObb(1.6, .2, 1, 1, Math.PI / 4)), 'a rotated corner pokes in (reaches x = 0.89)');
  assert.ok(!obbOverlap(a, makeObb(1.75, .2, 1, 1, Math.PI / 4)), 'the same corner just short of it (x = 1.04)');
  assert.ok(obbOverlap(makeObb(0, 0, 1, 1, .3), makeObb(0, 0, 1, 1, 1.2)), 'same centre always overlaps');
  // a diamond whose corner sits in the gap next to a box: the bounding boxes overlap, the shapes do not
  assert.ok(!obbOverlap(makeObb(0, 0, 1, 1, 0), makeObb(1.2, 0, .4, .4, Math.PI / 4)));
  assert.equal(obbCorners(makeObb(1, 1, 2, 2, Math.PI / 2)).length, 4);
  assert.equal(pointObbDistance(a, 3, 0), 2); assert.equal(segmentObbDistance(a, { x: -3, z: 2 }, { x: 3, z: 2 }), 1.5);
  assert.equal(segmentObbDistance(a, { x: -3, z: 0 }, { x: 3, z: 0 }), 0, 'crossing');
});

test('free placement: continuous positions and any rotation; overlaps of rotated buildings are refused', () => {
  const s = makeState();
  assert.equal(canPlace(s, 'fr_trad', { x: 1.37, z: -2.21 }, 0.61), null);
  insertBuilding(s, 'fr_trad', pose(1.37, -2.21, .61), 1);
  assert.equal(canPlace(s, 'fr_trad', { x: 1.9, z: -2.2 }, 0), 'blocked', 'rotated neighbour overlaps');
  const ux = Math.cos(.61), uz = -Math.sin(.61); // the first building's local x axis
  assert.equal(canPlace(s, 'fr_trad', { x: 1.37 + ux * 1.02, z: -2.21 + uz * 1.02 }, .61), null, 'parallel and just clear');
  assert.equal(canPlace(s, 'fr_trad', { x: 1.37 + ux * .98, z: -2.21 + uz * .98 }, .61), 'blocked', 'parallel and just overlapping');
  assert.equal(canPlace(s, 'jp_trad', { x: 11.2, z: 0 }, 0), 'outside', 'hangs off the map edge');
  assert.equal(canPlace(s, 'jp_trad', { x: 10.6, z: 0 }, Math.PI / 4), 'outside', 'its rotated corners leave the map');
  assert.equal(canPlace(s, 'jp_trad', { x: 10.6, z: 0 }, 0), null);
  assert.equal(canPlace(s, 'fr_trad', { x: NaN, z: 0 }, 0), 'outside');
});

test('free placement through commands: any position and rotation, kept exactly; rotation is checked for room', () => {
  const g = createGame({ state: makeState([...centre()], { coins: 5000 }) });
  const res = g.dispatch({ type: CMD.Place, buildingType: 'fr_trad', position: { x: -3.3, z: 3.71 }, rotation: 1, autoFace: false });
  assert.ok(res.ok, res.reason);
  const b = g.getSnapshot().state.buildings[res.id];
  assert.deepEqual(b.position, { x: -3.3, z: 3.71 }); assert.equal(b.rotation, 1);
  assert.ok(g.dispatch({ type: CMD.Rotate, id: res.id, by: .2 }).ok); assert.ok(Math.abs(b.rotation - 1.2) < 1e-12);
  assert.ok(g.dispatch({ type: CMD.Move, id: res.id, position: { x: -6.05, z: 4.5 }, rotation: 2.5, autoFace: false }).ok);
  assert.deepEqual(b.position, { x: -6.05, z: 4.5 });
  // a long building squeezed between two others cannot turn
  const g2 = createGame({ state: makeState([['fr_trad', 4, 4], ['fr_trad', 6, 4], ['cottage', 5, 4]], { coins: 5000 }) });
  const row = Object.values(g2.getSnapshot().state.buildings).find(x => x.type === 'cottage');
  assert.ok(g2.dispatch({ type: CMD.Rotate, id: row.id, by: Math.PI / 4 }).reason === 'blocked', 'a 45° turn would hit the neighbours');
});

test('footprints are in world units; grid quantization covers whole cells', () => {
  assert.deepEqual(footprintOf('jp_trad'), { width: 2, depth: 2, clearance: 0 }); assert.deepEqual(spanOf('fr_trad'), { w: 1, d: 1 });
  const s = makeState();
  assert.deepEqual(tileToPose(s, 'jp_trad', 4, 5, 1), { position: { x: -7, z: -6 }, rotation: Math.PI / 2 });
  assert.deepEqual(poseToTile(s, 'jp_trad', { x: -7, z: -6 }, Math.PI / 2), { x: 4, y: 5 });
  const g = snapToGrid(s, 'fr_trad', { x: .31, z: -2.8 }, 1.4);
  assert.deepEqual(g, { position: { x: .5, z: -2.5 }, rotation: Math.PI / 2, tile: { x: 12, y: 9, r: 1 } });
});

test('lot distance equals the original tile metric for grid buildings', () => {
  const s = makeState();
  const B = (type, x, y) => ({ type, ...tileToPose(s, type, x, y, 0) });
  const a = B('jp_trad', 4, 4);
  assert.equal(rectDist(a, B('tree', 5, 5)), 0, 'overlapping');
  assert.equal(rectDist(a, B('tree', 6, 5)), 1, 'edge neighbour');
  assert.equal(rectDist(a, B('tree', 7, 5)), 2);
  assert.equal(rectDist(a, B('tree', 8, 9)), 4, 'Chebyshev: max of dx, dy');
  assert.equal(rectDist(a, B('market', 1, 1)), 2);
  assert.equal(rectDist(B('tree', 7, 5), a), 2, 'symmetric');
  const ext = .5 * (Math.cos(.3) + Math.sin(.3)); // half extent of a turned 1×1 lot
  assert.ok(Math.abs(rectDist(a, { type: 'tree', position: { x: -4.3, z: -6.5 }, rotation: .3 }) - (1 + (-4.3 - ext + 6))) < 1e-12, 'free buildings measure by their lot');
});

test('spatial index: queries see every building near an area and stay in step with insert, move and remove', () => {
  const s = makeState(), ids = [];
  for (let i = 0; i < 40; i++) ids.push(insertBuilding(s, 'tree', pose(-10 + (i % 8) * 2.5, -10 + Math.floor(i / 8) * 2.5, i * .3), i).id);
  for (let i = 0; i < 40; i++) { const b = s.buildings[ids[i]]; assert.ok(queryArea(s, { minX: b.position.x, maxX: b.position.x, minZ: b.position.z, maxZ: b.position.z }).includes(b.id)); }
  const near = queryArea(s, { minX: -10.2, maxX: -9.8, minZ: -10.2, maxZ: -9.8 });
  assert.ok(near.length < 6, 'a small area returns a few candidates, not all 40');
  removeBuilding(s, s.buildings[ids[0]]);
  assert.equal(buildingAtPoint(s, -10, -10), null);
  const fresh = reindex(JSON.parse(JSON.stringify({ ...s, spatial: {} }))).spatial;
  assert.deepEqual(fresh, s.spatial, 'incremental index equals a rebuilt one');
});

test('auto-facing picks the quarter turn with most road in front', () => {
  const s = makeState([['road', 3, 7], ['road', 4, 7]]);
  assert.equal(autoFace(s, 'jp_trad', tileToPose(s, 'jp_trad', 3, 5).position, quarterToAngle(3)), 0, 'road below (+z) → front faces 0');
  assert.equal(autoFace(s, 'fr_trad', tileToPose(s, 'fr_trad', 9, 9).position, Math.PI), Math.PI, 'no road keeps the fallback');
});

test('old saves keep every building, id and exact drawn position (cells → world pose)', () => {
  const s = makeState([...centre(), ['jp_trad', 6, 14, 2, 77], ['bakery', 8, 14, 1, 5], ['market', 14, 9, 3, 9]]);
  // the same town as a v5 document (grid fields)
  const v5 = { v: 5, mode: 'normal', ui: {}, game: { ...serializeGame(s), buildings: Object.values(s.buildings).map(b => { const c = cellOf(s, b); return { id: b.id, type: b.type, tier: 1, x: c.x, y: c.y, r: c.r, seed: b.seed }; }) } };
  const { state, from, warnings } = loadSave(JSON.parse(JSON.stringify(v5)));
  assert.equal(from, 5); assert.deepEqual(warnings, []);
  assert.deepEqual(Object.keys(state.buildings), Object.keys(s.buildings));
  for (const b of Object.values(s.buildings)) {
    const m = state.buildings[b.id];
    assert.deepEqual(m.position, b.position, `${b.type} position`); assert.equal(m.rotation, b.rotation, `${b.type} rotation`);
  }
  // what the old renderer drew: tile centre x − 12 + s/2, rotation r · π/2
  const jp = Object.values(state.buildings).find(b => b.type === 'jp_trad');
  assert.deepEqual(jp.position, { x: 6 - 12 + 1, z: 14 - 12 + 1 }); assert.equal(jp.rotation, Math.PI);
  assert.equal(migrateSave(v5).doc.v, SAVE_VERSION);
  const doc = JSON.parse(JSON.stringify(createSaveDocument(state)));
  assert.ok(doc.game.buildings.every(b => b.position && Number.isFinite(b.rotation) && b.x === undefined), 'v6 stores poses only');
  assert.equal(idAtCell(state, 6, 14), jp.id);
});
