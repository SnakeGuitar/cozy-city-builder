// Local services: a home is attended only if a provider is within range AND has capacity left.
// Homes nearest to a provider are served first; a saturated provider turns the rest away.
import { DEFS, SERVICE_TYPES } from '../config/catalog.js';
import { rectDist } from '../domain/grid.js';
import { statsOf } from '../domain/state.js';
import { efficiency } from './employment.js';

export function computeServices(things, connected, occupancy, staff, broke) {
  const houses = things.filter(b => DEFS[b.type].kind === 'house');
  const coverage = {}, providers = {}, byType = {};
  for (const h of houses) coverage[h.id] = Object.fromEntries(SERVICE_TYPES.map(s => [s, 0]));
  for (const b of things) if (DEFS[b.type].svc) providers[b.id] = { capEff: 0, load: 0, served: [] };
  for (const svc of SERVICE_TYPES) byType[svc] = serveType(svc, things, houses, connected, occupancy, staff, broke, coverage, providers);
  return { byType, providers, coverage };
}
function serveType(svc, things, houses, connected, occupancy, staff, broke, coverage, providers) {
  const prov = things.filter(b => DEFS[b.type].svc === svc && connected[b.id]);
  for (const p of prov) providers[p.id].capEff = statsOf(p).cap * efficiency(staff[p.id], broke);
  const need = houses.filter(h => connected[h.id] && occupancy[h.id] > 0)
    .map(h => ({ h, near: prov.map(p => ({ p, d: rectDist(h, p) })).filter(o => o.d <= statsOf(o.p).r).sort((a, b) => a.d - b.d) }))
    .sort((a, b) => (a.near[0]?.d ?? 99) - (b.near[0]?.d ?? 99));
  let covered = 0, got = 0, total = 0;
  for (const { h, near } of need) {
    const occ = occupancy[h.id]; let want = occ; total += want; if (near.length) covered += want;
    for (const { p } of near) {
      if (want <= 0) break;
      const st = providers[p.id], take = Math.min(want, Math.max(0, st.capEff - st.load));
      if (take > 0) { st.load += take; want -= take; st.served.push(h.id); }
    }
    coverage[h.id][svc] = (occ - want) / occ; got += occ - want;
  }
  return { n: prov.length, cap: prov.reduce((s, p) => s + providers[p.id].capEff, 0), load: prov.reduce((s, p) => s + providers[p.id].load, 0), covered, got, total };
}
