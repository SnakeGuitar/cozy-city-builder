// Goals: pure metrics over (state, derived) plus one function that grants rewards.
import { BASE_UNLOCK, DEFS, LANDMARK } from '../config/catalog.js';
import { rulesFor } from '../config/rules.js';
import { GOALS } from '../config/goals.js';
import { rectDist } from '../domain/grid.js';
import { listBuildings } from '../domain/state.js';

const homes = (state, derived) => Object.values(derived.byId).filter(r => r.kind === 'house');
export const METRICS = {
  hasCafe: s => Object.values(s.buildings).some(b => b.type === LANDMARK) ? 1 : 0,
  connectedHomes: (s, d) => homes(s, d).filter(r => r.conn).length,
  connectedBakeries: (s, d) => Object.values(d.byId).some(r => r.type === 'bakery' && r.conn) ? 1 : 0,
  gardenNextToHome: s => { const l = listBuildings(s); return l.some(g => g.type === 'garden' && l.some(h => DEFS[h.type].kind === 'house' && rectDist(g, h) <= 2)) ? 1 : 0; },
  employed: (s, d) => Math.floor(d.employed),
  population: s => Math.floor(s.population),
  utilitiesFor40: (s, d) => s.population >= 40 && d.city.utilMin >= .999 ? 1 : 0,
  happyHomes: (s, d) => homes(s, d).filter(r => r.occ > 0 && r.well >= 75).length,
};

/** [current, target] for a goal definition. */
export function goalProgress(goal, state, derived) { return [METRICS[goal.metric](state, derived), goal.target]; }

/** Types the player may build: the base set plus everything unlocked by completed goals. */
export function unlockedTypes(state, goals = GOALS) {
  if (rulesFor(state).allBuildingsUnlocked) return new Set(Object.keys(DEFS));
  const u = new Set(BASE_UNLOCK);
  for (const g of goals) if (state.goalsDone.includes(g.id)) g.unlock.forEach(t => u.add(t));
  return u;
}

/** Completes every goal whose metric reached its target: adds the reward, records it, returns events. */
export function completeGoals(state, derived, goals = GOALS) {
  const events = [];
  if (!rulesFor(state).goalsEnabled) return events;
  for (const g of goals) {
    if (state.goalsDone.includes(g.id)) continue;
    const [a, b] = goalProgress(g, state, derived); if (a < b) continue;
    state.goalsDone.push(g.id); state.coins += g.reward;
    events.push({ type: 'goal_completed', goalId: g.id, reward: g.reward });
    events.push({ type: 'mascot_message_requested', messageId: 'm_goal', mood: 'cheer', params: { goalId: g.id }, reason: 'goal' });
    if (g.unlock.length) {
      events.push({ type: 'types_unlocked', goalId: g.id, types: [...g.unlock] });
      events.push({ type: 'mascot_message_requested', messageId: 'm_unlock', mood: 'happy', params: { types: [...g.unlock] }, reason: 'unlock' });
    }
  }
  return events;
}
