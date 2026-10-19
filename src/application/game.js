// The game controller: the single boundary between the rules (core/) and any front end.
// A front end sends commands, advances time, reads snapshots and drains plain-data events.
import { DAY_LENGTH, TICK_SECONDS } from '../core/config/world.js';
import { createNewGameState } from '../core/domain/state.js';
import { insertBuilding } from '../core/domain/grid.js';
import { computeDerived, applyTick, commitMemory } from '../core/simulation/index.js';
import { completeGoals, unlockedTypes } from '../core/goals/goals.js';
import { executeCommand, STRUCTURAL } from '../core/commands/commands.js';
import { serializeGame } from '../core/persistence/save.js';

export const newGameState = () => createNewGameState(insertBuilding);

/**
 * @param {{ state?: object }} [options] start from a given state (e.g. a loaded save) or a new game
 * @returns the game API: dispatch, step, tick, getSnapshot, drainEvents, serialize, unlocked, replaceState
 */
export function createGame({ state } = {}) {
  let s = state || newGameState();
  let derived = null, accumulator = 0;
  const queue = [];
  const emit = list => { for (const e of list) queue.push(e); };

  // the town settles after any structural change: memory is committed and goals are checked
  function settle() { const d = computeDerived(s); commitMemory(s, d); derived = d; emit(completeGoals(s, d)); }
  function tick() { const d = computeDerived(s, { mode: 'tick' }); emit(applyTick(s, d)); derived = d; emit(completeGoals(s, d)); emit([{ type: 'tick' }]); }
  settle();

  return {
    /** Runs one command. Structural commands re-settle the town. */
    dispatch(cmd) {
      const res = executeCommand(s, cmd); emit(res.events);
      if (res.ok && STRUCTURAL.has(cmd.type)) settle();
      return res;
    },
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
    /** Swaps in a new state (new game or load). Emits `state_replaced` so views rebuild. */
    replaceState(next) { s = next; accumulator = 0; queue.length = 0; settle(); emit([{ type: 'state_replaced' }]); },
  };
}
