// Home wellbeing: base + connection + neighbourhood effects + service groups − utility shortages.
import { DEFS, SVC_GROUPS } from '../config/catalog.js';
import { clamp } from '../util/math.js';

export function computeWellbeing(things, connected, effects, coverage, utilRatio, population, occupancy) {
  const houses = things.filter(b => DEFS[b.type].kind === 'house');
  const needScale = Math.min(1, population / 40); // missing services only hurt as the town grows
  const byId = {}; let wsum = 0, wn = 0, ssum = 0;
  for (const h of houses) {
    let w = 40 + (connected[h.id] ? 10 : 0) + effects[h.id].wellB, score = 0;
    const groups = {};
    for (const g in SVC_GROUPS) {
      const ks = SVC_GROUPS[g], f = ks.reduce((s, k) => s + (coverage[h.id][k] || 0), 0) / ks.length;
      groups[g] = f; score += f / 4; w += 6 * f - (1 - f) * 5 * needScale;
    }
    w -= (1 - utilRatio.water) * 20 + (1 - utilRatio.power) * 15 + (1 - utilRatio.waste) * 10;
    const well = clamp(Math.round(w), 0, 100), occ = occupancy[h.id];
    byId[h.id] = { well, groups };
    if (occ) { wsum += well * occ; wn += occ; ssum += score * occ; }
  }
  const town = wn ? wsum / wn : (houses.length ? houses.reduce((s, h) => s + byId[h.id].well, 0) / houses.length : 50);
  return { byId, town, serviceScore: wn ? ssum / wn : 1 };
}
