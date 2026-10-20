// Water, power and waste: one town-wide capacity per utility, no pipes or cables.
import { BASE_SUPPLY, DEFS, USE, UTILS } from '../config/catalog.js';
import { statsOf } from '../domain/state.js';
import { efficiency } from './employment.js';

export function computeUtilities(things, connected, occupancy, staff, broke) {
  const byUtil = {}, ratio = {}; let min = 1;
  for (const u of UTILS) {
    const supply = BASE_SUPPLY[u] + things.filter(b => DEFS[b.type].util === u && connected[b.id]).reduce((s, b) => s + statsOf(b).cap * efficiency(staff[b.id], broke), 0);
    let use = 0;
    for (const b of things) {
      const k = DEFS[b.type].kind;
      if (k === 'house') use += occupancy[b.id] * USE.house[u];
      else if (USE[k] && connected[b.id] && b.open !== false) use += USE[k][u];
    }
    const r = use ? Math.min(1, supply / use) : 1;
    byUtil[u] = { supply, use, ratio: r }; ratio[u] = r; min = Math.min(min, r);
  }
  return { byUtil, ratio, min };
}
