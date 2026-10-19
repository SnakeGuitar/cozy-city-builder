// Generates tests/fixtures/characterization.golden.json by running the PRE-REFACTOR simulation
// (tools/legacy-reference/catalog.js + sim.js, which relied on script concatenation) inside a Node vm.
// It is kept only as a record of how the golden file was produced; see docs/architecture.md.
import fs from 'node:fs';
import vm from 'node:vm';
import { SCENARIO } from '../tests/fixtures/scenario.mjs';

// Documented fix applied before recording (docs/architecture.md, "Behaviour changes"): an empty or
// disconnected home used to keep the service coverage it had in an earlier tick. It now has none.
const STALE = 'for (const h of houses) if (!h.occ || !h.conn) h.svc[svc] = h.svc[svc] ?? 0;';
const legacySim = fs.readFileSync(new URL('./legacy-reference/sim.js', import.meta.url), 'utf8');
if (!legacySim.includes(STALE)) throw new Error('legacy sim changed; cannot apply the documented fix');
const src = fs.readFileSync(new URL('./legacy-reference/catalog.js', import.meta.url), 'utf8') + '\n' + legacySim.replace(STALE, 'for (const h of houses) if (!h.occ || !h.conn) h.svc[svc] = 0;') +
  '\nglobalThis.L = { S, buildings, grid, get city() { return city; }, recomputeStructure, simulate, GOALS, newBuildingState, occupy, canPlace, DEFS };';
const ctx = vm.createContext({ Math, Map, Set, Int32Array, Uint8Array, Object, Array, JSON, Number });
vm.runInContext(src, ctx);
const L = ctx.L;

// legacy game.js behaviour that lived next to the UI
function checkGoals() { for (const g of L.GOALS) { if (L.S.done.includes(g.id)) continue; const [a, b] = g.prog(); if (a < b) continue; L.S.done.push(g.id); L.S.coins += g.reward; } }
function recompute() { L.recomputeStructure(); L.simulate(false); checkGoals(); }
function tick() { L.simulate(true); checkGoals(); }
function add(type, x, y, r, seed) { const b = L.newBuildingState(type, x, y, r, seed); L.buildings.set(b.id, b); L.occupy(b, b.id); return b; }

Object.assign(L.S, SCENARIO.initial);
for (const [type, x, y, r, seed] of SCENARIO.start) add(type, x, y, r, seed);
recompute();

const pick = v => v === undefined ? null : v;
function snapshot(label) {
  const c = L.city;
  return { label, P: L.S.P, E: L.S.E, coins: L.S.coins, dem: { ...L.S.dem }, done: [...L.S.done],
    city: { Rcap: c.Rcap, homeless: c.homeless, J: c.J, W: c.W, PP: c.PP, shopCap: c.shopCap, goodsNeed: c.goodsNeed, prod: c.prod, sold: c.sold, exported: c.exported,
      income: { ...c.income }, upkeep: c.upkeep, net: c.net, well: c.well, svcScore: c.svcScore, utilMin: c.utilMin, vacantHomes: c.vacantHomes, vacantShops: c.vacantShops, idleInd: c.idleInd,
      util: JSON.parse(JSON.stringify(c.util)), target: { ...c.target }, reasons: JSON.parse(JSON.stringify(c.reasons)), attract: c.attract },
    buildings: [...L.buildings.values()].filter(b => b.type !== 'road').map(b => ({ id: b.id, type: b.type, conn: b.conn, occ: b.occ, well: b.well, staff: b.staff, cust: b.cust,
      inc: pick(b.inc), prod: pick(b.prod), load: b.load, served: [...b.served], open: b.open, wellB: b.wellB, mult: b.mult })) };
}
const out = [];
for (const step of SCENARIO.steps) {
  if (step.tick) for (let i = 0; i < step.tick; i++) tick();
  if (step.place) for (const [type, x, y, r, seed] of step.place) { const why = L.canPlace(type, x, y); if (why) throw new Error(`legacy place ${type}@${x},${y}: ${why}`); L.S.coins -= L.DEFS[type].cost; add(type, x, y, r, seed); recompute(); }
  if (step.demolish) for (const [x, y] of step.demolish) { const b = L.buildings.get(L.grid[y * 24 + x]); L.S.coins += Math.floor(L.DEFS[b.type].cost * .5);
    const s = L.DEFS[b.type].s; for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) L.grid[(b.y + j) * 24 + b.x + i] = 0; L.buildings.delete(b.id); recompute(); }
  if (step.check) out.push(snapshot(step.check));
}
fs.writeFileSync(new URL('../tests/fixtures/characterization.golden.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('golden checkpoints:', out.length);
