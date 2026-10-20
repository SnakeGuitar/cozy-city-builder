// Commerce: purchasing power (residents, wages and a few visitors) is shared across open shops.
// When there is far more shop space than spending, the least attractive shops stand vacant.
import { DEFS, LANDMARK } from '../config/catalog.js';

// The 6 visitors come for Café Limón: before the café exists there are none.
export const purchasingPower = (population, employed, hasCafe = true) => (hasCafe ? 6 : 0) + population * .5 + employed * .9;

export function computeCommerce(things, connected, effects, staffRatio, population, employed, hasCafe = true) {
  const PP = purchasingPower(population, employed, hasCafe);
  const shops = things.filter(b => DEFS[b.type].kind === 'shop' && connected[b.id])
    .sort((a, b) => (b.type === LANDMARK) - (a.type === LANDMARK) || effects[b.id].mult - effects[a.id].mult || a.id - b.id);
  const capOf = s => DEFS[s.type].cust * (.4 + .6 * staffRatio);
  let openCount = 0, openCap = 0;
  for (const s of shops) { if (openCount && PP / (openCap + capOf(s)) < .3) break; openCap += capOf(s); openCount++; }
  const use = openCap ? Math.min(1, PP / openCap) : 0;
  const open = {}, customers = {};
  for (const b of things) if (DEFS[b.type].kind === 'shop') { open[b.id] = false; customers[b.id] = 0; }
  shops.forEach((s, i) => { open[s.id] = i < openCount; customers[s.id] = open[s.id] ? capOf(s) * use : 0; });
  const vacantShops = things.filter(b => DEFS[b.type].kind === 'shop' && !open[b.id]).length;
  const goodsNeed = shops.filter(s => open[s.id]).reduce((sum, b) => sum + DEFS[b.type].goods * (customers[b.id] / DEFS[b.type].cust), 0);
  return { PP, shopCap: shops.reduce((a, s) => a + capOf(s), 0), open, customers, vacantShops, goodsNeed, connectedShops: shops };
}
