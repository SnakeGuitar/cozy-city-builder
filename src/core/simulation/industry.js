// Light industry makes goods: local shops buy first, the surplus is exported at a lower price.
import { DEFS } from '../config/catalog.js';

export function computeIndustry(things, connected, effects, staff, powerRatio, goodsNeed) {
  const production = {};
  for (const b of things) if (DEFS[b.type].kind === 'industry')
    production[b.id] = connected[b.id] ? DEFS[b.type].out * staff[b.id] * Math.sqrt(powerRatio) * (1 + effects[b.id].mult / 100) : 0;
  const total = Object.values(production).reduce((a, v) => a + v, 0);
  const sold = Math.min(total, goodsNeed);
  const idle = things.filter(b => DEFS[b.type].kind === 'industry' && (!connected[b.id] || staff[b.id] < .05)).length;
  return { production, total, sold, exported: total - sold, idle };
}
