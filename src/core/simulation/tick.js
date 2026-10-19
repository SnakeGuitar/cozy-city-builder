// Committing derived results back into the state. These are the only simulation functions that mutate.
import { DEFS } from '../config/catalog.js';
import { easeDemand, nextPopulation } from './demand.js';
/** One simulated second. `derived` must come from computeDerived(state, { mode: 'tick' }). Returns events. */
export function applyTick(state, derived) {
  if (derived.mode !== 'tick') throw new Error('applyTick needs a derived snapshot computed in tick mode');
  const events = [];
  const coins0 = state.coins, pop0 = state.population;
  state.employed = derived.employed;
  state.demand = easeDemand(state.demand, derived.city.target);
  state.population = nextPopulation(state.population, derived.city.attract, derived.city.Rcap);
  state.coins = Math.max(0, state.coins + derived.city.net / 60);
  for (const rec of Object.values(derived.byId)) {
    const b = state.buildings[rec.id]; if (!b) continue;
    if (rec.kind === 'shop' && rec.conn) b.open = rec.open;
    if (rec.kind === 'house') b.well = rec.well;
    if (rec.inc > 0) events.push({ type: 'income_earned', id: rec.id, amount: rec.inc / 60 });
  }
  if (Math.floor(state.coins) !== Math.floor(coins0)) events.push({ type: 'coins_changed', coins: state.coins, delta: state.coins - coins0 });
  if (Math.floor(state.population) !== Math.floor(pop0)) events.push({ type: 'population_changed', population: state.population, delta: Math.floor(state.population) - Math.floor(pop0) });
  return events;
}

/** After a player command: settle lagged memory (home wellbeing order, employment capped by jobs). */
export function commitMemory(state, derived) {
  state.employed = derived.employed;
  for (const rec of Object.values(derived.byId)) if (rec.kind === 'house' && state.buildings[rec.id]) state.buildings[rec.id].well = rec.well;
}
