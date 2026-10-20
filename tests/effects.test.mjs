import test from 'node:test';
import assert from 'node:assert/strict';
import { makeState, centre, derive, idAtCell } from './helpers.mjs';

const homeAt = (d, s, x, y) => d.byId[idAtCell(s, x, y)];

test('wellbeing effects respect radius', () => {
  // flowerbed: +5 within 1 tile
  const s = makeState([['fr_trad', 2, 2], ['flowerbed', 3, 3], ['fr_trad', 6, 6]]);
  const d = derive(s);
  assert.equal(homeAt(d, s, 2, 2).wellB, 5);
  assert.equal(homeAt(d, s, 6, 6).wellB, 0, 'two tiles away is out of range');
});

test('identical sources stack only up to max', () => {
  // tree: +3 within 2 tiles, max 4
  const trees = [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3]].map(([x, y]) => ['tree', x, y]);
  const s = makeState([['fr_trad', 2, 2], ...trees]);
  const h = homeAt(derive(s), s, 2, 2);
  assert.equal(h.wellB, 12, '6 trees in range, 4 count');
  assert.equal(h.src.length, 4);
});

test('income effects need a connected business source and the right target', () => {
  // bakery → café +15 within 4; orchard → café +25 (no connection needed)
  const s = makeState([...centre(), ['bakery', 12, 14], ['orchard', 7, 9], ['bakery', 20, 20]]);
  const d = derive(s), cafe = Object.values(d.byId).find(b => b.type === 'cafe');
  assert.deepEqual(cafe.src.map(x => [s.buildings[x.from].type, x.v]).sort(), [['bakery', 15], ['orchard', 25]]);
  assert.equal(cafe.mult, 40);
});
