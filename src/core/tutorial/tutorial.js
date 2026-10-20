// The first-steps tutorial of a normal game, as data plus pure checks. It decides *which* message the mascot
// should say (a translation id and a mood); front ends decide how to show it.
import { DEFS, LANDMARK } from '../config/catalog.js';
import { rulesFor } from '../config/rules.js';

const CONNECTABLE = new Set(['house', 'shop', 'industry', 'service', 'utility']);
const homes = d => Object.values(d.byId).filter(r => r.kind === 'house');

/** Steps in order. `done` is pure over (state, derived). */
export const TUTORIAL_STEPS = Object.freeze([
  { id: 'explore', message: 'm_tut_explore', mood: 'wave', done: s => s.tutorial.signals.includes('camera_moved') },
  { id: 'place_cafe', message: 'm_tut_cafe', mood: 'point', done: s => Object.values(s.buildings).some(b => b.type === LANDMARK) },
  { id: 'first_road', message: 'm_tut_road', mood: 'point', done: (s, d) => d.roads.mainRoads.length > 0 },
  { id: 'first_home', message: 'm_tut_home', mood: 'happy', done: (s, d) => homes(d).length > 0 },
  { id: 'connect_home', message: 'm_tut_connect', mood: 'think', done: (s, d) => homes(d).some(h => h.conn) },
]);
export const TUTORIAL_DONE = { id: 'done', message: 'm_tut_done', mood: 'cheer' };
const indexOf = id => TUTORIAL_STEPS.findIndex(s => s.id === id);

export function currentStep(state) { return rulesFor(state).tutorialEnabled ? TUTORIAL_STEPS[indexOf(state.tutorial.step)] || null : null; }
/** The message for the current step, as a neutral request (or null when there is no tutorial). */
export function tutorialMessage(state) {
  const step = currentStep(state);
  return step ? { type: 'mascot_message_requested', messageId: step.message, mood: step.mood, params: {}, reason: 'tutorial', sticky: true } : null;
}

/** Advances through every step already satisfied. Mutates only state.tutorial; returns events. */
export function advanceTutorial(state, derived) {
  const events = []; let step = currentStep(state);
  if (!step) return events;
  let moved = false;
  while (step && step.done(state, derived)) {
    events.push({ type: 'tutorial_step_completed', stepId: step.id });
    const next = TUTORIAL_STEPS[indexOf(step.id) + 1];
    state.tutorial.step = next ? next.id : 'done'; step = next; moved = true;
  }
  if (moved) {
    const m = step || TUTORIAL_DONE;
    events.push({ type: 'mascot_message_requested', messageId: m.message, mood: m.mood, params: {}, reason: 'tutorial', sticky: !!step });
  }
  return events;
}
/** A building that should reach the café by road but does not. The café itself is the destination, not a candidate. */
export const needsRoad = rec => CONNECTABLE.has(rec.kind) && rec.type !== LANDMARK && !rec.conn;
