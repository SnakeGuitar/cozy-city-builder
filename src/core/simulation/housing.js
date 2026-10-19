// Residents move into the nicest connected homes first (by last tick's wellbeing, then id).
import { DEFS } from '../config/catalog.js';

export const homeCapacity = h => Math.round(DEFS[h.type].cap * (h.well >= 75 ? 1.15 : 1));

export function allocateHousing(houses, connected, population) {
  const linked = houses.filter(h => connected[h.id]);
  const occupancy = {}, capacityById = {};
  for (const h of houses) { occupancy[h.id] = 0; capacityById[h.id] = homeCapacity(h); }
  const capacity = linked.reduce((s, h) => s + capacityById[h.id], 0);
  let rest = Math.floor(population);
  for (const h of [...linked].sort((a, b) => b.well - a.well || a.id - b.id)) { occupancy[h.id] = Math.min(capacityById[h.id], rest); rest -= occupancy[h.id]; }
  const vacantHomes = linked.filter(h => occupancy[h.id] === 0).length + houses.length - linked.length;
  return { capacity, homeless: rest, vacantHomes, occupancy, capacityById };
}
