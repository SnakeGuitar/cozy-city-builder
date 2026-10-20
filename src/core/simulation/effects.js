// Neighbourhood effects (fx in the catalogue): wellbeing bonuses for homes and income bonuses for shops/industry.
import { DEFS } from '../config/catalog.js';
import { lotAabb } from '../domain/space.js';
import { lotDistance } from '../domain/geometry.js';

/** @returns {Record<number,{src:{from:number,k:string,v:number}[], wellB:number, mult:number}>} */
export function computeNeighbourEffects(things, connected) {
  const out = {};
  for (const b of things) out[b.id] = { src: [], wellB: 0, mult: 0 };
  const stacked = new Map(); // target|sourceType|kind -> how many sources already counted (fx.max)
  // lots once, and a coarse bucket grid so a source only looks at buildings near it (targets still go in id order)
  const lots = new Map(), CELL = 4, buckets = new Map(), cellsOf = (A, m) => { const out = []; for (let i = Math.floor((A.minX - m) / CELL); i <= Math.floor((A.maxX + m) / CELL); i++) for (let j = Math.floor((A.minZ - m) / CELL); j <= Math.floor((A.maxZ + m) / CELL); j++) out.push(i + ',' + j); return out; };
  things.forEach((b, order) => { const A = lotAabb(b); lots.set(b, A); for (const k of cellsOf(A, 0)) { if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(order); } });
  for (const a of things) {
    const fx = DEFS[a.type].fx; if (!fx) continue;
    const A = lots.get(a), reach = Math.max(...fx.map(f => f.r)), near = new Set();
    for (const k of cellsOf(A, reach)) for (const o of buckets.get(k) || []) near.add(o);
    const candidates = [...near].sort((x, y) => x - y).map(o => things[o]);
    for (const f of fx) for (const b of candidates) if (b !== a && applies(f, a, b, connected) && lotDistance(A, lots.get(b)) <= f.r) {
      const key = b.id + '|' + a.type + '|' + f.k, n = stacked.get(key) || 0;
      if (n >= f.max) continue; stacked.set(key, n + 1);
      const e = out[b.id]; e.src.push({ from: a.id, k: f.k, v: f.v }); if (f.k === 'well') e.wellB += f.v; else e.mult += f.v;
    }
  }
  return out;
}
function applies(f, a, b, connected) {
  const ak = DEFS[a.type].kind, bk = DEFS[b.type].kind;
  if (f.k === 'well') return bk === 'house';
  const target = f.t ? f.t.includes(b.type) : bk === 'shop';
  return target && !((ak === 'shop' || ak === 'industry') && !connected[a.id]); // a business only helps while it is connected
}
