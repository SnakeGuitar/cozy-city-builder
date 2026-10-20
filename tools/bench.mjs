// Simulation benchmark: builds the benchmark town on a 40 × 40 sandbox map and times commands, snapshots and ticks.
//   node tools/bench.mjs
import { createGame, newGameState } from '../src/application/game.js';
import { buildBenchmarkTown } from '../src/application/benchmark.js';
import { computeDerived, createSaveDocument, loadSave } from '../src/core/index.js';

const ms = f => { const t0 = performance.now(); const r = f(); return [performance.now() - t0, r]; };
for (const preset of ['classic', 'plains', 'mixed']) {
  const [tNew, state] = ms(() => newGameState('sandbox', preset === 'classic' ? null : { preset, seed: 7, size: 40 }));
  const g = createGame({ state });
  const [tBuild, town] = ms(() => buildBenchmarkTown(g));
  const s = g.getSnapshot().state;
  const [tDerive] = ms(() => { for (let i = 0; i < 20; i++) computeDerived(s); });
  const [tTick] = ms(() => { for (let i = 0; i < 60; i++) g.tick(); });
  const [tSave, doc] = ms(() => JSON.stringify(createSaveDocument(s)));
  const [tLoad] = ms(() => loadSave(JSON.parse(doc)));
  console.log(`${preset.padEnd(8)} map ${tNew.toFixed(0)}ms · town ${town.buildings} buildings, ${town.segments} road segments (${tBuild.toFixed(0)}ms, ${town.rejected} refused) · snapshot ${(tDerive / 20).toFixed(2)}ms · tick ${(tTick / 60).toFixed(2)}ms · save ${tSave.toFixed(1)}ms ${(doc.length / 1024).toFixed(0)}KB · load ${tLoad.toFixed(0)}ms`);
}
