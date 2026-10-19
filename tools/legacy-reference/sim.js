
// ================================================================ simulation rules (no rendering in here)
const S = { coins: 600, P: 4, E: 2, dem: { r: 30, c: 0, i: 10 }, time: .3, day: 1, speed: 1, paused: false, done: [], newT: [], muted: false, tips: true,
  tut: { moved: false, age: 0, free: 0 }, tab: 'homes', filt: { fam: 'all', era: 'all' }, nextId: 1 };
const buildings = new Map();
const grid = new Int32Array(N * N);
let roadComp = new Uint8Array(N * N), mainRoads = [];
// city snapshot, rebuilt every simulated second
let city = { Rcap: 0, homeless: 0, J: 0, W: 0, util: {}, ratio: { water: 1, power: 1, waste: 1 }, utilMin: 1, PP: 0, shopCap: 0, goodsNeed: 0, prod: 0, sold: 0, exported: 0,
  income: { shops: 0, industry: 0, tax: 0 }, upkeep: 0, net: 0, well: 50, svcScore: 1, vacantHomes: 0, vacantShops: 0, idleInd: 0, reasons: { r: [], c: [], i: [] }, target: { r: 0, c: 0, i: 0 }, attract: 0, svc: {} };

const all = () => [...buildings.values()];
const things = () => all().filter(b => b.type !== 'road');
const kindOf = b => DEFS[b.type].kind;
const inside = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const unlocked = () => { const u = new Set(BASE_UNLOCK); for (const g of GOALS) if (S.done.includes(g.id)) g.unlock.forEach(x => u.add(x)); return u; };
function rectDist(a, b) { const sa = DEFS[a.type].s, sb = DEFS[b.type].s; const dx = Math.max(0, a.x - (b.x + sb - 1), b.x - (a.x + sa - 1)), dy = Math.max(0, a.y - (b.y + sb - 1), b.y - (a.y + sa - 1)); return Math.max(dx, dy); }
function adjTiles(b) { const s = DEFS[b.type].s, o = []; for (let i = 0; i < s; i++) o.push([b.x + i, b.y - 1], [b.x + i, b.y + s], [b.x - 1, b.y + i], [b.x + s, b.y + i]); return o.filter(([x, y]) => inside(x, y)); }
const isRoad = (x, y) => inside(x, y) && grid[y * N + x] && buildings.get(grid[y * N + x]).type === 'road';
function canPlace(type, x, y) {
  const s = DEFS[type].s;
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) { if (!inside(x + i, y + j)) return 'outside'; if (grid[(y + j) * N + x + i]) return 'blocked'; }
  return null;
}
function occupy(b, id) { const s = DEFS[b.type].s; for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) grid[(b.y + j) * N + b.x + i] = id; }
function newBuildingState(type, x, y, r, seed, id) {
  return { id: id ?? S.nextId++, type, x, y, r, seed, conn: false, src: [], wellB: 0, mult: 0, well: 50, occ: 0, staff: 0, open: true, cust: 0, load: 0, served: [], svc: {}, pending: 0, popT: 3 + (seed % 40) / 10 };
}

// ---------------------------------------------------------------- structure: roads, connections and neighbourhood effects
function recomputeStructure() {
  roadComp = new Uint8Array(N * N); mainRoads = [];
  const cafe = things().find(b => b.type === 'cafe');
  if (cafe) {
    const q = [];
    for (const [x, y] of adjTiles(cafe)) if (isRoad(x, y) && !roadComp[y * N + x]) { roadComp[y * N + x] = 1; q.push([x, y]); }
    while (q.length) { const [x, y] = q.pop(); mainRoads.push([x, y]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (isRoad(nx, ny) && !roadComp[ny * N + nx]) { roadComp[ny * N + nx] = 1; q.push([nx, ny]); } } }
  }
  const list = things();
  for (const b of list) { b.conn = b.type === 'cafe' ? mainRoads.length > 0 : adjTiles(b).some(([x, y]) => roadComp[y * N + x]); b.src = []; b.wellB = 0; b.mult = 0; }
  const counts = new Map();
  for (const a of list) { const fx = DEFS[a.type].fx; if (!fx) continue; const ak = kindOf(a);
    for (const f of fx) for (const b of list) {
      if (b === a) continue; const bk = kindOf(b);
      if (f.k === 'well' && bk !== 'house') continue;
      if (f.k === 'inc') { const ok = f.t ? f.t.includes(b.type) : bk === 'shop'; if (!ok || ((ak === 'shop' || ak === 'industry') && !a.conn)) continue; }
      if (rectDist(a, b) > f.r) continue;
      const key = b.id + '|' + a.type + '|' + f.k, c = counts.get(key) || 0; if (c >= f.max) continue; counts.set(key, c + 1);
      b.src.push({ from: a.id, k: f.k, v: f.v }); if (f.k === 'well') b.wellB += f.v; else b.mult += f.v;
    } }
}

// ---------------------------------------------------------------- one simulated second
const capOf = h => Math.round(DEFS[h.type].cap * (h.well >= 75 ? 1.15 : 1));
function simulate(apply = true) {
  const list = things(), D = b => DEFS[b.type];
  const houses = list.filter(b => kindOf(b) === 'house'), connHouses = houses.filter(h => h.conn);
  const broke = S.coins <= 0;
  // housing: residents move into the nicest connected homes first
  for (const h of houses) h.occ = 0;
  city.Rcap = connHouses.reduce((s, h) => s + capOf(h), 0);
  let rem = Math.floor(S.P);
  for (const h of [...connHouses].sort((a, b) => b.well - a.well || a.id - b.id)) { h.occ = Math.min(capOf(h), rem); rem -= h.occ; }
  city.homeless = rem; city.vacantHomes = connHouses.filter(h => h.occ === 0).length + houses.filter(h => !h.conn).length;
  // jobs and staffing
  const work = list.filter(b => D(b).jobs && b.conn && b.open !== false);
  city.J = work.reduce((s, b) => s + D(b).jobs, 0);
  city.W = S.P * ECON.workRate;
  const eTarget = Math.min(city.W, city.J);
  if (apply) S.E += clamp(eTarget - S.E, -1.5, 1);
  S.E = clamp(S.E, 0, eTarget + .001);
  const staff = city.J ? S.E / city.J : 0;
  for (const b of list) b.staff = D(b).jobs && b.conn && b.open !== false ? staff : 0;
  const eff = b => (.5 + .5 * b.staff) * (broke ? .7 : 1);
  // utilities: global capacity, no pipes or cables
  const util = {}; let utilMin = 1;
  for (const u of UTILS) {
    const supply = BASE_SUPPLY[u] + list.filter(b => D(b).util === u && b.conn).reduce((s, b) => s + D(b).cap * eff(b), 0);
    let use = 0; for (const h of houses) use += h.occ * USE.house[u];
    for (const b of list) { const k = kindOf(b); if (USE[k] && k !== 'house' && b.conn && b.open !== false) use += USE[k][u]; }
    const ratio = use ? Math.min(1, supply / use) : 1; util[u] = { supply, use, ratio }; city.ratio[u] = ratio; utilMin = Math.min(utilMin, ratio);
  }
  city.util = util; city.utilMin = utilMin;
  // local services: coverage radius AND capacity — a saturated service does not attend
  const svcState = {};
  for (const svc of ['edu', 'health', 'fire', 'police', 'culture', 'leisure']) {
    const prov = list.filter(b => D(b).svc === svc && b.conn);
    for (const p of prov) { p.load = 0; p.served = []; p.capEff = D(p).cap * eff(p); }
    const need = connHouses.filter(h => h.occ > 0).map(h => ({ h, near: prov.map(p => ({ p, d: rectDist(h, p) })).filter(o => o.d <= D(o.p).r).sort((a, b) => a.d - b.d) }));
    need.sort((a, b) => (a.near[0]?.d ?? 99) - (b.near[0]?.d ?? 99));
    let covered = 0, got = 0, total = 0;
    for (const { h, near } of need) {
      let want = h.occ; total += want; if (near.length) covered += want;
      for (const { p } of near) { if (want <= 0) break; const take = Math.min(want, Math.max(0, p.capEff - p.load)); if (take > 0) { p.load += take; want -= take; p.served.push(h.id); } }
      h.svc[svc] = h.occ ? (h.occ - want) / h.occ : 0; got += h.occ - want;
    }
    for (const h of houses) if (!h.occ || !h.conn) h.svc[svc] = h.svc[svc] ?? 0;
    svcState[svc] = { n: prov.length, cap: prov.reduce((s, p) => s + p.capEff, 0), load: prov.reduce((s, p) => s + p.load, 0), covered, got, total };
  }
  city.svc = svcState;
  // wellbeing
  const needScale = Math.min(1, S.P / 40);
  let wsum = 0, wn = 0, ssum = 0;
  for (const h of houses) {
    let w = 40 + (h.conn ? 10 : 0) + h.wellB, sc = 0;
    for (const g in SVC_GROUPS) { const ks = SVC_GROUPS[g]; const f = ks.reduce((s, k) => s + (h.svc[k] || 0), 0) / ks.length; h.svc['g_' + g] = f; sc += f / 4; w += 6 * f - (1 - f) * 5 * needScale; }
    w -= (1 - city.ratio.water) * 20 + (1 - city.ratio.power) * 15 + (1 - city.ratio.waste) * 10;
    h.well = clamp(Math.round(w), 0, 100);
    if (h.occ) { wsum += h.well * h.occ; wn += h.occ; ssum += sc * h.occ; }
  }
  city.well = wn ? wsum / wn : (houses.length ? houses.reduce((s, h) => s + h.well, 0) / houses.length : 50);
  city.svcScore = wn ? ssum / wn : 1;
  // commerce: purchasing power (residents, wages and a few visitors) is shared across open shops;
  // when there is far more shop space than spending, the least attractive shops stand vacant
  city.PP = 6 + S.P * .5 + S.E * .9;
  const shops = list.filter(b => kindOf(b) === 'shop' && b.conn).sort((a, b) => (b.type === 'cafe') - (a.type === 'cafe') || b.mult - a.mult || a.id - b.id);
  const capC = s => D(s).cust * (.4 + .6 * staff);
  let open = 0, sum = 0;
  for (const s of shops) { if (open && city.PP / (sum + capC(s)) < .3) break; sum += capC(s); open++; }
  city.shopCap = shops.reduce((a, s) => a + capC(s), 0);
  const u = sum ? Math.min(1, city.PP / sum) : 0;
  shops.forEach((s, i) => { const isOpen = i < open; if (apply) s.open = isOpen; s.cust = isOpen ? capC(s) * u : 0; });
  for (const s of list) if (kindOf(s) === 'shop' && !s.conn) { s.cust = 0; }
  city.vacantShops = list.filter(b => kindOf(b) === 'shop' && (!b.conn || b.open === false)).length;
  // industry
  city.goodsNeed = shops.filter(s => s.open !== false).reduce((s, b) => s + D(b).goods * (b.cust / D(b).cust), 0);
  const inds = list.filter(b => kindOf(b) === 'industry' && b.conn);
  for (const b of inds) b.prod = D(b).out * b.staff * Math.sqrt(city.ratio.power) * (1 + b.mult / 100);
  city.prod = inds.reduce((s, b) => s + b.prod, 0);
  city.sold = Math.min(city.prod, city.goodsNeed); city.exported = city.prod - city.sold;
  city.idleInd = list.filter(b => kindOf(b) === 'industry' && (!b.conn || b.staff < .05)).length;
  const goodsFactor = city.goodsNeed ? .75 + .25 * Math.min(1, city.prod / city.goodsNeed) : 1;
  // money (per minute)
  const wm = .8 + city.well / 250;
  for (const s of shops) s.inc = s.cust * ECON.spend * goodsFactor * wm * (1 + s.mult / 100);
  for (const b of list) if (kindOf(b) === 'shop' && !b.conn) b.inc = 0;
  const share = city.prod ? city.sold / city.prod : 0;
  for (const b of inds) b.inc = b.prod * (share * ECON.localPrice + (1 - share) * ECON.exportPrice);
  for (const b of list) if (kindOf(b) === 'industry' && !b.conn) { b.inc = 0; b.prod = 0; }
  city.income = { shops: shops.reduce((s, b) => s + b.inc, 0), industry: inds.reduce((s, b) => s + b.inc, 0), tax: S.P * ECON.tax };
  city.upkeep = list.reduce((s, b) => s + (D(b).upkeep || 0), 0);
  city.net = city.income.shops + city.income.industry + city.income.tax - city.upkeep;
  // demand: bounded formulas, eased toward their targets
  const jobsFree = city.J - city.W, vac = city.Rcap ? (city.Rcap - S.P) / city.Rcap : 0;
  const noInd = !list.some(b => kindOf(b) === 'industry');
  // each demand is a sum of named, bounded terms; the two largest terms are shown as the reasons
  const rT = [
    [clamp(jobsFree * 2.5, -35, 40), jobsFree > 0 ? (vac < .15 ? 'rs_jobs_free' : 'rs_jobs_pull') : 'rs_no_jobs'],
    [(city.well - 55) * .6, city.well >= 55 ? 'rs_pleasant' : 'rs_unpleasant'],
    [-(1 - utilMin) * 50, 'rs_utils'],
    [S.P > 20 ? -(1 - city.svcScore) * 20 : 0, 'rs_services'],
    [S.P < 12 ? 25 : 0, 'rs_start']];
  const attract = rT.reduce((a, x) => a + x[0], 0); city.attract = attract;
  rT.push([-Math.max(0, vac - .1) * 90, 'rs_vacant'], [city.homeless > 0 ? 15 : 0, 'rs_homeless']);
  const cT = [[clamp((city.PP - city.shopCap) / Math.max(10, city.PP, city.shopCap) * 100, -100, 100), city.PP > city.shopCap ? 'cs_unmet' : city.vacantShops ? 'cs_surplus' : S.P < 10 ? 'cs_few' : 'cs_covered']];
  const iT = [
    [clamp((city.W - city.J) * 2.5, -40, 45), city.W > city.J ? 'is_workers' : 'is_jobs_surplus'],
    [clamp((city.goodsNeed - city.prod) / Math.max(4, city.goodsNeed) * 50, -40, 45), city.goodsNeed > city.prod ? 'is_goods' : 'is_overprod'],
    [noInd && S.P >= 8 ? 15 : 0, 'is_start']];
  const total = T => clamp(T.reduce((a, x) => a + x[0], 0), -100, 100);
  const why = (T, calm) => { const r = T.filter(x => Math.abs(x[0]) >= 3).sort((a, b) => Math.abs(b[0]) - Math.abs(a[0])).slice(0, 2).map(x => x[1]); return r.length ? r : [calm]; };
  city.target = { r: total(rT), c: total(cT), i: total(iT) };
  city.terms = { r: rT, c: cT, i: iT };
  city.reasons = { r: why(rT, 'rs_balanced'), c: why(cT, 'cs_covered'), i: why(iT, 'is_balanced') };
  if (!apply) return;
  for (const k of ['r', 'c', 'i']) S.dem[k] += (city.target[k] - S.dem[k]) * .08;
  // population follows attractiveness, never in jumps
  if (attract > 0 && S.P < city.Rcap) S.P += Math.min(city.Rcap - S.P, .05 + attract / 100 * .35);
  else if (attract < -15 && S.P > 0) S.P -= Math.min(S.P, (-attract - 15) / 100 * .2);
  if (S.P > city.Rcap) S.P -= Math.min(S.P - city.Rcap, .5);
  S.coins = Math.max(0, S.coins + city.net / 60);
}

// ---------------------------------------------------------------- goals
const GOALS = [
  { id: 'g1', reward: 100, unlock: ['workshop', 'lamp'], prog: () => [things().filter(b => kindOf(b) === 'house' && b.conn).length, 3] },
  { id: 'g2', reward: 120, unlock: ['citruscafe', 'florist', 'orchard'], prog: () => [things().some(b => b.type === 'bakery' && b.conn) ? 1 : 0, 1] },
  { id: 'g3', reward: 150, unlock: ['school', 'clinic', 'library', 'jam'], prog: () => [things().some(g => g.type === 'garden' && things().some(h => kindOf(h) === 'house' && rectDist(g, h) <= 2)) ? 1 : 0, 1] },
  { id: 'g4', reward: 200, unlock: ['fire', 'police', 'cannery', 'market'], prog: () => [Math.floor(S.E), 20] },
  { id: 'g5', reward: 250, unlock: ['plaza', 'distribution'], prog: () => [Math.floor(S.P), 60] },
  { id: 'g6', reward: 300, unlock: [], prog: () => [S.P >= 40 && city.utilMin >= .999 ? 1 : 0, 1] },
  { id: 'g7', reward: 400, unlock: [], prog: () => [things().filter(b => kindOf(b) === 'house' && b.occ > 0 && b.well >= 75).length, 6] },
];

// ---------------------------------------------------------------- save format v2 + migration from v1
function serialize(extra) {
  return Object.assign({ v: SAVE_V, coins: S.coins, P: S.P, E: S.E, dem: S.dem, time: S.time, day: S.day, speed: S.speed, done: S.done, newT: S.newT, muted: S.muted, tips: S.tips, tut: S.tut, tab: S.tab, filt: S.filt, nextId: S.nextId,
    b: all().map(b => ({ id: b.id, t: b.type, x: b.x, y: b.y, r: b.r, s: b.seed })) }, extra);
}
function migrate(d) {
  if (!d || typeof d !== 'object') return null;
  if (d.v === 1 && Array.isArray(d.b)) {
    let id = 1;
    return { v: 2, coins: +d.coins || 0, P: +d.pop || 0, E: 0, dem: { r: 20, c: 0, i: 10 }, time: d.time ?? .3, day: d.day || 1, speed: d.speed || 1, done: (d.done || []).filter(g => ['g1', 'g2', 'g3'].includes(g)),
      newT: [], muted: !!d.muted, tips: d.tips !== false, tut: d.tut, tab: 'homes', lang: d.lang, cam: d.cam, migratedFrom: 1,
      b: d.b.map(([t, x, y, r, s]) => ({ id: id++, t: LEGACY_TYPES[t] || t, x, y, r, s })), nextId: d.b.length + 1 };
  }
  if (d.v === 2 && Array.isArray(d.b)) return d;
  return null;
}
