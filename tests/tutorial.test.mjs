import test from 'node:test';
import assert from 'node:assert/strict';
import { CMD, pickAdvice, adviseNow, ADVICE_COOLDOWN, computeDerived } from '../src/core/index.js';
import { createGame, newGameState } from '../src/application/game.js';
import { makeState, centre } from './helpers.mjs';

const place = (g, buildingType, x, y) => g.dispatch({ type: CMD.Place, buildingType, x, y, r: 0, autoFace: false });
const said = events => events.filter(e => e.type === 'mascot_message_requested').map(e => e.messageId);
const steps = events => events.filter(e => e.type === 'tutorial_step_completed').map(e => e.stepId);

test('the first steps: explore → café → road → home → connect, with Limoni guiding each one', () => {
  const g = createGame(); g.replaceState(newGameState('normal'), 'new');
  let ev = g.drainEvents();
  assert.deepEqual(said(ev), ['m_tut_explore']); assert.ok(ev.find(e => e.messageId === 'm_tut_explore').sticky);
  g.dispatch({ type: CMD.TutorialSignal, signal: 'camera_moved' }); ev = g.drainEvents();
  assert.deepEqual(steps(ev), ['explore']); assert.deepEqual(said(ev), ['m_tut_cafe']);
  place(g, 'cafe', 10, 11); ev = g.drainEvents();
  assert.deepEqual(steps(ev), ['place_cafe']); assert.ok(said(ev).includes('m_tut_road'));
  assert.ok(said(ev).includes('m_goal'), 'goal g0 is celebrated');
  place(g, 'road', 10, 13); ev = g.drainEvents();
  assert.deepEqual(steps(ev), ['first_road']); assert.deepEqual(said(ev), ['m_tut_home']);
  place(g, 'fr_trad', 4, 4); ev = g.drainEvents();
  assert.deepEqual(steps(ev), ['first_home']); assert.deepEqual(said(ev), ['m_tut_connect'], 'no extra "no road" nag during the tutorial');
  for (let y = 4; y <= 13; y++) place(g, 'road', 5, y); for (let x = 6; x <= 9; x++) place(g, 'road', x, 13);
  ev = g.drainEvents();
  assert.deepEqual(steps(ev), ['connect_home']); assert.ok(said(ev).includes('m_tut_done'));
  assert.equal(g.getSnapshot().state.tutorial.step, 'done');
  assert.ok(ev.some(e => e.type === 'goal_completed' && e.goalId === 'g0b'));
});

test('tutorial progress is saved with the game and a loaded game resumes the current step', async () => {
  const { createSaveDocument, loadSave } = await import('../src/core/index.js');
  const g = createGame(); g.replaceState(newGameState('normal'), 'new');
  g.dispatch({ type: CMD.TutorialSignal, signal: 'camera_moved' }); place(g, 'cafe', 10, 11);
  const { state } = loadSave(JSON.parse(JSON.stringify(createSaveDocument(g.getSnapshot().state))));
  assert.equal(state.tutorial.step, 'first_road');
  const g2 = createGame(); g2.replaceState(state, 'load');
  assert.deepEqual(said(g2.drainEvents()), ['m_tut_road']);
});

test('sandbox has no tutorial; Limoni greets it with its own line', () => {
  const g = createGame(); g.replaceState(newGameState('sandbox'), 'new');
  assert.deepEqual(said(g.drainEvents()), ['m_sandbox']);
  g.dispatch({ type: CMD.TutorialSignal, signal: 'camera_moved' });
  assert.deepEqual(steps(g.drainEvents()), []);
});

test('a building left without a road gets one reminder, then the advisor waits', () => {
  const g = createGame({ state: makeState(centre(), { coins: 5000 }) }); g.drainEvents();
  place(g, 'fr_trad', 2, 2);
  assert.deepEqual(said(g.drainEvents()), ['m_no_road']);
  place(g, 'fr_trad', 2, 5);
  assert.deepEqual(said(g.drainEvents()), [], 'not twice in a row');
});

test('advice is pure and rate-limited in simulated seconds', () => {
  const s = makeState([...centre(), ['fr_trad', 2, 2]]), d = computeDerived(s);
  assert.equal(pickAdvice(s, d).id, 'm_no_road');
  let mem = { now: 0, last: -Infinity, lastById: {} };
  const a = adviseNow(s, d, mem); assert.equal(a.event.messageId, 'm_no_road'); mem = a.memory;
  assert.equal(adviseNow(s, d, { ...mem, now: ADVICE_COOLDOWN - 1 }).event, null);
  assert.equal(adviseNow(s, d, { ...mem, now: ADVICE_COOLDOWN + 1 }).event, null, 'the same tip waits longer');
  assert.ok(adviseNow(s, d, { ...mem, now: 1000 }).event);
});

test('the café alone never triggers the "no road to the café" reminder', () => {
  const g = createGame(); g.replaceState(newGameState('sandbox'), 'new'); g.drainEvents();
  place(g, 'cafe', 10, 11);
  assert.ok(!said(g.drainEvents()).includes('m_no_road'));
  for (let i = 0; i < 200; i++) g.tick();
  assert.ok(!said(g.drainEvents()).includes('m_no_road'));
});
