import test from 'node:test';
import assert from 'node:assert/strict';
import { CMD } from '../src/core/index.js';
import { makeState, centre, derive, place, createGame, roadCell } from './helpers.mjs';

test('buildings are connected only through roads that reach the café', () => {
  const s = makeState([...centre(), ['fr_trad', 8, 14], ['fr_trad', 20, 20], ['road', 20, 19]]);
  const d = derive(s);
  const conn = t => Object.values(d.byId).filter(b => b.type === t).map(b => b.conn);
  assert.deepEqual(conn('fr_trad'), [true, false], 'the far house has a road, but not one linked to the café');
  assert.equal(d.byId[Object.values(s.buildings).find(b => b.type === 'cafe').id].conn, true);
  assert.equal(d.roads.mainNodes.length, 12); assert.equal(d.roads.mainSegments.length, 11);
});

test('removing a road disconnects, rebuilding it reconnects', () => {
  const game = createGame({ state: makeState([...centre(), ['fr_trad', 16, 14]], { goalsDone: [] }) });
  const house = () => Object.values(game.getSnapshot().derived.byId).find(b => b.type === 'fr_trad');
  assert.equal(house().conn, true);
  const cell = roadCell(game.getSnapshot().state, 12, 13);
  assert.ok(game.dispatch({ type: CMD.DemolishRoad, nodeId: cell.id }).ok);
  assert.equal(house().conn, false, 'gap at x = 12 cuts the house off');
  assert.ok(place(game, 'road', 12, 13).ok);
  assert.equal(house().conn, true);
});

test('a café without roads connects nothing', () => {
  const d = derive(makeState([['cafe', 10, 11], ['fr_trad', 12, 11]]));
  assert.ok(Object.values(d.byId).every(b => !b.conn));
});
