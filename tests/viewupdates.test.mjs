// What the renderer redraws for a batch of core events (presentation/viewUpdates.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { planViewUpdates } from '../src/presentation/viewUpdates.js';
import { createGame, newGameState } from '../src/application/game.js';
import { buildBenchmarkTown } from '../src/application/benchmark.js';
import { CMD } from '../src/core/index.js';

// Regression: a new game and commands in the same frame drew every building twice (the rebuild already contained them).
test('a state replacement in a batch redraws once and applies none of that batch\'s structural events again', () => {
  const g = createGame({ state: newGameState('sandbox', { preset: 'plains', seed: 1, size: 24 }) });
  g.replaceState(newGameState('sandbox', { preset: 'plains', seed: 1, size: 24 }), 'new');
  buildBenchmarkTown(g);
  const events = g.drainEvents(), plan = planViewUpdates(events, g.getSnapshot().state);
  assert.ok(events.filter(e => e.type === 'building_placed').length > 50, 'the batch is full of placements');
  assert.equal(plan.rebuild, true); assert.deepEqual(plan.ops, []);
});

test('ordinary batches: ops in order, roads and overlays flagged, vanished buildings skipped', () => {
  const g = createGame({ state: newGameState('sandbox') }); g.drainEvents();
  const a = g.dispatch({ type: CMD.Place, buildingType: 'fr_trad', position: { x: 2, z: 2 }, rotation: 0 });
  g.dispatch({ type: CMD.Upgrade, id: a.id });
  const b = g.dispatch({ type: CMD.Place, buildingType: 'tree', position: { x: -3, z: 2 }, rotation: 0 });
  g.dispatch({ type: CMD.Demolish, id: b.id });
  g.dispatch({ type: CMD.BuildRoad, points: [{ x: -6, z: 5 }, { x: 6, z: 5 }], style: 'road' });
  const plan = planViewUpdates(g.drainEvents(), g.getSnapshot().state);
  assert.deepEqual(plan.ops, [{ op: 'add', id: a.id }, { op: 'upgrade', id: a.id }, { op: 'remove', id: b.id }], 'the tree placed and removed in one batch is only removed');
  assert.equal(plan.roads, true); assert.equal(plan.occupancy, true); assert.equal(plan.rebuild, false);
});
