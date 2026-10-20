// How the road graph is cut into drawable pieces (presentation/roadLayout.js) and how walkers use it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CMD, nearestRoadPoint, closestOnPolyline, segmentPolyline, listSegments } from '../src/core/index.js';
import { roadLayout } from '../src/presentation/roadLayout.js';
import { createWalkers } from '../src/presentation/walkers.js';
import { mulberry32 } from '../src/core/util/random.js';
import { makeState, createGame, ALL_GOALS } from './helpers.mjs';

const gaps = pts => Math.max(...pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.z - pts[i].z)));

test('a grid street with a bend is one ribbon with square pads at its dead ends', () => {
  const cells = []; for (let x = 4; x <= 9; x++) cells.push(['road', x, 6]); for (let y = 7; y <= 10; y++) cells.push(['road', 9, y]);
  const { ribbons, pads } = roadLayout(makeState(cells));
  assert.equal(ribbons.length, 1, 'the bend does not cut the street'); assert.ok(gaps(ribbons[0].points) <= .35, 'no gaps along it');
  assert.equal(pads.length, 2); assert.ok(pads.every(p => p.square && p.width === 1 && p.exits.length === 1));
  assert.ok(!ribbons[0].closedStart && !ribbons[0].closedEnd, 'the pads close the ends');
});

test('junctions get a pad; ribbons stop at its edge', () => {
  const g = createGame({ state: makeState([], { coins: 9999, goalsDone: ALL_GOALS }) });
  g.dispatch({ type: CMD.BuildRoad, points: [{ x: -6, z: 0 }, { x: 6, z: 0 }], style: 'road_asphalt' });
  g.dispatch({ type: CMD.BuildRoad, points: [{ x: 0, z: 6 }, { x: 0, z: .2 }], style: 'road_asphalt' });
  const { ribbons, pads } = roadLayout(g.getSnapshot().state);
  const j = pads.find(p => p.exits.length === 3);
  assert.ok(j && !j.square, 'a round junction pad with three exits');
  assert.ok(Math.abs(j.width / 2 - 1.1 / 2 * 1.3) < 1e-9, 'a little wider than the road');
  for (const rb of ribbons) for (const end of [rb.points[0], rb.points.at(-1)]) {
    const d = Math.hypot(end.x - j.center.x, end.z - j.center.z);
    assert.ok(d > j.width / 2 - .02, 'ribbons start at the pad edge, not inside it');
  }
  assert.equal(ribbons.length, 3); assert.ok(ribbons.every(rb => gaps(rb.points) <= .35));
});

test('a drawn curve is one smooth ribbon with end curbs', () => {
  const g = createGame({ state: makeState([], { coins: 9999, goalsDone: ALL_GOALS }) });
  g.dispatch({ type: CMD.BuildRoad, points: [{ x: -6, z: -4 }, { x: -1, z: 3 }, { x: 4, z: -2 }, { x: 8, z: 4 }], style: 'road_cobble' });
  const { ribbons, pads } = roadLayout(g.getSnapshot().state);
  assert.equal(ribbons.length, 1); assert.equal(pads.length, 0); assert.ok(ribbons[0].closedStart && ribbons[0].closedEnd);
  assert.ok(gaps(ribbons[0].points) <= .35);
});

test('walkers follow curved roads, stay on them and cross junctions', () => {
  const g = createGame({ state: makeState([], { coins: 9999, goalsDone: ALL_GOALS }) }), s = g.getSnapshot().state;
  g.dispatch({ type: CMD.BuildRoad, points: [{ x: -8, z: -4 }, { x: -2, z: 4 }, { x: 3, z: -3 }, { x: 8, z: 3 }], style: 'road' });
  g.dispatch({ type: CMD.BuildRoad, points: [{ x: 0, z: -8 }, { x: 0, z: 8 }], style: 'road' }); // crosses the curve
  const main = listSegments(s).map(x => x.id), w = createWalkers(mulberry32(7)), seen = new Set();
  let maxOff = 0;
  for (let t = 0; t < 2000; t++) for (const p of w.update(s, main, 40, .1)) {
    seen.add(p.seg);
    const r = nearestRoadPoint(s, p.x, p.z, 2); maxOff = Math.max(maxOff, r ? r.d : 9);
    const pl = segmentPolyline(s, s.roads.segments[p.seg]), lane = closestOnPolyline(pl, p.x, p.z).d;
    assert.ok(lane < .3, 'on a lane beside the centre line of its segment');
  }
  assert.equal(w.count, 20, 'the crowd follows the population');
  assert.ok(maxOff <= 1e-9, 'always on the road surface');
  assert.ok(seen.size >= 4, `they cross the junctions onto other segments (${seen.size})`);
  // same random source, same walk
  const a = createWalkers(mulberry32(3)), b = createWalkers(mulberry32(3));
  for (let i = 0; i < 50; i++) assert.deepEqual(a.update(s, main, 10, .2), b.update(s, main, 10, .2));
  assert.deepEqual(createWalkers(mulberry32(1)).update(s, [], 10, .1), [], 'no main roads, no walkers');
});
