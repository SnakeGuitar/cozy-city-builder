import test from 'node:test';
import assert from 'node:assert/strict';
import { CMD, DEFS, refundOf } from '../src/core/index.js';
import { makeState, centre, createGame, place, ALL_GOALS } from './helpers.mjs';

const game = (extra = [], over = {}) => createGame({ state: makeState([...centre(), ...extra], { coins: 1000, ...over }) });

test('place: charges the cost, emits building_placed and coins_changed', () => {
  const g = game(); g.drainEvents();
  const res = place(g, 'fr_trad', 8, 14);
  assert.ok(res.ok);
  const { state } = g.getSnapshot();
  assert.equal(state.coins, 1000 - DEFS.fr_trad.cost);
  const ev = g.drainEvents();
  assert.deepEqual(ev.slice(0, 2).map(e => e.type), ['building_placed', 'coins_changed']);
  assert.equal(ev[0].id, res.id);
  assert.ok(ev.every(e => JSON.stringify(e) === JSON.stringify(JSON.parse(JSON.stringify(e)))), 'events are plain data');
});

test('place: rejected outside, on occupied tiles, without money, when locked or a second café', () => {
  const g = game([['fr_trad', 8, 14]], { coins: 100 });
  assert.equal(place(g, 'fr_trad', 23, 23, { buildingType: 'jp_trad' }).reason, 'outside');
  assert.equal(place(g, 'fr_trad', 8, 14).reason, 'blocked');
  assert.equal(place(g, 'us_cont', 2, 2).reason, 'notEnough');
  assert.equal(place(g, 'school', 2, 2).reason, 'locked');
  assert.equal(place(g, 'cafe', 2, 2).reason, 'unique');
  assert.equal(place(g, 'nope', 2, 2).reason, 'unknown');
  assert.equal(g.getSnapshot().state.coins, 100, 'rejections cost nothing');
  assert.ok(g.drainEvents().filter(e => e.type === 'command_rejected').length >= 6);
});

test('place: auto-facing turns the front toward the road; seeds come from the state RNG', () => {
  const g = game();
  const a = g.dispatch({ type: CMD.Place, buildingType: 'fr_trad', x: 8, y: 12 });
  assert.equal(g.getSnapshot().state.buildings[a.id].r, 0, 'road below');
  const b = g.dispatch({ type: CMD.Place, buildingType: 'fr_trad', x: 8, y: 14 });
  assert.equal(g.getSnapshot().state.buildings[b.id].r, 2, 'road above');
  const g2 = game();
  g2.dispatch({ type: CMD.Place, buildingType: 'fr_trad', x: 8, y: 12 });
  assert.equal(g2.getSnapshot().state.buildings[a.id].seed, g.getSnapshot().state.buildings[a.id].seed, 'same RNG seed, same building seed');
});

test('move keeps the building record and is free; it can overlap its own old tiles', () => {
  const g = game([['jp_trad', 6, 14]]);
  const id = Object.values(g.getSnapshot().state.buildings).find(b => b.type === 'jp_trad').id;
  const before = { ...g.getSnapshot().state.buildings[id] }, coins = g.getSnapshot().state.coins;
  assert.ok(g.dispatch({ type: CMD.Move, id, x: 7, y: 14, autoFace: false }).ok, 'shifting one tile overlaps itself');
  const b = g.getSnapshot().state.buildings[id];
  assert.equal(b.id, before.id); assert.equal(b.seed, before.seed); assert.equal(b.x, 7);
  assert.equal(g.getSnapshot().state.coins, coins);
  const s = g.getSnapshot().state;
  assert.equal(s.grid[14 * 24 + 6], 0, 'old tile freed'); assert.equal(s.grid[15 * 24 + 8], id);
  assert.equal(g.dispatch({ type: CMD.Move, id, x: 9, y: 12 }).reason, 'blocked');
});

test('rotate cycles 0..3', () => {
  const g = game([['fr_trad', 8, 14]]);
  const id = Object.values(g.getSnapshot().state.buildings).find(b => b.type === 'fr_trad').id;
  for (let i = 1; i <= 4; i++) { g.dispatch({ type: CMD.Rotate, id }); assert.equal(g.getSnapshot().state.buildings[id].r, i % 4); }
});

test('demolish refunds half and frees the tiles; the café is protected', () => {
  const g = game([['us_cont', 6, 14]]);
  const s = g.getSnapshot().state, house = Object.values(s.buildings).find(b => b.type === 'us_cont');
  const coins = s.coins;
  assert.ok(g.dispatch({ type: CMD.Demolish, id: house.id }).ok);
  assert.equal(g.getSnapshot().state.coins, coins + refundOf('us_cont'));
  assert.equal(refundOf('us_cont'), 95);
  assert.equal(g.getSnapshot().state.grid[14 * 24 + 6], 0);
  const cafe = Object.values(g.getSnapshot().state.buildings).find(b => b.type === 'cafe');
  const res = g.dispatch({ type: CMD.Demolish, id: cafe.id });
  assert.equal(res.ok, false); assert.equal(res.reason, 'cafeHeart');
  assert.ok(g.getSnapshot().state.buildings[cafe.id]);
});

test('speed and pause are commands too', () => {
  const g = game();
  assert.ok(g.dispatch({ type: CMD.SetSpeed, speed: 3 }).ok);
  assert.equal(g.dispatch({ type: CMD.SetSpeed, speed: 7 }).reason, 'badSpeed');
  g.dispatch({ type: CMD.TogglePause });
  assert.equal(g.step(10), 0, 'paused: no ticks');
  g.dispatch({ type: CMD.TogglePause });
  assert.equal(g.step(2), 6, '3× speed: 2 s → 6 ticks');
});

test('all goals unlocked lets every type be placed somewhere', () => {
  const g = game([], { goalsDone: ALL_GOALS, coins: 1e6 });
  for (const t of Object.keys(DEFS)) if (t !== 'cafe') assert.ok(g.unlocked().has(t), t);
});
