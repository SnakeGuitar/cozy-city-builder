// R·C·I demand. Each demand is a sum of named, bounded terms; the two largest |terms| are the reasons shown.
// `attract` (the R terms without vacancy/homeless) drives population growth.
import { clamp } from '../util/math.js';

export function computeDemand(m) {
  const jobsFree = m.jobs - m.workforce, vac = m.capacity ? (m.capacity - m.population) / m.capacity : 0;
  const r = [
    [clamp(jobsFree * 2.5, -35, 40), jobsFree > 0 ? (vac < .15 ? 'rs_jobs_free' : 'rs_jobs_pull') : 'rs_no_jobs'],
    [(m.townWell - 55) * .6, m.townWell >= 55 ? 'rs_pleasant' : 'rs_unpleasant'],
    [-(1 - m.utilMin) * 50, 'rs_utils'],
    [m.population > 20 ? -(1 - m.serviceScore) * 20 : 0, 'rs_services'],
    [m.population < 12 ? 25 : 0, 'rs_start']];
  const attract = r.reduce((a, x) => a + x[0], 0);
  r.push([-Math.max(0, vac - .1) * 90, 'rs_vacant'], [m.homeless > 0 ? 15 : 0, 'rs_homeless']);
  const c = [[clamp((m.PP - m.shopCap) / Math.max(10, m.PP, m.shopCap) * 100, -100, 100),
    m.PP > m.shopCap ? 'cs_unmet' : m.vacantShops ? 'cs_surplus' : m.population < 10 ? 'cs_few' : 'cs_covered']];
  const i = [
    [clamp((m.workforce - m.jobs) * 2.5, -40, 45), m.workforce > m.jobs ? 'is_workers' : 'is_jobs_surplus'],
    [clamp((m.goodsNeed - m.prod) / Math.max(4, m.goodsNeed) * 50, -40, 45), m.goodsNeed > m.prod ? 'is_goods' : 'is_overprod'],
    [!m.hasIndustry && m.population >= 8 ? 15 : 0, 'is_start']];
  const total = T => clamp(T.reduce((a, x) => a + x[0], 0), -100, 100);
  const why = (T, calm) => { const w = T.filter(x => Math.abs(x[0]) >= 3).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 2).map(x => x[1]); return w.length ? w : [calm]; };
  return { attract, terms: { r, c, i }, target: { r: total(r), c: total(c), i: total(i) }, reasons: { r: why(r, 'rs_balanced'), c: why(c, 'cs_covered'), i: why(i, 'is_balanced') } };
}

/** Demand eases 8 % toward its target each tick. */
export const easeDemand = (demand, target) => ({ r: demand.r + (target.r - demand.r) * .08, c: demand.c + (target.c - demand.c) * .08, i: demand.i + (target.i - demand.i) * .08 });

/** Population follows attractiveness and never jumps; residents beyond capacity leave at 0.5 per tick. */
export function nextPopulation(P, attract, capacity) {
  if (attract > 0 && P < capacity) P += Math.min(capacity - P, .05 + attract / 100 * .35);
  else if (attract < -15 && P > 0) P -= Math.min(P, (-attract - 15) / 100 * .2);
  if (P > capacity) P -= Math.min(P - capacity, .5);
  return P;
}
