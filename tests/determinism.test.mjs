import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDerived, CMD } from '../src/core/index.js';
import { createGame, newGameState } from '../src/application/game.js';

function play() {
  const g = createGame({ state: newGameState() });
  const log = [];
  const cmds = [[CMD.Place, 'jp_cont', 12, 14], [CMD.Place, 'us_trad', 14, 14], [CMD.Place, 'bakery', 8, 14], [CMD.Place, 'road', 18, 13]];
  for (const [type, buildingType, x, y] of cmds) { g.dispatch({ type, buildingType, x, y }); for (let i = 0; i < 25; i++) g.step(.37); }
  g.dispatch({ type: CMD.SetSpeed, speed: 3 });
  for (let i = 0; i < 100; i++) g.step(.05);
  log.push(...g.drainEvents());
  return { save: g.serialize(), log };
}

test('same state, same commands, same steps → identical results and events', () => {
  const a = play(), b = play();
  assert.deepEqual(a.save, b.save);
  assert.deepEqual(a.log, b.log);
});

test('frame rate does not change the outcome: 60 × 1 s equals 1200 × 0.05 s', () => {
  const g1 = createGame({ state: newGameState() }), g2 = createGame({ state: newGameState() });
  for (let i = 0; i < 60; i++) g1.step(1);
  for (let i = 0; i < 1200; i++) g2.step(.05);
  const a = g1.serialize(), b = g2.serialize();
  assert.ok(Math.abs(a.clock.time - b.clock.time) < 1e-9); delete a.clock; delete b.clock;
  assert.deepEqual(a, b);
});

test('computing a snapshot does not alter the state', () => {
  const g = createGame({ state: newGameState() });
  for (let i = 0; i < 40; i++) g.tick();
  const { state } = g.getSnapshot();
  const before = JSON.stringify(state);
  computeDerived(state); computeDerived(state, { mode: 'tick' }); g.getSnapshot();
  assert.equal(JSON.stringify(state), before);
});

test('core never calls Math.random', () => {
  const orig = Math.random; Math.random = () => { throw new Error('Math.random used by the core'); };
  try { play(); } finally { Math.random = orig; }
});

test('the structural cache never changes a result: cached and fresh snapshots agree through edits', async () => {
  const { buildBenchmarkTown } = await import('../src/application/benchmark.js');
  const g = createGame({ state: newGameState('sandbox', { preset: 'plains', seed: 3, size: 24 }) });
  buildBenchmarkTown(g);
  const fresh = () => computeDerived(structuredClone(g.getSnapshot().state)); // a copy has no cache entry
  for (let i = 0; i < 5; i++) g.tick();
  assert.deepEqual(computeDerived(g.getSnapshot().state), fresh());
  const s = g.getSnapshot().state, b = Object.values(s.buildings).find(x => x.type === 'fr_trad');
  g.dispatch({ type: CMD.Demolish, id: b.id });
  assert.deepEqual(computeDerived(g.getSnapshot().state), fresh(), 'after a demolition');
  g.dispatch({ type: CMD.BuildRoad, points: [{ x: -11, z: -11.4 }, { x: 11, z: -11.4 }], style: 'road_dirt' });
  assert.deepEqual(computeDerived(g.getSnapshot().state), fresh(), 'after a new road');
});
