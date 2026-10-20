// The game controller: the single boundary between the rules (core/) and any front end.
// A front end sends commands, advances time, reads snapshots and drains plain-data events.
import { DAY_LENGTH, TICK_SECONDS } from '../core/config/world.js';
import { rulesFor } from '../core/config/rules.js';
import { createNewGameState } from '../core/domain/state.js';
import { computeDerived, applyTick, commitMemory } from '../core/simulation/index.js';
import { completeGoals, unlockedTypes } from '../core/goals/goals.js';
import { executeCommand, STRUCTURAL, CMD, ROAD_COMMANDS } from '../core/commands/commands.js';
import { serializeRoads } from '../core/domain/roads.js';
import { advanceTutorial, tutorialMessage, needsRoad } from '../core/tutorial/tutorial.js';
import { adviseNow } from '../core/mascot/advisor.js';
import { serializeGame } from '../core/persistence/save.js';

export const newGameState = (mode = 'normal') => createNewGameState(mode);
const NO_ROAD_REMINDER = 15; // simulated seconds between "this needs a road" reminders after placing
const UNDO_LIMIT = 50;      // road operations kept for undo

/**
 * @param {{ state?: object }} [options] start from a given state (e.g. a loaded save) or a new empty normal game
 * @returns the game API: dispatch, step, tick, getSnapshot, drainEvents, serialize, unlocked, rules, replaceState
 */
export function createGame({ state } = {}) {
  let s = state || newGameState();
  let derived = null, accumulator = 0, simSeconds = 0;
  let advice = { now: 0, last: -Infinity, lastById: {} };
  // undo / redo of road operations: snapshots of the network before and after, and the coins they moved
  let undo = [], redo = [];
  const queue = [];
  const emit = list => { for (const e of list) if (e) queue.push(e); };

  // the town settles after any structural change: memory is committed, goals and tutorial are checked
  function settle() { const d = computeDerived(s); commitMemory(s, d); derived = d; emit(completeGoals(s, d)); emit(advanceTutorial(s, d)); }
  function tick() {
    const d = computeDerived(s, { mode: 'tick' }); emit(applyTick(s, d)); derived = d;
    emit(completeGoals(s, d)); emit(advanceTutorial(s, d));
    simSeconds += TICK_SECONDS; advice.now = simSeconds;
    if (s.tutorial.step === 'done') { const r = adviseNow(s, d, advice); advice = r.memory; emit([r.event]); }
    emit([{ type: 'tick' }]);
  }
  function remindRoad(res) {
    const rec = res.ok && derived.byId[res.id];
    if (!rec || !needsRoad(rec) || !derived.hasCafe || s.tutorial.step !== 'done') return;
    if (simSeconds - (advice.lastById.m_no_road ?? -Infinity) < NO_ROAD_REMINDER) return;
    advice = { ...advice, lastById: { ...advice.lastById, m_no_road: simSeconds } };
    emit([{ type: 'mascot_message_requested', messageId: 'm_no_road', mood: 'alert', params: { buildingType: rec.type }, reason: 'advice' }]);
  }
  function travel(from, to, side, sign) {
    const h = from.pop(); if (!h) return null;
    const res = executeCommand(s, { type: CMD.RestoreRoads, roads: h[side], coins: sign * h.coins }); // undo gives back what the operation took (and vice versa)
    emit(res.events);
    if (res.ok) { to.push(h); settle(); } else from.push(h);
    emit([{ type: 'road_history', undo: undo.length, redo: redo.length }]);
    return res;
  }
  settle();

  return {
    /** Runs one command. Structural commands re-settle the town; tutorial signals may advance the tutorial. */
    dispatch(cmd) {
      const road = cmd && ROAD_COMMANDS.has(cmd.type), before = road && serializeRoads(s), coins0 = s.coins;
      const res = executeCommand(s, cmd); emit(res.events);
      if (road && res.ok) { undo.push({ before, after: serializeRoads(s), coins: s.coins - coins0 }); if (undo.length > UNDO_LIMIT) undo.shift(); redo = []; emit([{ type: 'road_history', undo: undo.length, redo: 0 }]); }
      if (res.ok && STRUCTURAL.has(cmd.type)) { settle(); if (cmd.type === CMD.Place || cmd.type === CMD.Move) remindRoad(res); }
      else if (res.ok && cmd.type === CMD.TutorialSignal) emit(advanceTutorial(s, derived || computeDerived(s)));
      return res;
    },
    /** Undoes the last road operation (build, demolish, edit). Returns the command result, or null with nothing to undo. */
    undoRoad() { return travel(undo, redo, 'before', -1); },
    /** Redoes the last undone road operation. */
    redoRoad() { return travel(redo, undo, 'after', 1); },
    get roadHistory() { return { undo: undo.length, redo: redo.length }; },
    /** Advances real time; the simulation runs in fixed 1-second ticks, so the result does not depend on frame rate. */
    step(realSeconds) {
      if (s.clock.paused || !(realSeconds > 0)) return 0;
      const sim = realSeconds * s.clock.speed;
      s.clock.time += sim / DAY_LENGTH;
      if (s.clock.time >= 1) { s.clock.time -= 1; s.clock.day++; emit([{ type: 'day_changed', day: s.clock.day }]); }
      accumulator += sim; let n = 0;
      while (accumulator >= TICK_SECONDS) { accumulator -= TICK_SECONDS; tick(); n++; }
      return n;
    },
    /** Runs exactly one simulated second, regardless of speed or pause (tests, tools). */
    tick,
    /** Read-only view: { state, derived }. Do not mutate either; send commands instead. */
    getSnapshot() { if (!derived) derived = computeDerived(s); return { state: s, derived }; },
    drainEvents() { return queue.splice(0, queue.length); },
    serialize() { return serializeGame(s); },
    unlocked() { return unlockedTypes(s); },
    rules() { return rulesFor(s); },
    /**
     * Swaps in another state (new game, load, other mode). `reason` is 'new' or 'load'.
     * Emits `state_replaced`, then the mascot's opening line for this session.
     */
    replaceState(next, reason = 'load') {
      s = next; accumulator = 0; simSeconds = 0; advice = { now: 0, last: -Infinity, lastById: {} }; queue.length = 0; derived = null; undo = []; redo = [];
      settle(); queue.length = 0; // a load settles silently: no replayed goals or tutorial steps
      emit([{ type: 'state_replaced', mode: s.mode, reason }]);
      const opening = tutorialMessage(s)
        || (s.mode === 'sandbox' ? { type: 'mascot_message_requested', messageId: 'm_sandbox', mood: 'cheer', params: {}, reason: 'session' }
        : reason === 'load' ? { type: 'mascot_message_requested', messageId: 'm_welcome_back', mood: 'wave', params: {}, reason: 'session' } : null);
      emit([opening]);
    },
  };
}
