// The road graph: drawing straight and curved roads, joining ends, intersections, connectivity, editing, saving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CMD, DEFS, planRoad, curvePoints, polylineLength, closestOnPolyline, segmentPolyline, listSegments, listNodes, computeDerived,
  createSaveDocument, loadSave, serializeGame, normalizeRoads, canPlace, nearestRoadPoint, roadCostOf, segmentsAt } from '../src/core/index.js';
import { makeState, createGame, ALL_GOALS } from './helpers.mjs';

const game = (over = {}, extra = []) => createGame({ state: makeState(extra, { coins: 5000, goalsDone: ALL_GOALS, ...over }) });
const road = (g, points, style = 'road_asphalt') => g.dispatch({ type: CMD.BuildRoad, points, style });
const snap = g => g.getSnapshot().state;

test('curves: a Catmull-Rom centre line passes through its control points and stays smooth', () => {
  const pts = [{ x: 0, z: 0 }, { x: 3, z: 2 }, { x: 6, z: 0 }];
  const pl = curvePoints(pts);
  for (const p of pts) assert.ok(closestOnPolyline(pl, p.x, p.z).d < 1e-9, 'passes through');
  for (let i = 1; i < pl.length; i++) assert.ok(Math.hypot(pl[i].x - pl[i - 1].x, pl[i].z - pl[i - 1].z) <= .35, 'sampled finely');
  for (let i = 2; i < pl.length; i++) { // no kinks: consecutive directions turn gently
    const a = Math.atan2(pl[i - 1].z - pl[i - 2].z, pl[i - 1].x - pl[i - 2].x), b = Math.atan2(pl[i].z - pl[i - 1].z, pl[i].x - pl[i - 1].x);
    assert.ok(Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a))) < .35, `smooth at ${i}`);
  }
  assert.ok(Math.abs(polylineLength(curvePoints([{ x: 0, z: 0 }, { x: 3, z: 4 }])) - 5) < 1e-9, 'two points: straight');
});

test('straight, diagonal and curved roads; cost by length', () => {
  const g = game();
  const a = road(g, [{ x: -6, z: -6 }, { x: -1, z: -6 }]);
  assert.ok(a.ok, a.reason); assert.equal(a.segmentIds.length, 1); assert.equal(a.nodeIds.length, 2);
  assert.equal(a.events[0].cost, roadCostOf('road_asphalt', 5)); assert.equal(snap(g).coins, 5000 - 40);
  const d = road(g, [{ x: -6, z: 2 }, { x: -2, z: 6 }], 'road_dirt'); assert.ok(d.ok, 'diagonal');
  const c = road(g, [{ x: 2, z: -6 }, { x: 5, z: -2 }, { x: 8, z: -6 }], 'road_avenue');
  assert.ok(c.ok, c.reason);
  const seg = snap(g).roads.segments[c.segmentIds[0]];
  assert.deepEqual(seg.controlPoints, [{ x: 5, z: -2 }]); assert.equal(seg.width, DEFS.road_avenue.road.width); assert.equal(seg.style, 'road_avenue');
  assert.ok(polylineLength(segmentPolyline(snap(g), seg)) > 8, 'the curve is longer than its chord');
});

test('road ends join nearby nodes; an end on a road splits it (T junction)', () => {
  const g = game();
  road(g, [{ x: -6, z: 0 }, { x: 6, z: 0 }]);
  const t = road(g, [{ x: .1, z: 5 }, { x: .05, z: .3 }]); // ends on the middle of the first road
  assert.ok(t.ok, t.reason);
  const s = snap(g), junction = listNodes(s).find(n => segmentsAt(s, n.id).length === 3);
  assert.ok(junction, 'a three-way node'); assert.ok(Math.abs(junction.position.z) < 1e-9 && Math.abs(junction.position.x - .05) < .05);
  assert.equal(listSegments(s).length, 3);
  const e = road(g, [{ x: 6.3, z: .2 }, { x: 6, z: 6 }]); // starts near the east end node
  assert.ok(e.ok); assert.equal(listNodes(snap(g)).filter(n => Math.abs(n.position.x - 6) < 1e-9 && Math.abs(n.position.z) < 1e-9).length, 1, 'joined, not duplicated');
});

test('crossing roads make an intersection; both roads are split there', () => {
  const g = game();
  road(g, [{ x: -6, z: 0 }, { x: 6, z: 0 }]);
  const x = road(g, [{ x: 0, z: -6 }, { x: 0, z: 6 }]);
  assert.ok(x.ok, x.reason);
  const s = snap(g), cross = listNodes(s).find(n => segmentsAt(s, n.id).length === 4);
  assert.ok(cross, 'a four-way intersection'); assert.ok(Math.hypot(cross.position.x, cross.position.z) < 1e-6);
  assert.equal(listSegments(s).length, 4);
  // a curved road crossing two others
  const c = road(g, [{ x: -5, z: -4 }, { x: 0, z: 3 }, { x: 5, z: -4 }], 'road_narrow');
  assert.ok(c.ok, c.reason);
  assert.ok(listNodes(snap(g)).filter(n => segmentsAt(snap(g), n.id).length === 4).length >= 3, 'every crossing is a junction');
});

test('refused roads: through buildings, along another road, off the map, too short, a loop on one node', () => {
  const g = game({}, [['jp_trad', 11, 11]]);
  assert.equal(road(g, [{ x: -3, z: 0 }, { x: 3, z: 0 }]).reason, 'blocked', 'through the house in the centre');
  road(g, [{ x: -6, z: 5 }, { x: 6, z: 5 }]);
  assert.equal(road(g, [{ x: -3, z: 5.1 }, { x: 4, z: 5.05 }]).reason, 'roadOverlap');
  assert.equal(road(g, [{ x: 9, z: 9 }, { x: 13, z: 9 }]).reason, 'outside');
  assert.equal(road(g, [{ x: -8, z: -8 }, { x: -7.8, z: -8 }]).reason, 'tooShort');
  assert.equal(road(g, [{ x: -6, z: 5 }, { x: -6.1, z: 5.1 }]).reason, 'sameNode');
  assert.equal(snap(g).coins, 5000 - roadCostOf('road_asphalt', 12), 'refusals cost nothing');
  assert.equal(road(g, [{ x: 0, z: -8 }, { x: 4, z: -8 }], 'castle').reason, 'unknown');
  const poor = game({ coins: 3 });
  assert.equal(road(poor, [{ x: 0, z: -8 }, { x: 4, z: -8 }]).reason, 'notEnough');
  const locked = game({ goalsDone: [] });
  assert.equal(road(locked, [{ x: 0, z: -8 }, { x: 4, z: -8 }], 'road_avenue').reason, 'locked');
});

test('buildings cannot stand on roads; they may touch them', () => {
  const g = game();
  road(g, [{ x: -6, z: 0 }, { x: 6, z: 0 }], 'road'); // width 1: edge at z = 0.5
  const s = snap(g);
  assert.equal(canPlace(s, 'fr_trad', { x: 0, z: .9 }, 0), 'road');
  assert.equal(canPlace(s, 'fr_trad', { x: 0, z: 1 }, 0), null, 'touching the edge');
});

test('connectivity follows the graph from the café, along curves', () => {
  const g = game({}, [['cafe', 10, 8]]); // café centred at (-1, -3)
  road(g, [{ x: -1, z: -1.5 }, { x: 4, z: 2 }, { x: 9, z: 0 }], 'road');
  const s = snap(g), pl = segmentPolyline(s, listSegments(s)[0]);
  const near = pl[Math.floor(pl.length * .6)], far = { x: -8, z: -8 };
  // a house whose front edge touches the curved road, facing it
  const p = nearestRoadPoint(s, near.x, near.z + 3, 5);
  const pos = { x: p.x + p.nx * (.5 + .5 + .05), z: p.z + p.nz * (.5 + .5 + .05) };
  const res = g.dispatch({ type: CMD.Place, buildingType: 'fr_trad', position: pos, rotation: Math.atan2(-p.nx, -p.nz), autoFace: false });
  assert.ok(res.ok, res.reason);
  const lone = g.dispatch({ type: CMD.Place, buildingType: 'fr_trad', position: far, rotation: 0 });
  const d = computeDerived(snap(g));
  assert.equal(d.byId[res.id].conn, true, 'next to the curve'); assert.equal(d.byId[lone.id].conn, false);
  assert.ok(d.roads.mainSegments.length === 1 && d.roads.mainNodes.length === 2);
  // a separate road that does not reach the café is not a main road
  road(g, [{ x: -9, z: 6 }, { x: -6, z: 9 }]);
  const d2 = computeDerived(snap(g));
  assert.equal(d2.roads.mainSegments.length, 1); assert.equal(d2.byId[lone.id].conn, false);
  // joining it to the network connects whatever it serves
  road(g, [{ x: -6, z: 9 }, { x: -1, z: -1.5 }], 'road'); // as wide as the first road, so it fits next to the café
  assert.ok(computeDerived(snap(g)).roads.mainSegments.length >= 3);
});

test('grid road cells and drawn roads form one network', () => {
  const g = game({}, [['cafe', 10, 11], ['road', 10, 13], ['road', 11, 13]]);
  const r = road(g, [{ x: -.5, z: 1.5 }, { x: -.5, z: 7 }], 'road'); // starts on the second cell's centre (a wider street would touch the café)
  assert.ok(r.ok, r.reason);
  const house = g.dispatch({ type: CMD.Place, buildingType: 'fr_trad', position: { x: .5 + .05, z: 5 }, rotation: -Math.PI / 2, autoFace: false });
  assert.ok(house.ok, house.reason); assert.equal(g.getSnapshot().derived.byId[house.id].conn, true);
});

test('demolishing a segment refunds half of what it cost and drops loose ends', () => {
  const g = game();
  const r = road(g, [{ x: -6, z: 0 }, { x: 6, z: 0 }]); const coins = snap(g).coins;
  const res = g.dispatch({ type: CMD.DemolishRoad, segmentId: r.segmentIds[0] });
  assert.ok(res.ok); assert.equal(res.events[0].refund, Math.floor(roadCostOf('road_asphalt', 12) / 2));
  assert.equal(snap(g).coins, coins + res.events[0].refund);
  assert.equal(listSegments(snap(g)).length, 0); assert.equal(listNodes(snap(g)).length, 0);
  assert.equal(g.dispatch({ type: CMD.DemolishRoad, segmentId: 99 }).reason, 'missing');
  const sb = createGame({ state: makeState([], { mode: 'sandbox', coins: 0 }) });
  const rs = road(sb, [{ x: -6, z: 0 }, { x: 6, z: 0 }]); assert.ok(rs.ok); assert.equal(snap(sb).coins, 0, 'free in sandbox');
  assert.equal(sb.dispatch({ type: CMD.DemolishRoad, segmentId: rs.segmentIds[0] }).events[0].refund, 0);
});

test('editing control points reshapes a road; edits that would hit a building are refused', () => {
  const g = game({}, [['fr_trad', 16, 6]]); // a house at (4.5, -5.5)
  const r = road(g, [{ x: -6, z: 0 }, { x: 6, z: 0 }]), id = r.segmentIds[0];
  assert.ok(g.dispatch({ type: CMD.EditRoad, segmentId: id, action: 'add', position: { x: 0, z: 2 } }).ok);
  assert.deepEqual(snap(g).roads.segments[id].controlPoints, [{ x: 0, z: 2 }]);
  assert.ok(closestOnPolyline(segmentPolyline(snap(g), snap(g).roads.segments[id]), 0, 2).d < 1e-9, 'the road now bends through it');
  assert.ok(g.dispatch({ type: CMD.EditRoad, segmentId: id, action: 'move', index: 0, position: { x: 1, z: -2 } }).ok);
  assert.equal(g.dispatch({ type: CMD.EditRoad, segmentId: id, action: 'move', index: 0, position: { x: 4.5, z: -5.5 } }).reason, 'blocked');
  assert.deepEqual(snap(g).roads.segments[id].controlPoints, [{ x: 1, z: -2 }], 'a refused edit changes nothing');
  assert.ok(g.dispatch({ type: CMD.EditRoad, segmentId: id, action: 'remove', index: 0 }).ok);
  assert.deepEqual(snap(g).roads.segments[id].controlPoints, []);
});

test('preview and command agree: planRoad is what BuildRoad builds', () => {
  const g = game(); const s = snap(g), req = { points: [{ x: -5, z: -5 }, { x: 0, z: -1 }, { x: 5, z: -5 }], style: 'road_cobble' };
  const plan = planRoad(s, req), before = JSON.stringify(s);
  assert.ok(plan.ok); assert.equal(JSON.stringify(s), before, 'planning is pure');
  const res = g.dispatch({ type: CMD.BuildRoad, ...req });
  assert.equal(res.events[0].cost, plan.cost); assert.ok(Math.abs(res.events[0].length - plan.length) < 1e-9);
});

test('roads round-trip through saves; damaged road data is dropped with warnings', () => {
  const g = game();
  road(g, [{ x: -6, z: 0 }, { x: 6, z: 0 }]); road(g, [{ x: 0, z: -6 }, { x: 2, z: 0 }, { x: 0, z: 6 }], 'road_japanese');
  const doc = JSON.parse(JSON.stringify(createSaveDocument(snap(g))));
  const { state, warnings } = loadSave(doc);
  assert.deepEqual(warnings, []); assert.deepEqual(serializeGame(state), serializeGame(snap(g)));
  const a = createGame({ state }); for (let i = 0; i < 10; i++) { a.tick(); g.tick(); } assert.deepEqual(a.serialize(), g.serialize());
  const warn = []; const bad = normalizeRoads({ nodes: [{ id: 1, position: { x: 0, z: 0 } }, { id: 1, position: { x: 1, z: 1 } }, { id: 2, position: { x: 'a' } }, { id: 3, position: { x: 4, z: 0 } }],
    segments: [{ id: 1, startNodeId: 1, endNodeId: 3, style: 'nope', width: 99, controlPoints: [{ x: 2, z: 1 }, null] }, { id: 2, startNodeId: 1, endNodeId: 7 }, { id: 3, startNodeId: 3, endNodeId: 3 }] }, w => warn.push(w));
  assert.deepEqual(Object.keys(bad.nodes), ['1', '3']); assert.deepEqual(Object.keys(bad.segments), ['1']);
  assert.equal(bad.segments[1].style, 'road'); assert.equal(bad.segments[1].width, 1); assert.deepEqual(bad.segments[1].controlPoints, [{ x: 2, z: 1 }]);
  assert.ok(bad.nextNodeId > 3 && bad.nextSegmentId > 1); assert.ok(warn.length >= 4);
});

test('an empty network is safe', () => {
  const s = makeState();
  assert.equal(nearestRoadPoint(s, 0, 0, 5), null);
  const d = computeDerived(s); assert.deepEqual(d.roads, { mainNodes: [], mainSegments: [] });
  assert.deepEqual(serializeGame(s).roads, { nodes: [], segments: [], nextNodeId: 1, nextSegmentId: 1 });
});
