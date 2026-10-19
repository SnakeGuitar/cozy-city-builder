import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState, centre, createGame } from './helpers.mjs';

test('population grows gradually into connected homes and stops at capacity', () => {
  const g = createGame({ state: makeState([...centre(), ['fr_trad', 8, 14], ['mx_cont', 12, 14]], { population: 2, employed: 0, coins: 500 }) });
  let prev = 2;
  for (let i = 0; i < 40; i++) { g.tick(); const P = g.getSnapshot().state.population; assert.ok(P - prev <= .4 + 1e-9, 'never jumps'); prev = P; }
  const { state, derived } = g.getSnapshot();
  assert.ok(state.population <= derived.city.Rcap + 1e-9);
  assert.equal(derived.city.Rcap, 11);
});

test('residents leave slowly when homes disappear', () => {
  const g = createGame({ state: makeState([...centre(), ['mx_trad', 6, 14], ['fr_trad', 8, 14]], { population: 15, employed: 0 }) });
  const id = Object.values(g.getSnapshot().state.buildings).find(b => b.type === 'mx_trad').id;
  g.dispatch({ type: 'DemolishBuilding', id });
  g.tick();
  const { state, derived } = g.getSnapshot();
  assert.equal(derived.city.Rcap, 6);
  assert.ok(state.population > 14, 'only 0.5 residents leave per tick');
  assert.ok(derived.city.homeless > 0);
});

test('demand eases toward targets and explains itself', () => {
  const g = createGame({ state: makeState([...centre(), ['fr_trad', 8, 14]], { population: 6, employed: 0, demand: { r: 0, c: 0, i: 0 } }) });
  g.tick();
  const { state, derived } = g.getSnapshot();
  for (const k of ['r', 'c', 'i']) {
    assert.ok(Math.abs(state.demand[k] - derived.city.target[k] * .08) < 1e-9, `${k} moves 8 % per tick`);
    assert.ok(derived.city.reasons[k].length >= 1 && derived.city.reasons[k].length <= 2);
    assert.ok(Math.abs(derived.city.target[k]) <= 100);
  }
  assert.ok(derived.city.reasons.r.includes('rs_start'), 'a tiny town attracts newcomers');
});
