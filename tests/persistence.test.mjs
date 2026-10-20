import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSaveDocument, loadSave, migrateSave, normalizeGame, serializeGame, SAVE_VERSION, computeDerived } from '../src/core/index.js';
import { createGame, newGameState } from '../src/application/game.js';
import { cellOf, idAtCell } from './helpers.mjs';

const fixture = n => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));

test('round trip: serialize → JSON → load gives the same game', () => {
  const g = createGame({ state: newGameState() });
  for (let i = 0; i < 90; i++) g.tick();
  const doc = JSON.parse(JSON.stringify(createSaveDocument(g.getSnapshot().state, { lang: 'es' })));
  assert.equal(doc.v, SAVE_VERSION);
  const { state, ui, warnings } = loadSave(doc);
  assert.deepEqual(warnings, []);
  assert.deepEqual(serializeGame(state), serializeGame(g.getSnapshot().state));
  assert.deepEqual(state.spatial, g.getSnapshot().state.spatial);
  assert.equal(ui.lang, 'es');
  // and it keeps running identically
  const a = createGame({ state }), b = g;
  for (let i = 0; i < 30; i++) { a.tick(); b.tick(); }
  assert.deepEqual(a.serialize(), b.serialize());
});

test('saves contain only plain data', () => {
  const doc = createSaveDocument(newGameState());
  const json = JSON.stringify(doc);
  assert.deepEqual(JSON.parse(json), doc);
  assert.ok(!/obj|sway|smoke|Object3D|THREE/.test(json));
});

test('v2 saves load: ids, positions, prefs and progress survive', () => {
  const raw = fixture('save-v2.json');
  const { state, ui, from, warnings } = loadSave(raw);
  assert.equal(from, 2); assert.deepEqual(warnings, []);
  assert.equal(state.coins, 1472.5); assert.equal(state.population, 40.2); assert.equal(state.employed, 23.1);
  assert.deepEqual(state.goalsDone, ['g0', 'g0b', 'g1', 'g2', 'g4'], 'older towns skip the starter goals');
  assert.equal(state.clock.speed, 3); assert.equal(state.clock.day, 2);
  assert.equal(Object.keys(state.buildings).length, raw.b.length);
  for (const o of raw.b) { const b = state.buildings[o.id], c = cellOf(state, b); assert.equal(b.type, o.t); assert.equal(c.x, o.x); assert.equal(c.y, o.y); assert.equal(c.r, o.r); assert.equal(b.seed, o.s); }
  assert.equal(state.nextId, 40);
  assert.deepEqual(ui, { newT: ['fire', 'police'], muted: true, tips: true, tut: { moved: true, age: 120, free: 3, city: true }, tab: 'services', filt: { fam: 'jp', era: 'all' }, lang: 'ja', cam: [-3, 4.5, .785, 2.1] });
});

test('v1 Strawberry Borough saves migrate through v2 to the current version', () => {
  const { state, ui, from, warnings } = loadSave(fixture('save-v1.json'));
  assert.equal(from, 1); assert.deepEqual(warnings, []);
  const types = Object.values(state.buildings).filter(b => b.type !== 'road').map(b => b.type).sort();
  assert.deepEqual(types, ['cafe', 'fr_cont', 'fr_trad', 'fr_trad', 'orchard', 'tree']);
  assert.deepEqual(state.goalsDone, ['g0', 'g0b', 'g1', 'g2'], 'v1 g4 meant something else');
  assert.equal(state.population, 9); assert.equal(state.coins, 777); assert.equal(state.clock.speed, 2);
  assert.equal(ui.lang, 'en');
  assert.deepEqual(Object.keys(state.buildings).map(Number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const chain = migrateSave(fixture('save-v1.json'));
  assert.equal(chain.doc.v, SAVE_VERSION);
});

test('damaged saves are rejected or normalised safely', () => {
  assert.throws(() => loadSave(null)); assert.throws(() => loadSave({})); assert.throws(() => loadSave({ v: 99, game: {} }));
  assert.throws(() => loadSave({ v: 2 }), /without buildings/);
  const { state, warnings } = normalizeGame({
    mode: 'banana', tutorial: { step: 'nope', signals: ['ok', 42, 'Bad Signal'] },
    coins: 'lots', population: -5, employed: NaN, demand: { r: 900 }, clock: { time: 4, speed: 9, day: -2 }, goalsDone: ['g1', 'bogus', 'g1'], nextId: 2,
    buildings: [null, { type: 'castle', x: 1, y: 1 }, { type: 'fr_trad', x: 1.5, y: 1 }, { type: 'fr_trad', x: 30, y: 1, id: 3 },
      { id: 5, type: 'fr_trad', x: 2, y: 2, r: 7, seed: -3 }, { id: 5, type: 'fr_trad', x: 4, y: 4 }, { id: 9, type: 'jp_trad', x: 2, y: 2 },
      { id: 11, type: 'cafe', x: 10, y: 11 }, { id: 12, type: 'cafe', x: 14, y: 14 }, { id: 13, type: 'houseA', x: 6, y: 6, well: 1e9, open: 'yes' }] });
  assert.equal(state.coins, 0); assert.equal(state.population, 0); assert.equal(state.employed, 0);
  assert.equal(state.demand.r, 100); assert.ok(state.clock.time < 1); assert.equal(state.clock.speed, 1); assert.equal(state.clock.day, 1);
  assert.deepEqual(state.goalsDone, ['g1']);
  assert.equal(state.mode, 'normal'); assert.deepEqual(state.tutorial, { step: 'done', signals: ['ok'] });
  const list = Object.values(state.buildings).sort((a, b) => a.id - b.id);
  assert.deepEqual(list.map(b => { const c = cellOf(state, b); return [b.type, c.x, c.y]; }), [['fr_trad', 2, 2], ['cafe', 10, 11], ['fr_trad', 6, 6], ['fr_trad', 4, 4]]);
  const h = list[0]; assert.equal(h.rotation, 0); assert.equal(h.seed, 0);
  assert.equal(list[2].well, 100); assert.equal(list[2].open, true);
  assert.ok(new Set(list.map(b => b.id)).size === list.length, 'ids unique');
  assert.ok(state.nextId > Math.max(...list.map(b => b.id)));
  assert.ok(warnings.length >= 8);
  // the spatial index matches the buildings
  for (const b of list) { const c = cellOf(state, b); assert.equal(idAtCell(state, c.x, c.y), b.id); }
  assert.doesNotThrow(() => computeDerived(state));
});

test('an old (≤ v3) save without a café is damaged and gets one back', () => {
  const { state, warnings } = normalizeGame({ buildings: [{ id: 1, type: 'road', x: 0, y: 0 }] }, { repairLandmark: true });
  assert.ok(Object.values(state.buildings).some(b => b.type === 'cafe'));
  assert.ok(warnings.some(w => /café/.test(w)));
});
