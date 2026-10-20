// Records tests/fixtures/save-v4.json (+ .expected.json) with the ORIGINAL rules, before roads became a graph.
// It extracts src/ at commit dfb796b (the last version with grid road cells) into a temporary folder and runs it:
//   node tools/make-v4-fixture.mjs
// The road-migration test loads the save with today's code and expects the same connections and economy.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'villa-v4-'));
execFileSync('sh', ['-c', `git -C "${root}" archive dfb796b src | tar -x -C "${tmp}"`]);
const core = await import(path.join(tmp, 'src/core/index.js'));
const { createGame } = await import(path.join(tmp, 'src/application/game.js'));
const s = core.createEmptyState({ coins: 2500, population: 30, employed: 12, demand: { r: 10, c: 5, i: 0 }, goalsDone: ['g0', 'g0b', 'g1', 'g2', 'g3', 'g4'], rngSeed: 99 });
const g = createGame({ state: s });
const P = (t, x, y, r = 0) => { const res = g.dispatch({ type: core.CMD.Place, buildingType: t, x, y, r, seed: x * 31 + y, autoFace: false }); if (!res.ok) throw new Error(`${t} ${x},${y}: ${res.reason}`); return res.id; };
P('cafe', 10, 9);
for (let x = 4; x <= 17; x++) P('road', x, 11);          // main street (east–west)
for (let y = 12; y <= 18; y++) P('road', 10, y);         // T junction going south from (10,11)
for (let x = 6; x <= 14; x++) if (x !== 10) P('road', x, 15); // crossroads at (10,15)
for (let y = 12; y <= 14; y++) P('road', 17, y);         // L bend at (17,11) → south
P('road', 18, 14); P('road', 19, 14);                     // and east again (second bend)
P('road', 2, 20);                                         // an isolated cell, far away
// homes and shops along the streets, some touching a road only at a corner
P('fr_trad', 5, 12); P('jp_trad', 7, 12); P('bakery', 9, 12); P('mx_cont', 11, 12, 2); P('us_trad', 12, 12);
P('fr_cont', 11, 16); P('jp_cont', 9, 16); P('market', 12, 16); P('workshop', 15, 16); P('fr_trad', 18, 12);
P('fr_trad', 15, 14);  // touches road (15,15) below — connected
P('fr_cont', 16, 16);  // touches only the corner of road (15,15) — not connected
P('tree', 3, 21); P('garden', 6, 9); P('lamp', 8, 10);
P('school', 13, 8);
for (let i = 0; i < 40; i++) g.tick();
const { state } = g.getSnapshot(), derived = core.computeDerived(state); // a plain snapshot, as a freshly loaded town computes it
const doc = core.createSaveDocument(state, { tab: 'paths' });
if (doc.v !== 4) throw new Error('expected a v4 document, got ' + doc.v);
const roadsAt = []; for (const b of Object.values(state.buildings)) if (b.type === 'road') roadsAt.push([b.x, b.y]);
const expected = {
  note: 'Recorded with the original rules (commit dfb796b) by tools/make-v4-fixture.mjs. Do not edit.',
  roadCells: roadsAt.sort((a, b) => a[1] - b[1] || a[0] - b[0]),
  mainRoads: derived.roads.mainRoads.length,
  conn: Object.fromEntries(Object.values(derived.byId).map(r => [r.id, r.conn])),
  city: { Rcap: derived.city.Rcap, J: derived.city.J, PP: derived.city.PP, net: derived.city.net, well: derived.city.well, upkeep: derived.city.upkeep },
  afterTicks: null,
};
for (let i = 0; i < 60; i++) g.tick();
expected.afterTicks = { ticks: 60, population: g.getSnapshot().state.population, coins: g.getSnapshot().state.coins, employed: g.getSnapshot().state.employed };
fs.writeFileSync(root + 'tests/fixtures/save-v4.json', JSON.stringify(doc));
fs.writeFileSync(root + 'tests/fixtures/save-v4.expected.json', JSON.stringify(expected, null, 1));
console.log('ok', Object.keys(state.buildings).length, 'records,', roadsAt.length, 'road cells; main', expected.mainRoads, 'conn', JSON.stringify(expected.conn));
fs.rmSync(tmp, { recursive: true, force: true });
