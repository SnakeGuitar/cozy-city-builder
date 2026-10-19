import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDerived, ECON } from '../src/core/index.js';
import { makeState, centre, derive, createGame } from './helpers.mjs';

test('employment eases toward min(workforce, jobs) only on ticks', () => {
  const s = makeState([...centre(), ['workshop', 8, 14]], { population: 30, employed: 0 });
  const snap = computeDerived(s);
  assert.equal(snap.employed, 0, 'a snapshot never hires');
  assert.equal(snap.city.J, 11, 'café 5 + workshop 6');
  const t = computeDerived(s, { mode: 'tick' });
  assert.equal(t.employed, 1, 'one hire per tick');
  const g = createGame({ state: s }); for (let i = 0; i < 12; i++) g.tick();
  assert.ok(Math.abs(g.getSnapshot().state.employed - 11) < .01, 'jobs are the limit while the workforce (≥ 14) is larger');
});

test('shops share purchasing power; extra shops stand vacant', () => {
  const shops = [6, 7, 8, 9, 12, 14, 15].map(x => ['bakery', x, 14]);
  const d = derive(makeState([...centre(), ...shops], { population: 4, employed: 0 }));
  assert.ok(d.city.vacantShops > 0, 'not enough spending for 8 shops');
  const cafe = Object.values(d.byId).find(b => b.type === 'cafe');
  assert.equal(cafe.open, true, 'the café always opens first');
  const open = Object.values(d.byId).filter(b => b.kind === 'shop' && b.open);
  const served = open.reduce((a, b) => a + b.cust, 0);
  assert.ok(Math.abs(served - d.city.PP) < 1e-9, 'all purchasing power is spent when capacity exceeds it');
  assert.equal(d.city.reasons.c[0], 'cs_surplus');
});

test('industry output, local sales, exports and income', () => {
  const s = makeState([...centre(), ['workshop', 8, 14], ['cannery', 14, 14]], { population: 60, employed: 21 });
  const d = derive(s), c = d.city;
  assert.ok(c.prod > 0);
  assert.ok(Math.abs(c.sold - Math.min(c.prod, c.goodsNeed)) < 1e-9);
  assert.ok(Math.abs(c.exported - (c.prod - c.sold)) < 1e-9);
  const share = c.sold / c.prod, ind = Object.values(d.byId).filter(b => b.kind === 'industry');
  for (const b of ind) assert.ok(Math.abs(b.inc - b.prod * (share * ECON.localPrice + (1 - share) * ECON.exportPrice)) < 1e-9);
  assert.ok(Math.abs(c.net - (c.income.shops + c.income.industry + c.income.tax - c.upkeep)) < 1e-9);
});

test('upkeep is charged per minute for every public building; money never goes negative', () => {
  const s = makeState([...centre(), ['school', 2, 2], ['water', 4, 4]], { coins: 0, population: 0 });
  const d = derive(s);
  assert.equal(d.city.upkeep, 19);
  const g = createGame({ state: s }); for (let i = 0; i < 5; i++) g.tick();
  assert.ok(g.getSnapshot().state.coins >= 0);
});
