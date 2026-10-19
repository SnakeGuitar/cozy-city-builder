import test from 'node:test';
import assert from 'node:assert/strict';
import { canPlace, insertBuilding, removeBuilding, rectDist, adjacentTiles, autoFace, buildingAt, GRID_SIZE } from '../src/core/index.js';
import { makeState } from './helpers.mjs';

test('placement: valid, outside the map and on occupied tiles', () => {
  const s = makeState([['jp_trad', 5, 5]]);
  assert.equal(canPlace(s, 'fr_trad', 0, 0), null);
  assert.equal(canPlace(s, 'fr_trad', -1, 0), 'outside');
  assert.equal(canPlace(s, 'jp_trad', GRID_SIZE - 1, 3), 'outside', '2×2 footprint hanging off the edge');
  assert.equal(canPlace(s, 'fr_trad', 6, 6), 'blocked', 'inside the 2×2 house');
  assert.equal(canPlace(s, 'jp_trad', 4, 4), 'blocked', 'overlapping one corner');
  assert.equal(canPlace(s, 'jp_trad', 7, 5), null, 'touching is fine');
  assert.equal(canPlace(s, 'fr_trad', 1.5, 0), 'outside', 'fractional tiles are rejected');
});

test('grid occupation and release follow the footprint', () => {
  const s = makeState();
  const b = insertBuilding(s, 'market', 3, 4, 0, 1);
  const owned = s.grid.filter(id => id === b.id).length;
  assert.equal(owned, 4);
  assert.equal(buildingAt(s, 4, 5), b); assert.equal(buildingAt(s, 5, 5), null);
  removeBuilding(s, b);
  assert.equal(s.grid.filter(id => id !== 0).length, 0);
  assert.equal(s.buildings[b.id], undefined);
});

test('distance between footprints of different sizes', () => {
  const a = { type: 'jp_trad', x: 4, y: 4 };            // covers 4..5
  assert.equal(rectDist(a, { type: 'tree', x: 5, y: 5 }), 0, 'overlapping');
  assert.equal(rectDist(a, { type: 'tree', x: 6, y: 5 }), 1, 'edge neighbour');
  assert.equal(rectDist(a, { type: 'tree', x: 7, y: 5 }), 2);
  assert.equal(rectDist(a, { type: 'tree', x: 8, y: 9 }), 4, 'Chebyshev: max of dx, dy');
  assert.equal(rectDist(a, { type: 'market', x: 1, y: 1 }), 2, '2×2 to 2×2 (covers 1..2)');
  assert.equal(rectDist({ type: 'tree', x: 7, y: 5 }, a), 2, 'symmetric');
});

test('adjacent tiles and auto-facing toward the road', () => {
  const s = makeState([['road', 3, 7], ['road', 4, 7]]);
  assert.equal(adjacentTiles({ type: 'jp_trad', x: 0, y: 0 }).length, 4, 'clipped at the map corner');
  assert.equal(autoFace(s, 'jp_trad', 3, 5, 3), 0, 'road below (+y) → front faces 0');
  assert.equal(autoFace(s, 'fr_trad', 9, 9, 2), 2, 'no road keeps the fallback');
});
