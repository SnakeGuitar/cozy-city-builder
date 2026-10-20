import test from 'node:test';
import assert from 'node:assert/strict';
import { CMD, computeDerived, GAME_RULES, rulesFor } from '../src/core/index.js';
import { createGame, newGameState } from '../src/application/game.js';

const place = (g, buildingType, x, y) => g.dispatch({ type: CMD.Place, buildingType, x, y, r: 0, autoFace: false });
const count = g => Object.keys(g.getSnapshot().state.buildings).length;

for (const mode of ['normal', 'sandbox']) test(`a new ${mode} game starts completely empty`, () => {
  const s = newGameState(mode);
  assert.equal(s.mode, mode);
  assert.deepEqual(s.buildings, {}); assert.ok(s.grid.every(id => id === 0));
  assert.equal(s.population, 0); assert.equal(s.nextId, 1);
  const g = createGame({ state: s });
  for (let i = 0; i < 30; i++) g.tick();
  assert.equal(count(g), 0, 'nothing appears by itself');
  assert.equal(g.getSnapshot().state.population, 0);
});

test('zero buildings and zero roads are safe: finite numbers, honest reasons, no road network', () => {
  const g = createGame({ state: newGameState('normal') });
  for (let i = 0; i < 120; i++) g.tick();
  const { state, derived } = g.getSnapshot(), c = derived.city;
  assert.equal(derived.roads.mainRoads.length, 0); assert.ok(derived.roads.reach.every(v => v === 0));
  assert.equal(derived.hasCafe, false); assert.equal(derived.empty, true);
  const nums = JSON.stringify(c).match(/-?\d+(\.\d+)?(e-?\d+)?|NaN|Infinity/g);
  assert.ok(!/NaN|Infinity/.test(JSON.stringify(c)), 'no NaN or Infinity'); assert.ok(nums.length > 10);
  assert.equal(c.PP, 0, 'no visitors without the café'); assert.equal(c.net, 0); assert.equal(state.coins, 600, 'no phantom income or upkeep');
  for (const k of ['r', 'c', 'i']) assert.deepEqual(c.reasons[k], ['dm_no_cafe']);
  assert.ok(!g.drainEvents().some(e => e.type === 'mascot_message_requested' && e.reason === 'advice'), 'no tips about an empty map');
});

test('the first café: free, unique, and the root of the road network', () => {
  const g = createGame({ state: newGameState('normal') });
  assert.equal(computeDerived(g.getSnapshot().state).roads.mainRoads.length, 0);
  assert.ok(place(g, 'road', 10, 13).ok, 'a road may exist before the café');
  assert.equal(g.getSnapshot().derived.roads.mainRoads.length, 0, 'but it is not a main road yet');
  assert.ok(place(g, 'fr_trad', 10, 14).ok);
  const house = () => Object.values(g.getSnapshot().derived.byId).find(b => b.type === 'fr_trad');
  assert.equal(house().conn, false);
  const res = place(g, 'cafe', 10, 11);
  assert.ok(res.ok); assert.equal(g.getSnapshot().state.coins, 600 - 5 - 110 + 50 + 50, 'café costs 0; g0 and g0b pay 50 each');
  assert.equal(g.getSnapshot().derived.roads.mainRoads.length, 1);
  assert.equal(house().conn, true, 'house → road → café');
  assert.equal(place(g, 'cafe', 2, 2).reason, 'unique', 'a second café is refused');
  assert.equal(Object.values(g.getSnapshot().state.buildings).filter(b => b.type === 'cafe').length, 1);
});

test('loading never inserts a café into a v4 game, even an empty one', async () => {
  const { createSaveDocument, loadSave } = await import('../src/core/index.js');
  const doc = JSON.parse(JSON.stringify(createSaveDocument(newGameState('normal'))));
  const { state, warnings } = loadSave(doc);
  assert.deepEqual(state.buildings, {}); assert.deepEqual(warnings, []);
});

test('sandbox: unlimited money, everything unlocked, no costs, refunds or goals', () => {
  const g = createGame({ state: newGameState('sandbox') });
  assert.deepEqual(g.rules(), GAME_RULES.sandbox);
  const coins = g.getSnapshot().state.coins;
  assert.ok(place(g, 'cafe', 10, 11).ok);
  for (let x = 6; x <= 17; x++) place(g, 'road', x, 13);
  for (const [t, x, y] of [['school', 2, 14], ['cannery', 6, 14], ['distribution', 14, 14], ['plaza', 18, 14], ['market', 8, 9]]) assert.ok(place(g, t, x, y).ok, t);
  assert.equal(g.getSnapshot().state.coins, coins, 'building costs nothing');
  const market = Object.values(g.getSnapshot().state.buildings).find(b => b.type === 'market');
  const res = g.dispatch({ type: CMD.Demolish, id: market.id });
  assert.ok(res.ok); assert.equal(res.events[0].refund, 0); assert.equal(g.getSnapshot().state.coins, coins);
  for (let i = 0; i < 200; i++) g.tick();
  const { state, derived } = g.getSnapshot();
  assert.equal(state.coins, coins, 'upkeep never drains sandbox money');
  assert.ok(derived.city.upkeep > 0, 'the simulation still runs');
  assert.deepEqual(state.goalsDone, [], 'goals are off');
  assert.ok(g.unlocked().has('distribution') && g.unlocked().has('plaza') && g.unlocked().has('school'));
});

test('normal games get none of the sandbox privileges', () => {
  const g = createGame({ state: newGameState('normal') });
  assert.equal(g.rules().unlimitedMoney, false);
  assert.equal(place(g, 'school', 2, 2).reason, 'locked');
  place(g, 'cafe', 10, 11);
  const s = g.getSnapshot().state; s.coins = 50;
  assert.equal(place(g, 'us_cont', 2, 2).reason, 'notEnough');
  assert.ok(place(g, 'road', 10, 13).ok); assert.equal(g.getSnapshot().state.coins, 45);
});
