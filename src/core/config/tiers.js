// Building tiers as data. Tier 1 is the catalogue entry itself; tiers 2 and 3 scale it along a ladder per kind.
// Every catalogue entry of an upgradable kind gets an explicit `tiers` table (see catalog.js), e.g. for the bakery:
//   [{ level: 1, upgradeCost: 0,   jobs: 3, cust: 20, goods: 2,   upkeep: 0, model: 'bakery_t1' },
//    { level: 2, upgradeCost: 115, jobs: 5, cust: 32, goods: 3,   upkeep: 2, model: 'bakery_t2' },
//    { level: 3, upgradeCost: 210, jobs: 6, cust: 48, goods: 4.5, upkeep: 4, model: 'bakery_t3' }]
// The rules read a building's numbers only through tierStats / statsOf, so no system or UI repeats these formulas.
export const MAX_TIER = 3;
/** Stats a tier may change. `r` (service radius) is added, the others are multiplied. */
export const TIER_STATS = Object.freeze(['cap', 'jobs', 'cust', 'goods', 'out', 'upkeep', 'r']);

// cost: upgrade cost as a fraction of the build cost · mul: multipliers over tier 1 · add: additions (radius, upkeep)
export const TIER_LADDERS = Object.freeze({
  house:    [{ cost: .8, mul: { cap: 1.5 }, add: { upkeep: 1 } }, { cost: 1.5, mul: { cap: 2.1 }, add: { upkeep: 2 } }],
  shop:     [{ cost: .9, mul: { jobs: 1.5, cust: 1.6, goods: 1.5 }, add: { upkeep: 2 } }, { cost: 1.6, mul: { jobs: 2, cust: 2.4, goods: 2.2 }, add: { upkeep: 4 } }],
  industry: [{ cost: .9, mul: { jobs: 1.4, out: 1.5 }, add: { upkeep: 3 } }, { cost: 1.6, mul: { jobs: 1.9, out: 2.1 }, add: { upkeep: 6 } }],
  service:  [{ cost: .8, mul: { cap: 1.5, jobs: 1.3, upkeep: 1.4 }, add: { r: 1 } }, { cost: 1.5, mul: { cap: 2, jobs: 1.7, upkeep: 1.9 }, add: { r: 2 } }],
  utility:  [{ cost: .8, mul: { cap: 1.6, jobs: 1.3, upkeep: 1.4 } }, { cost: 1.5, mul: { cap: 2.3, jobs: 1.7, upkeep: 1.9 } }],
});
const NOMINAL_COST = 200; // the free café still has a price for its upgrades

const roundStat = (k, v) => (k === 'goods' || k === 'out') ? Math.round(v * 2) / 2 : Math.round(v);
/** The explicit tier table of one catalogue entry, or undefined for kinds that do not upgrade. */
export function buildTiers(id, def) {
  const ladder = TIER_LADDERS[def.kind]; if (!ladder) return undefined;
  const base = {}; for (const k of TIER_STATS) if (typeof def[k] === 'number') base[k] = def[k];
  if (base.upkeep === undefined) base.upkeep = 0;
  const tiers = [Object.freeze({ level: 1, upgradeCost: 0, ...base, model: `${id}_t1` })];
  ladder.forEach((step, i) => {
    const t = { level: i + 2, upgradeCost: Math.round((def.cost || NOMINAL_COST) * step.cost / 5) * 5 };
    for (const k of Object.keys(base)) t[k] = roundStat(k, base[k] * (step.mul?.[k] ?? 1) + (step.add?.[k] ?? 0));
    t.model = `${id}_t${i + 2}`;
    tiers.push(Object.freeze(t));
  });
  return Object.freeze(tiers);
}
