
// ================================================================ catalogue data (stable type ids; never rename a key, add migrations instead)
const N = 24, HALF = N / 2, DAY_LEN = 300;
const SAVE_KEY = 'villa-limon', SAVE_V = 2, LEGACY_KEY = 'strawberry-borough-v1';

// kind: house · shop · industry · service (local, coverage + capacity) · utility (city-wide capacity) · nature · deco · road
// cost = build cost · upkeep = coins/min · jobs = positions · cap = residents (house) / residents served (service) / units (utility)
// cust = customers a shop can serve · goods = goods a full shop needs per min · out = goods an industry makes per min
const DEFS = {
  road:       { cat: 'paths', s: 1, cost: 5, kind: 'road' },
  jp_trad:    { cat: 'homes', s: 2, cost: 150, kind: 'house', cap: 7, fam: 'jp', era: 'trad' },
  jp_cont:    { cat: 'homes', s: 1, cost: 90, kind: 'house', cap: 4, fam: 'jp', era: 'cont' },
  us_trad:    { cat: 'homes', s: 2, cost: 140, kind: 'house', cap: 6, fam: 'us', era: 'trad' },
  us_cont:    { cat: 'homes', s: 2, cost: 190, kind: 'house', cap: 8, fam: 'us', era: 'cont' },
  mx_trad:    { cat: 'homes', s: 2, cost: 160, kind: 'house', cap: 9, fam: 'mx', era: 'trad' },
  mx_cont:    { cat: 'homes', s: 1, cost: 110, kind: 'house', cap: 5, fam: 'mx', era: 'cont' },
  fr_trad:    { cat: 'homes', s: 1, cost: 110, kind: 'house', cap: 6, fam: 'fr', era: 'trad' },
  fr_cont:    { cat: 'homes', s: 1, cost: 130, kind: 'house', cap: 6, fam: 'fr', era: 'cont' },
  cafe:       { cat: 'shops', s: 2, cost: 0, kind: 'shop', unique: true, jobs: 5, cust: 30, goods: 3, fx: [{ k: 'inc', r: 4, v: 15, max: 1, t: ['bakery', 'jam', 'citruscafe'] }] },
  citruscafe: { cat: 'shops', s: 1, cost: 130, kind: 'shop', jobs: 3, cust: 18, goods: 2 },
  bakery:     { cat: 'shops', s: 1, cost: 130, kind: 'shop', jobs: 3, cust: 20, goods: 2, fx: [{ k: 'inc', r: 4, v: 15, max: 1, t: ['cafe'] }] },
  market:     { cat: 'shops', s: 2, cost: 220, kind: 'shop', jobs: 6, cust: 45, goods: 6 },
  florist:    { cat: 'shops', s: 1, cost: 140, kind: 'shop', jobs: 2, cust: 12, goods: 1, fx: [{ k: 'well', r: 3, v: 8, max: 1 }, { k: 'inc', r: 4, v: 10, max: 1, t: ['cafe'] }] },
  jam:        { cat: 'shops', s: 1, cost: 160, kind: 'shop', jobs: 3, cust: 16, goods: 2 },
  workshop:   { cat: 'industry', s: 1, cost: 140, kind: 'industry', jobs: 6, out: 6 },
  cannery:    { cat: 'industry', s: 2, cost: 260, kind: 'industry', jobs: 10, out: 12 },
  distribution: { cat: 'industry', s: 2, cost: 300, kind: 'industry', jobs: 8, out: 6, fx: [{ k: 'inc', r: 6, v: 10, max: 1 }] },
  school:     { cat: 'services', s: 2, cost: 260, kind: 'service', svc: 'edu', jobs: 6, cap: 60, r: 7, upkeep: 10 },
  clinic:     { cat: 'services', s: 1, cost: 220, kind: 'service', svc: 'health', jobs: 5, cap: 50, r: 7, upkeep: 9 },
  fire:       { cat: 'services', s: 1, cost: 200, kind: 'service', svc: 'fire', jobs: 5, cap: 80, r: 8, upkeep: 7 },
  police:     { cat: 'services', s: 1, cost: 200, kind: 'service', svc: 'police', jobs: 5, cap: 80, r: 8, upkeep: 7 },
  library:    { cat: 'services', s: 1, cost: 160, kind: 'service', svc: 'culture', jobs: 3, cap: 60, r: 6, upkeep: 5 },
  park:       { cat: 'services', s: 2, cost: 120, kind: 'service', svc: 'leisure', jobs: 1, cap: 50, r: 5, upkeep: 2, fx: [{ k: 'well', r: 3, v: 6, max: 1 }] },
  water:      { cat: 'services', s: 2, cost: 240, kind: 'utility', util: 'water', jobs: 3, cap: 120, upkeep: 9 },
  power:      { cat: 'services', s: 2, cost: 260, kind: 'utility', util: 'power', jobs: 3, cap: 140, upkeep: 10 },
  waste:      { cat: 'services', s: 2, cost: 220, kind: 'utility', util: 'waste', jobs: 4, cap: 90, upkeep: 8 },
  orchard:    { cat: 'green', s: 2, cost: 120, kind: 'nature', fx: [{ k: 'inc', r: 3, v: 25, max: 2, t: ['cafe', 'jam', 'citruscafe', 'cannery'] }, { k: 'well', r: 2, v: 4, max: 1 }] },
  garden:     { cat: 'green', s: 2, cost: 90, kind: 'nature', fx: [{ k: 'well', r: 3, v: 14, max: 2 }, { k: 'inc', r: 3, v: 10, max: 2 }] },
  tree:       { cat: 'green', s: 1, cost: 15, kind: 'deco', fx: [{ k: 'well', r: 2, v: 3, max: 4 }] },
  flowerbed:  { cat: 'green', s: 1, cost: 12, kind: 'deco', fx: [{ k: 'well', r: 1, v: 5, max: 3 }] },
  plaza:      { cat: 'decor', s: 2, cost: 200, kind: 'nature', fx: [{ k: 'well', r: 3, v: 12, max: 1 }, { k: 'inc', r: 3, v: 15, max: 1 }] },
  bench:      { cat: 'decor', s: 1, cost: 20, kind: 'deco', fx: [{ k: 'well', r: 2, v: 4, max: 2 }] },
  lamp:       { cat: 'decor', s: 1, cost: 25, kind: 'deco', fx: [{ k: 'well', r: 2, v: 3, max: 2 }, { k: 'inc', r: 2, v: 5, max: 2 }] },
};
const CATS = ['paths', 'homes', 'shops', 'industry', 'services', 'green', 'decor'];
const FAMS = ['jp', 'us', 'mx', 'fr'], ERAS = ['trad', 'cont'];
const SVC_GROUPS = { edu: ['edu'], health: ['health'], safety: ['fire', 'police'], leisure: ['culture', 'leisure'] };
const UTILS = ['water', 'power', 'waste'];
// utility use: per resident for homes, per building for workplaces
const USE = { house: { water: 1, power: 1, waste: .6 }, shop: { water: 2, power: 3, waste: 2 }, industry: { water: 3, power: 6, waste: 4 }, service: { water: 2, power: 2, waste: 1 } };
const BASE_SUPPLY = { water: 30, power: 30, waste: 20 }; // the old village well, line and cart
const ECON = { spend: 2.4, tax: .5, localPrice: 4, exportPrice: 2, workRate: .6 };
const BASE_UNLOCK = ['road', 'jp_trad', 'jp_cont', 'us_trad', 'us_cont', 'mx_trad', 'mx_cont', 'fr_trad', 'fr_cont', 'cafe', 'bakery', 'garden', 'park', 'tree', 'flowerbed', 'bench', 'water', 'power', 'waste'];
// v1 (Strawberry Borough) ids → v2 ids
const LEGACY_TYPES = { houseA: 'fr_trad', houseB: 'fr_trad', houseC: 'fr_cont' };
