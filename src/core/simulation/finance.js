// Money per minute: shop sales, industry sales, resident tax, minus upkeep of every public building.
import { DEFS, ECON } from '../config/catalog.js';

export function computeFinance(things, connected, effects, commerce, industry, townWell, population) {
  const goodsFactor = commerce.goodsNeed ? .75 + .25 * Math.min(1, industry.total / commerce.goodsNeed) : 1;
  const wellMult = .8 + townWell / 250;
  const share = industry.total ? industry.sold / industry.total : 0;
  const income = {};
  for (const b of things) {
    const k = DEFS[b.type].kind;
    if (k === 'shop') income[b.id] = connected[b.id] ? commerce.customers[b.id] * ECON.spend * goodsFactor * wellMult * (1 + effects[b.id].mult / 100) : 0;
    else if (k === 'industry') income[b.id] = industry.production[b.id] * (share * ECON.localPrice + (1 - share) * ECON.exportPrice);
  }
  const sumKind = kind => things.filter(b => DEFS[b.type].kind === kind).reduce((s, b) => s + income[b.id], 0);
  const totals = { shops: sumKind('shop'), industry: sumKind('industry'), tax: population * ECON.tax };
  const upkeep = things.reduce((s, b) => s + (DEFS[b.type].upkeep || 0), 0);
  return { income, totals, upkeep, net: totals.shops + totals.industry + totals.tax - upkeep };
}
