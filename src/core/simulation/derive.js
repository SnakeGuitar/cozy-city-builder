// The simulation contract
// -----------------------
// computeDerived(state, { mode }) is PURE: it reads the state and returns a new "derived" snapshot.
//   mode 'snapshot' — what the town looks like right now (after a command, for the UI).
//   mode 'tick'     — the same, but with employment advanced one step; applyTick commits it.
// applyTick(state, derived) commits one simulated second (employment, demand, population, money,
//   shop doors and wellbeing memory). commitMemory(state, derived) commits only the lagged memory
//   after a player command, exactly as the town settles between ticks.
import { DEFS, LANDMARK, isRoadType } from '../config/catalog.js';
import { rulesFor } from '../config/rules.js';
import { listBuildings } from '../domain/state.js';
import { computeRoadNetwork } from './roads.js';
import { computeNeighbourEffects } from './effects.js';
import { allocateHousing } from './housing.js';
import { computeEmployment } from './employment.js';
import { computeUtilities } from './utilities.js';
import { computeServices } from './services.js';
import { computeWellbeing } from './wellbeing.js';
import { computeCommerce } from './commerce.js';
import { computeIndustry } from './industry.js';
import { computeFinance } from './finance.js';
import { computeDemand } from './demand.js';

export function computeDerived(state, { mode = 'snapshot' } = {}) {
  const things = listBuildings(state).filter(b => !isRoadType(b.type));
  const kind = b => DEFS[b.type].kind;
  const rules = rulesFor(state);
  const broke = !rules.unlimitedMoney && state.coins <= 0;
  const hasCafe = things.some(b => b.type === LANDMARK);
  const roads = computeRoadNetwork(state, things);
  const { connected } = roads;
  const effects = computeNeighbourEffects(things, connected);
  const houses = things.filter(b => kind(b) === 'house');
  const housing = allocateHousing(houses, connected, state.population);
  const work = computeEmployment(things, connected, state.population, state.employed, mode);
  const utilities = computeUtilities(things, connected, housing.occupancy, work.staff, broke);
  const services = computeServices(things, connected, housing.occupancy, work.staff, broke);
  const wellbeing = computeWellbeing(things, connected, effects, services.coverage, utilities.ratio, state.population, housing.occupancy);
  const commerce = computeCommerce(things, connected, effects, work.staffRatio, state.population, work.employed, hasCafe);
  const industry = computeIndustry(things, connected, effects, work.staff, utilities.ratio.power, commerce.goodsNeed);
  const finance = computeFinance(things, connected, effects, commerce, industry, wellbeing.town, state.population);
  const demand = computeDemand({ jobs: work.jobs, workforce: work.workforce, capacity: housing.capacity, population: state.population, townWell: wellbeing.town,
    utilMin: utilities.min, serviceScore: wellbeing.serviceScore, homeless: housing.homeless, PP: commerce.PP, shopCap: commerce.shopCap,
    vacantShops: commerce.vacantShops, goodsNeed: commerce.goodsNeed, prod: industry.total, hasIndustry: things.some(b => kind(b) === 'industry'),
    hasHomes: houses.length > 0, hasCafe });

  const byId = {};
  for (const b of things) {
    const k = kind(b), e = effects[b.id];
    const rec = { id: b.id, type: b.type, tier: b.tier || 1, kind: k, conn: connected[b.id], src: e.src, wellB: e.wellB, mult: e.mult, staff: work.staff[b.id] };
    if (k === 'house') Object.assign(rec, { occ: housing.occupancy[b.id], cap: housing.capacityById[b.id], well: wellbeing.byId[b.id].well, groups: wellbeing.byId[b.id].groups, svc: services.coverage[b.id] });
    if (k === 'shop') Object.assign(rec, { open: commerce.open[b.id], cust: commerce.customers[b.id], inc: finance.income[b.id] });
    if (k === 'industry') Object.assign(rec, { prod: industry.production[b.id], inc: finance.income[b.id] });
    if (services.providers[b.id]) Object.assign(rec, services.providers[b.id]);
    byId[b.id] = rec;
  }
  return {
    mode, byId, hasCafe, empty: things.length === 0,
    roads: { mainNodes: roads.mainNodes, mainSegments: roads.mainSegments },
    employed: work.employed,
    city: {
      Rcap: housing.capacity, homeless: housing.homeless, vacantHomes: housing.vacantHomes,
      J: work.jobs, W: work.workforce, employed: work.employed,
      util: utilities.byUtil, ratio: utilities.ratio, utilMin: utilities.min, svc: services.byType,
      well: wellbeing.town, svcScore: wellbeing.serviceScore,
      PP: commerce.PP, shopCap: commerce.shopCap, vacantShops: commerce.vacantShops, goodsNeed: commerce.goodsNeed,
      prod: industry.total, sold: industry.sold, exported: industry.exported, idleInd: industry.idle,
      income: finance.totals, upkeep: finance.upkeep, net: finance.net,
      attract: demand.attract, target: demand.target, terms: demand.terms, reasons: demand.reasons,
    },
  };
}
