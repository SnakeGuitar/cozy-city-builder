import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState, centre, derive } from './helpers.mjs';
import { BASE_SUPPLY, USE } from '../src/core/index.js';

test('use grows with residents and workplaces; supply is the village base plus utilities', () => {
  const homes = [6, 7, 8, 9].map(x => ['us_cont', x * 2 - 6, 14]);
  const s = makeState([...centre(), ...homes], { population: 20 });
  const u = derive(s).city.util;
  assert.equal(u.water.supply, BASE_SUPPLY.water);
  // 20 residents + café (a shop)
  assert.equal(u.water.use, 20 * USE.house.water + USE.shop.water);
  assert.equal(u.power.use, 20 * USE.house.power + USE.shop.power);
});

test('a shortage lowers the ratio and wellbeing; a utility building fixes it', () => {
  const homes = []; for (let x = 6; x <= 17; x++) if (x !== 11) homes.push(['fr_trad', x, 14]);
  const s = makeState([...centre(), ...homes], { population: 60 });
  const before = derive(s);
  assert.ok(before.city.ratio.water < 1);
  const wellBefore = before.city.well;
  const s2 = makeState([...centre(), ...homes, ['water', 2, 12], ['road', 4, 13], ['road', 5, 13]], { population: 60 });
  const after = derive(s2);
  assert.equal(after.city.ratio.water, 1);
  assert.ok(after.city.util.water.supply > BASE_SUPPLY.water);
  assert.ok(after.city.well > wellBefore);
});
