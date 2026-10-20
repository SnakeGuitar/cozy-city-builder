// Building tiers: data tables, the UpgradeBuilding command, previews, refunds and persistence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFS, CMD, TIER_LADDERS, tierStats, tierOf, maxTierOf, modelIdOf, upgradePreview, refundOf, createSaveDocument, loadSave, serializeGame, computeDerived, statsOf } from '../src/core/index.js';
import { makeState, centre, createGame, ALL_GOALS } from './helpers.mjs';

const UPGRADABLE = Object.keys(DEFS).filter(k => TIER_LADDERS[DEFS[k].kind]);
const game = (extra = [], over = {}) => createGame({ state: makeState([...centre(), ...extra], { coins: 5000, goalsDone: ALL_GOALS, ...over }) });
const idOf = (g, type) => Object.values(g.getSnapshot().state.buildings).find(b => b.type === type).id;

test('homes, shops, industry, services and utilities have three tiers; paths, nature and decoration none', () => {
  for (const [id, d] of Object.entries(DEFS)) {
    if (['house', 'shop', 'industry', 'service', 'utility'].includes(d.kind)) { assert.equal(maxTierOf(id), 3, id); assert.equal(d.tiers.length, 3, id); }
    else assert.equal(d.tiers, undefined, id);
  }
});

test('tier stats: tier 1 is the catalogue entry; higher tiers never shrink and cost more to reach', () => {
  for (const id of UPGRADABLE) {
    const [t1, t2, t3] = DEFS[id].tiers;
    for (const [n, t] of [[1, t1], [2, t2], [3, t3]]) { assert.equal(t.level, n); assert.equal(t.model, `${id}_t${n}`); assert.equal(modelIdOf(id, n), `${id}_t${n}`); }
    assert.equal(t1.upgradeCost, 0); assert.ok(t2.upgradeCost > 0 && t3.upgradeCost > t2.upgradeCost, `${id} costs`);
    for (const k of ['cap', 'jobs', 'cust', 'goods', 'out', 'r']) if (DEFS[id][k] !== undefined) {
      assert.equal(t1[k], DEFS[id][k], `${id} t1 ${k}`); assert.ok(t2[k] >= t1[k] && t3[k] >= t2[k], `${id} ${k} grows`);
    }
    assert.ok(t2.upkeep >= t1.upkeep && t3.upkeep >= t2.upkeep, `${id} upkeep grows`);
    const main = { house: 'cap', shop: 'cust', industry: 'out', service: 'cap', utility: 'cap' }[DEFS[id].kind];
    assert.ok(t3[main] > t1[main], `${id} tier 3 improves ${main}`);
  }
  // one table spelled out
  assert.deepEqual(DEFS.bakery.tiers.map(t => [t.level, t.upgradeCost, t.jobs, t.cust, t.goods, t.upkeep]), [[1, 0, 3, 20, 2, 0], [2, 115, 5, 32, 3, 2], [3, 210, 6, 48, 4.5, 4]]);
  assert.equal(tierStats('school', 3).r, 9); assert.equal(tierStats('school', 99).tier, 3, 'clamped'); assert.equal(tierOf('road', 2), null);
});

test('upgrade: charges the next tier price, keeps id, position, rotation and seed, and the rules use the new numbers', () => {
  const g = game([['bakery', 8, 14, 2, 777]]), id = idOf(g, 'bakery');
  const before = { ...g.getSnapshot().state.buildings[id] }, coins = g.getSnapshot().state.coins;
  const jobs0 = g.getSnapshot().derived.city.J;
  g.drainEvents();
  const res = g.dispatch({ type: CMD.Upgrade, id });
  assert.ok(res.ok, res.reason);
  const b = g.getSnapshot().state.buildings[id];
  assert.equal(b.tier, 2); assert.equal(g.getSnapshot().state.coins, coins - DEFS.bakery.tiers[1].upgradeCost);
  for (const k of ['id', 'type', 'x', 'y', 'r', 'seed']) assert.equal(b[k], before[k], k);
  assert.equal(statsOf(b).jobs, 5);
  assert.equal(g.getSnapshot().derived.city.J, jobs0 - 3 + 5, 'the town counts the tier-2 jobs');
  assert.equal(g.getSnapshot().derived.byId[id].tier, 2);
  const ev = g.drainEvents();
  assert.deepEqual(ev[0], { type: 'building_upgraded', id, buildingType: 'bakery', fromTier: 1, toTier: 2, cost: 115, model: 'bakery_t2' });
  assert.ok(ev.some(e => e.type === 'coins_changed' && e.delta === -115));
});

test('upgrade: maximum tier, missing building, things that never upgrade', () => {
  const g = game([['fr_trad', 8, 14], ['tree', 3, 3]]), id = idOf(g, 'fr_trad');
  assert.ok(g.dispatch({ type: CMD.Upgrade, id }).ok); assert.ok(g.dispatch({ type: CMD.Upgrade, id }).ok);
  const coins = g.getSnapshot().state.coins;
  assert.equal(g.dispatch({ type: CMD.Upgrade, id }).reason, 'maxTier');
  assert.equal(g.getSnapshot().state.buildings[id].tier, 3); assert.equal(g.getSnapshot().state.coins, coins);
  assert.equal(g.dispatch({ type: CMD.Upgrade, id: 999 }).reason, 'missing');
  assert.equal(g.dispatch({ type: CMD.Upgrade, id: idOf(g, 'tree') }).reason, 'notUpgradable');
});

test('upgrade without enough money is refused and costs nothing', () => {
  const g = game([['market', 6, 14]], { coins: 50 }), id = idOf(g, 'market');
  const res = g.dispatch({ type: CMD.Upgrade, id });
  assert.equal(res.reason, 'notEnough'); assert.equal(g.getSnapshot().state.coins, 50); assert.equal(g.getSnapshot().state.buildings[id].tier, 1);
  assert.ok(res.events.some(e => e.type === 'command_rejected'));
});

test('sandbox upgrades are free', () => {
  const g = createGame({ state: makeState([...centre(), ['school', 6, 14]], { mode: 'sandbox', coins: 0 }) }), id = idOf(g, 'school');
  assert.ok(g.dispatch({ type: CMD.Upgrade, id }).ok); assert.ok(g.dispatch({ type: CMD.Upgrade, id }).ok);
  assert.equal(g.getSnapshot().state.coins, 0); assert.equal(g.getSnapshot().state.buildings[id].tier, 3);
});

test('preview: the core says what changes, what it costs and whether it can happen', () => {
  const g = game([['clinic', 8, 14]], { coins: 100 }), id = idOf(g, 'clinic'), s = g.getSnapshot().state;
  const p = upgradePreview(s, id);
  assert.equal(p.from, 1); assert.equal(p.to, 2); assert.equal(p.max, 3); assert.equal(p.cost, DEFS.clinic.tiers[1].upgradeCost);
  assert.equal(p.reason, 'notEnough');
  assert.deepEqual(p.changes.map(c => c.stat).sort(), ['cap', 'jobs', 'r', 'upkeep']);
  assert.deepEqual(p.changes.find(c => c.stat === 'cap'), { stat: 'cap', from: 50, to: 75 });
  s.coins = 1e4; assert.equal(upgradePreview(s, id).reason, null);
  assert.equal(upgradePreview(s, 12345).reason, 'missing');
  const before = JSON.stringify(s); upgradePreview(s, id); assert.equal(JSON.stringify(s), before, 'pure');
});

test('demolishing refunds half of the price and of the upgrades paid', () => {
  const g = game([['us_cont', 6, 14]]), id = idOf(g, 'us_cont');
  g.dispatch({ type: CMD.Upgrade, id });
  const coins = g.getSnapshot().state.coins;
  assert.equal(refundOf('us_cont', 2), Math.floor((190 + DEFS.us_cont.tiers[1].upgradeCost) / 2));
  assert.equal(g.dispatch({ type: CMD.Demolish, id }).events[0].refund, refundOf('us_cont', 2));
  assert.equal(g.getSnapshot().state.coins, coins + refundOf('us_cont', 2));
});

test('tiers are saved; a reloaded upgraded town runs identically', () => {
  const g = game([['bakery', 8, 14], ['fr_trad', 6, 14]]);
  g.dispatch({ type: CMD.Upgrade, id: idOf(g, 'bakery') });
  for (let i = 0; i < 20; i++) g.tick();
  const { state } = loadSave(JSON.parse(JSON.stringify(createSaveDocument(g.getSnapshot().state))));
  assert.equal(state.buildings[idOf(g, 'bakery')].tier, 2);
  const a = createGame({ state });
  for (let i = 0; i < 20; i++) { a.tick(); g.tick(); }
  assert.deepEqual(a.serialize(), g.serialize());
});

test('v4 saves migrate to v5 with every building at tier 1; bad tiers are clamped with a warning', () => {
  const s = makeState([...centre(), ['bakery', 8, 14]]);
  const v4 = { v: 4, mode: 'normal', game: { ...serializeGame(s), buildings: serializeGame(s).buildings.map(({ tier, ...b }) => b) }, ui: {} };
  const { state, from, warnings } = loadSave(v4);
  assert.equal(from, 4); assert.deepEqual(warnings, []);
  assert.ok(Object.values(state.buildings).every(b => b.tier === 1));
  assert.equal(Object.keys(state.buildings).length, Object.keys(s.buildings).length);
  const bad = { v: 5, mode: 'normal', game: { ...serializeGame(s), buildings: serializeGame(s).buildings.map(b => b.type === 'bakery' ? { ...b, tier: 9 } : b) }, ui: {} };
  const r = loadSave(bad);
  assert.equal(Object.values(r.state.buildings).find(b => b.type === 'bakery').tier, 3);
  assert.ok(r.warnings.some(w => /tier/.test(w)));
  assert.doesNotThrow(() => computeDerived(r.state));
});
