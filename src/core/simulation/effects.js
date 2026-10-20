// Neighbourhood effects (fx in the catalogue): wellbeing bonuses for homes and income bonuses for shops/industry.
import { DEFS } from '../config/catalog.js';
import { rectDist } from '../domain/space.js';

/** @returns {Record<number,{src:{from:number,k:string,v:number}[], wellB:number, mult:number}>} */
export function computeNeighbourEffects(things, connected) {
  const out = {};
  for (const b of things) out[b.id] = { src: [], wellB: 0, mult: 0 };
  const stacked = new Map(); // target|sourceType|kind -> how many sources already counted (fx.max)
  for (const a of things) {
    const fx = DEFS[a.type].fx; if (!fx) continue;
    for (const f of fx) for (const b of things) if (b !== a && applies(f, a, b, connected) && rectDist(a, b) <= f.r) {
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
