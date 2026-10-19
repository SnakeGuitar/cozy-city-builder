import test from 'node:test';
import assert from 'node:assert/strict';
import { GOALS, goalProgress, unlockedTypes, completeGoals, computeDerived } from '../src/core/index.js';
import { makeState, centre, createGame, place } from './helpers.mjs';

test('goal progress is a pure function of state and derived data', () => {
  const s = makeState([...centre(), ['fr_trad', 8, 14], ['fr_trad', 9, 14]]);
  const d = computeDerived(s), g1 = GOALS.find(g => g.id === 'g1');
  assert.deepEqual(goalProgress(g1, s, d), [2, 3]);
});

test('completing a goal pays the reward once and unlocks types', () => {
  const game = createGame({ state: makeState([...centre(), ['fr_trad', 8, 14], ['fr_trad', 9, 14]], { coins: 1000 }) });
  game.drainEvents();
  assert.ok(!game.unlocked().has('workshop'));
  assert.ok(place(game, 'fr_trad', 12, 14).ok);
  const { state } = game.getSnapshot();
  assert.ok(state.goalsDone.includes('g1'));
  assert.equal(state.coins, 1000 - 110 + 100);
  const ev = game.drainEvents();
  assert.ok(ev.some(e => e.type === 'goal_completed' && e.goalId === 'g1' && e.reward === 100));
  assert.ok(ev.some(e => e.type === 'types_unlocked' && e.types.includes('workshop')));
  assert.ok(game.unlocked().has('workshop'));
  const again = completeGoals(state, computeDerived(state));
  assert.equal(again.length, 0, 'no double reward');
});

test('unlocked types start from the base set', () => {
  const u = unlockedTypes(makeState());
  assert.ok(u.has('fr_trad') && u.has('water') && !u.has('school'));
});
