// Jobs and staffing. Employment eases toward min(workforce, jobs): at most +1 / -1.5 workers per tick.
import { DEFS, ECON } from '../config/catalog.js';
import { clamp } from '../util/math.js';

export const isWorkplace = (b, connected) => !!DEFS[b.type].jobs && connected[b.id] && b.open !== false;

/** mode 'tick' advances employment one step; 'snapshot' only caps it at the current target (never raises it). */
export function computeEmployment(things, connected, population, employedNow, mode) {
  const jobs = things.filter(b => isWorkplace(b, connected)).reduce((s, b) => s + DEFS[b.type].jobs, 0);
  const workforce = population * ECON.workRate;
  const target = Math.min(workforce, jobs);
  let employed = employedNow;
  if (mode === 'tick') employed += clamp(target - employed, -1.5, 1);
  employed = clamp(employed, 0, target + .001);
  const staffRatio = jobs ? employed / jobs : 0;
  const staff = {};
  for (const b of things) staff[b.id] = isWorkplace(b, connected) ? staffRatio : 0;
  return { jobs, workforce, target, employed, staffRatio, staff };
}
/** How hard a public building works: half capacity unstaffed, 70 % while the town is out of money. */
export const efficiency = (staff, broke) => (.5 + .5 * staff) * (broke ? .7 : 1);
