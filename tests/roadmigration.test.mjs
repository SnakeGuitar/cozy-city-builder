// Old road cells → road graph. The v4 save was written by the original game (tools/make-v4-fixture.mjs); loading it today
// must keep every building, put a road wherever a road cell was (and nowhere else), and give the same connections and economy.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadSave, createSaveDocument, serializeGame, computeDerived, onRoad, canPlace, SAVE_VERSION, migrateSave } from '../src/core/index.js';
import { createGame } from '../src/application/game.js';
import { roadLayout } from '../src/presentation/roadLayout.js';
import { roadCell } from './helpers.mjs';

const read = n => JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}`, import.meta.url)));
const doc = read('save-v4.json'), expected = read('save-v4.expected.json');
const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);
const cellCentre = (x, y) => ({ x: x - 12 + .5, z: y - 12 + .5 });

test('a v4 town loads: every building kept with its id, every road cell a node', () => {
  const { state, from, warnings } = loadSave(doc);
  assert.equal(from, 4); assert.deepEqual(warnings, []);
  const old = doc.game.buildings, others = old.filter(b => b.type !== 'road');
  assert.deepEqual(Object.keys(state.buildings).map(Number).sort((a, b) => a - b), others.map(b => b.id).sort((a, b) => a - b));
  for (const b of others) assert.equal(state.buildings[b.id].type, b.type);
  assert.equal(Object.keys(state.roads.nodes).length, expected.roadCells.length);
  for (const [x, y] of expected.roadCells) assert.ok(roadCell(state, x, y), `road cell ${x},${y} became a node`);
  assert.equal(state.nextId, doc.game.nextId, 'new buildings keep counting from where the town was');
  assert.equal(migrateSave(doc).doc.v, SAVE_VERSION);
});

test('the same roads are where they were, and nowhere else (cell by cell)', () => {
  const { state } = loadSave(doc), isRoad = new Set(expected.roadCells.map(([x, y]) => x + ',' + y));
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const c = cellCentre(x, y), road = isRoad.has(x + ',' + y);
    assert.equal(onRoad(state, c.x, c.z), road, `cell ${x},${y}`);
    if (!road) continue;
    for (const [dx, dz] of [[.45, 0], [-.45, 0], [0, .45], [0, -.45], [.45, .45], [-.45, -.45]]) assert.ok(onRoad(state, c.x + dx, c.z + dz), `inside road cell ${x},${y}`);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!isRoad.has((x + dx) + ',' + (y + dy)) && x + dx >= 0 && y + dy >= 0 && x + dx < 24 && y + dy < 24)
      assert.ok(!onRoad(state, c.x + dx * .55, c.z + dy * .55), `the road stops at the edge of cell ${x},${y}`);
  }
});

test('drawn as before: one unit wide, square cell pads at dead ends, bends and junctions, a lone cell is a square', () => {
  const { state } = loadSave(doc), { ribbons, pads } = roadLayout(state);
  assert.ok(ribbons.every(r => r.width === 1));
  assert.ok(pads.every(p => p.square && p.width === 1), 'grid cells keep square pads');
  const lone = pads.find(p => p.exits.length === 0); assert.ok(lone, 'the isolated cell'); assert.deepEqual(lone.center, cellCentre(2, 20));
  assert.ok(pads.some(p => p.exits.length === 3) && pads.some(p => p.exits.length === 4), 'T junction and crossroads');
});

test('connections, numbers and the next minute match what the original game computed', () => {
  const { state } = loadSave(doc), d = computeDerived(state);
  for (const [id, conn] of Object.entries(expected.conn)) assert.equal(d.byId[id].conn, conn, `building ${id} (${d.byId[id].type})`);
  assert.equal(d.roads.mainNodes.length, expected.mainRoads);
  for (const k of Object.keys(expected.city)) close(d.city[k], expected.city[k], k);
  const g = createGame({ state });
  for (let i = 0; i < expected.afterTicks.ticks; i++) g.tick();
  const s = g.getSnapshot().state;
  close(s.population, expected.afterTicks.population, 'population'); close(s.coins, expected.afterTicks.coins, 'coins'); close(s.employed, expected.afterTicks.employed, 'employed');
});

test('migrated buildings stand clear of the migrated roads, and a re-save loads unchanged', () => {
  const { state } = loadSave(doc);
  for (const b of Object.values(state.buildings)) assert.equal(canPlace(state, b.type, b.position, b.rotation, b.id), null, `${b.type} #${b.id}`);
  const again = loadSave(JSON.parse(JSON.stringify(createSaveDocument(state))));
  assert.deepEqual(again.warnings, []); assert.deepEqual(serializeGame(again.state), serializeGame(state));
});
