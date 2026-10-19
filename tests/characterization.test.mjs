// The refactored core must reproduce the pre-refactor simulation (tools/gen-golden.mjs) number for number.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SCENARIO } from './fixtures/scenario.mjs';
import { createEmptyState, insertBuilding, CMD } from '../src/core/index.js';
import { createGame } from '../src/application/game.js';

const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/characterization.golden.json', import.meta.url)));
const close = (a, b, path) => {
  if (typeof b === 'number') return assert.ok(Math.abs(a - b) < 1e-9, `${path}: ${a} != ${b}`);
  if (Array.isArray(b)) { assert.equal(a.length, b.length, `${path} length`); return b.forEach((v, i) => close(a[i], v, `${path}[${i}]`)); }
  if (b && typeof b === 'object') return Object.keys(b).forEach(k => close(a[k], b[k], `${path}.${k}`));
  assert.equal(a, b, path);
};

function run() {
  const I = SCENARIO.initial;
  const s = createEmptyState({ coins: I.coins, population: I.P, employed: I.E, demand: { ...I.dem } });
  for (const [type, x, y, r, seed] of SCENARIO.start) insertBuilding(s, type, x, y, r, seed);
  const game = createGame({ state: s });
  const out = [];
  for (const step of SCENARIO.steps) {
    for (let i = 0; i < (step.tick || 0); i++) game.tick();
    for (const [type, x, y, r, seed] of step.place || []) { const res = game.dispatch({ type: CMD.Place, buildingType: type, x, y, r, seed, autoFace: false }); assert.ok(res.ok, `${type}@${x},${y}: ${res.reason}`); }
    for (const [x, y] of step.demolish || []) { const id = s.grid[y * 24 + x]; assert.ok(game.dispatch({ type: CMD.Demolish, id }).ok); }
    if (step.check) out.push({ label: step.check, snap: structuredClone(game.getSnapshot()) });
  }
  return out;
}

test('refactored simulation matches the recorded pre-refactor behaviour', () => {
  const got = run();
  assert.equal(got.length, golden.length);
  golden.forEach((g, i) => {
    const { state, derived } = got[i].snap, c = derived.city, L = g.label;
    close(state.population, g.P, `${L} P`); close(state.employed, g.E, `${L} E`); close(state.coins, g.coins, `${L} coins`);
    close(state.demand, g.dem, `${L} demand`); assert.deepEqual(state.goalsDone, g.done, `${L} goals`);
    close({ Rcap: c.Rcap, homeless: c.homeless, J: c.J, W: c.W, PP: c.PP, shopCap: c.shopCap, goodsNeed: c.goodsNeed, prod: c.prod, sold: c.sold, exported: c.exported,
      income: c.income, upkeep: c.upkeep, net: c.net, well: c.well, svcScore: c.svcScore, utilMin: c.utilMin, vacantHomes: c.vacantHomes, vacantShops: c.vacantShops,
      idleInd: c.idleInd, util: c.util, target: c.target, reasons: c.reasons, attract: c.attract }, g.city, `${L} city`);
    for (const gb of g.buildings) {
      const b = derived.byId[gb.id]; assert.ok(b, `${L} building ${gb.id}`);
      assert.equal(b.type, gb.type); assert.equal(b.conn, gb.conn, `${L} #${gb.id} conn`);
      close(b.staff, gb.staff, `${L} #${gb.id} staff`); close(b.wellB, gb.wellB, `${L} #${gb.id} wellB`); close(b.mult, gb.mult, `${L} #${gb.id} mult`);
      if (b.kind === 'house') { close(b.occ, gb.occ, `${L} #${gb.id} occ`); close(b.well, gb.well, `${L} #${gb.id} well`); }
      if (b.kind === 'shop') { close(b.cust, gb.cust, `${L} #${gb.id} cust`); close(b.inc, gb.inc, `${L} #${gb.id} inc`); assert.equal(b.open, gb.open, `${L} #${gb.id} open`); }
      if (b.kind === 'industry') { close(b.prod, gb.prod, `${L} #${gb.id} prod`); close(b.inc, gb.inc, `${L} #${gb.id} inc`); }
      if (b.served) { close(b.load, gb.load, `${L} #${gb.id} load`); assert.deepEqual(b.served, gb.served, `${L} #${gb.id} served`); }
    }
  });
});
