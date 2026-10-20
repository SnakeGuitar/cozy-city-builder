// Menu navigation, save slots and their separation — no browser needed (storage is a small port).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, SLOTS } from '../src/application/app.js';
import { navigate, createNavigation, simulationRunning } from '../src/application/navigation.js';
import { CMD, loadSave } from '../src/core/index.js';

const memory = (init = {}) => { const m = new Map(Object.entries(init)); return { m, read: k => m.get(k) ?? null, write: (k, v) => (m.set(k, v), true), remove: k => m.delete(k) }; };
const place = (app, buildingType, x, y) => app.game.dispatch({ type: CMD.Place, buildingType, x, y, r: 0, autoFace: false });

test('the app opens on the main menu and the world does not move there', () => {
  const app = createApp({ storage: memory() });
  assert.equal(app.nav.screen, 'main_menu');
  const t0 = app.game.getSnapshot().state.clock.time;
  assert.equal(app.frame(10), 0);
  assert.equal(app.game.getSnapshot().state.clock.time, t0);
  assert.equal(app.hasSave('normal'), false);
});

test('entering and leaving menus never advances the simulation; going back to the menu saves', () => {
  const storage = memory(), app = createApp({ storage, getSlotUi: () => ({ camera: { marker: 1 } }) });
  app.newGame('normal');
  assert.equal(app.nav.screen, 'playing');
  assert.equal(app.frame(3), 3);
  app.navigate({ type: 'pause' }); assert.equal(app.frame(5), 0);
  app.navigate({ type: 'open_settings' }); assert.equal(app.nav.screen, 'settings'); assert.equal(app.frame(5), 0);
  app.navigate({ type: 'back' }); assert.equal(app.nav.screen, 'paused');
  app.navigate({ type: 'resume' }); assert.equal(app.frame(1), 1);
  place(app, 'cafe', 10, 11);
  const before = app.game.serialize();
  app.toMainMenu();
  assert.equal(app.nav.screen, 'main_menu'); assert.equal(app.frame(10), 0);
  const saved = JSON.parse(storage.read(SLOTS.normal));
  assert.equal(saved.mode, 'normal'); assert.deepEqual(saved.game, JSON.parse(JSON.stringify(before)));
  assert.deepEqual(saved.ui.camera, { marker: 1 }, 'the camera travels with the save');
  assert.ok(app.continueGame()); assert.equal(Object.values(app.game.getSnapshot().state.buildings)[0].type, 'cafe');
});

test('normal and sandbox use separate slots and never share economy or buildings', () => {
  const storage = memory(), app = createApp({ storage });
  app.newGame('normal'); place(app, 'cafe', 10, 11); place(app, 'road', 10, 13);
  const normalCoins = app.game.getSnapshot().state.coins;
  app.toMainMenu();
  app.openSandbox();
  assert.equal(app.mode, 'sandbox'); assert.equal(app.game.rules().mode, 'sandbox');
  assert.deepEqual(app.game.getSnapshot().state.buildings, {}, 'a new sandbox is empty');
  place(app, 'cafe', 3, 3); place(app, 'school', 6, 6);
  app.toMainMenu();
  assert.ok(storage.read(SLOTS.normal) && storage.read(SLOTS.sandbox));
  assert.throws(() => loadSave(JSON.parse(storage.read(SLOTS.sandbox)), { expectMode: 'normal' }), /sandbox/);
  app.continueGame();
  const s = app.game.getSnapshot().state;
  assert.equal(s.mode, 'normal'); assert.equal(s.coins, normalCoins);
  assert.deepEqual(Object.values(s.buildings).map(b => b.type), ['cafe']); assert.equal(Object.keys(s.roads.nodes).length, 1, 'and its road');
  app.toMainMenu(); app.openSandbox();
  assert.deepEqual(Object.values(app.game.getSnapshot().state.buildings).map(b => b.type).sort(), ['cafe', 'school'], 'sandbox reopens');
});

test('a sandbox save in the normal slot is refused, never converted', () => {
  const storage = memory(), a = createApp({ storage });
  a.newGame('sandbox'); a.toMainMenu();
  storage.write(SLOTS.normal, storage.read(SLOTS.sandbox));
  const b = createApp({ storage });
  assert.equal(b.hasSave('normal'), false); assert.equal(b.continueGame(), false);
  assert.ok(b.drainEvents().some(e => e.type === 'save_rejected'));
});

test('a new game asks before overwriting, then starts empty', () => {
  const storage = memory(), app = createApp({ storage });
  app.newGame('normal'); place(app, 'cafe', 10, 11); app.toMainMenu();
  assert.equal(app.newGame('normal'), false);
  assert.equal(app.nav.confirm.id, 'overwrite'); assert.equal(simulationRunning(app.nav), false);
  app.confirm(false); assert.equal(app.nav.confirm, null); assert.equal(app.nav.screen, 'main_menu');
  app.newGame('normal'); app.confirm(true);
  assert.equal(app.nav.screen, 'playing'); assert.deepEqual(app.game.getSnapshot().state.buildings, {});
  assert.deepEqual(JSON.parse(storage.read(SLOTS.normal)).game.buildings, [], 'the old save was replaced');
});

test('old saves continue from the menu without losing buildings', () => {
  const v2 = JSON.parse(JSON.stringify((await_v2())));
  const storage = memory({ [SLOTS.normal]: JSON.stringify(v2) }), app = createApp({ storage });
  assert.ok(app.hasSave('normal')); assert.ok(app.continueGame());
  const s = app.game.getSnapshot().state;
  assert.equal(Object.keys(s.buildings).length + Object.keys(s.roads.nodes).length, v2.b.length, 'buildings and road cells');
});
import fs from 'node:fs';
function await_v2() { return JSON.parse(fs.readFileSync(new URL('./fixtures/save-v2.json', import.meta.url))); }

test('navigation reducer: Escape-style back, credits only from the main menu', () => {
  let n = createNavigation();
  n = navigate(n, { type: 'open_credits' }); assert.equal(n.screen, 'credits');
  n = navigate(n, { type: 'back' }); assert.equal(n.screen, 'main_menu');
  n = navigate(n, { type: 'pause' }); assert.equal(n.screen, 'main_menu', 'cannot pause the menu');
  n = navigate(n, { type: 'start' }); n = navigate(n, { type: 'open_credits' }); assert.equal(n.screen, 'playing');
  n = navigate(n, { type: 'ask', confirm: { id: 'x' } }); assert.equal(simulationRunning(n), false);
  n = navigate(n, { type: 'back' }); assert.equal(n.confirm, null); assert.equal(n.screen, 'playing');
});
