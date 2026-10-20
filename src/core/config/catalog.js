// Building catalogue and economic constants. Pure data: no engine, no DOM.
// Type ids (the keys of DEFS) are persisted in saves. Never rename one; add a migration instead.
//
// kind: house · shop · industry · service (local: coverage radius + capacity) · utility (town-wide capacity) · nature · deco · road
// road entries are street styles: `road.width` (world units), `road.look` (renderer hint); `cost` is per tile / per unit of length
// s = footprint side in tiles · cost = build cost · upkeep = coins/min · jobs = positions
// cap = residents (house) / residents served (service) / units (utility)
// cust = customers a shop can serve · goods = goods a full shop needs per min · out = goods an industry makes per min
// fx = neighbourhood effects: k 'well' (wellbeing for homes) or 'inc' (% income), r = radius in tiles,
//      v = value, max = how many buildings of the same type can stack on one target, t = target types
export const DEFS = Object.freeze({
  road:       { cat: 'paths', s: 1, cost: 5, kind: 'road', road: { width: 1, look: 'classic' } },
  road_dirt:     { cat: 'paths', s: 1, cost: 2, kind: 'road', road: { width: .8, look: 'dirt' } },
  road_cobble:   { cat: 'paths', s: 1, cost: 4, kind: 'road', road: { width: .85, look: 'cobble' } },
  road_narrow:   { cat: 'paths', s: 1, cost: 6, kind: 'road', road: { width: .75, look: 'narrow' } },
  road_japanese: { cat: 'paths', s: 1, cost: 7, kind: 'road', road: { width: .9, look: 'japanese' } },
  road_asphalt:  { cat: 'paths', s: 1, cost: 8, kind: 'road', road: { width: 1.1, look: 'asphalt' } },
  road_avenue:   { cat: 'paths', s: 1, cost: 12, kind: 'road', road: { width: 1.5, look: 'avenue' } },
  road_alley:    { cat: 'paths', s: 1, cost: 3, kind: 'road', road: { width: .6, look: 'alley' } },
  jp_trad:    { cat: 'homes', s: 2, cost: 150, kind: 'house', cap: 7, fam: 'jp', era: 'trad' },
  jp_cont:    { cat: 'homes', s: 1, cost: 90, kind: 'house', cap: 4, fam: 'jp', era: 'cont' },
  us_trad:    { cat: 'homes', s: 2, cost: 140, kind: 'house', cap: 6, fam: 'us', era: 'trad' },
  us_cont:    { cat: 'homes', s: 2, cost: 190, kind: 'house', cap: 8, fam: 'us', era: 'cont' },
  mx_trad:    { cat: 'homes', s: 2, cost: 160, kind: 'house', cap: 9, fam: 'mx', era: 'trad' },
  mx_cont:    { cat: 'homes', s: 1, cost: 110, kind: 'house', cap: 5, fam: 'mx', era: 'cont' },
  fr_trad:    { cat: 'homes', s: 1, cost: 110, kind: 'house', cap: 6, fam: 'fr', era: 'trad' },
  fr_cont:    { cat: 'homes', s: 1, cost: 130, kind: 'house', cap: 6, fam: 'fr', era: 'cont' },
  // urban typologies: building forms rather than national styles; the seed picks palette and details
  cottage:    { cat: 'homes', s: 1, cost: 75, kind: 'house', cap: 3, fam: 'urb', era: 'trad' },
  row_house:  { cat: 'homes', s: 1, cost: 120, kind: 'house', cap: 5, fam: 'urb', era: 'trad' },
  walkup:     { cat: 'homes', s: 1, cost: 170, kind: 'house', cap: 8, fam: 'urb', era: 'cont' },
  apartments: { cat: 'homes', s: 2, cost: 340, kind: 'house', cap: 18, fam: 'urb', era: 'cont' },
  courtyard:  { cat: 'homes', s: 2, cost: 280, kind: 'house', cap: 13, fam: 'urb', era: 'trad', fx: [{ k: 'well', r: 1, v: 4, max: 1 }] },
  cafe:       { cat: 'shops', s: 2, cost: 0, kind: 'shop', unique: true, jobs: 5, cust: 30, goods: 3, fx: [{ k: 'inc', r: 4, v: 15, max: 1, t: ['bakery', 'jam', 'citruscafe'] }] },
  citruscafe: { cat: 'shops', s: 1, cost: 130, kind: 'shop', jobs: 3, cust: 18, goods: 2 },
  bakery:     { cat: 'shops', s: 1, cost: 130, kind: 'shop', jobs: 3, cust: 20, goods: 2, fx: [{ k: 'inc', r: 4, v: 15, max: 1, t: ['cafe'] }] },
  market:     { cat: 'shops', s: 2, cost: 220, kind: 'shop', jobs: 6, cust: 45, goods: 6 },
  florist:    { cat: 'shops', s: 1, cost: 140, kind: 'shop', jobs: 2, cust: 12, goods: 1, fx: [{ k: 'well', r: 3, v: 8, max: 1 }, { k: 'inc', r: 4, v: 10, max: 1, t: ['cafe'] }] },
  jam:        { cat: 'shops', s: 1, cost: 160, kind: 'shop', jobs: 3, cust: 16, goods: 2 },
  corner_store: { cat: 'shops', s: 1, cost: 100, kind: 'shop', jobs: 2, cust: 16, goods: 2 },
  tea_house:  { cat: 'shops', s: 1, cost: 120, kind: 'shop', jobs: 2, cust: 14, goods: 1, fx: [{ k: 'well', r: 2, v: 4, max: 1 }] },
  bookshop:   { cat: 'shops', s: 1, cost: 150, kind: 'shop', jobs: 3, cust: 14, goods: 1, fx: [{ k: 'inc', r: 3, v: 10, max: 1, t: ['tea_house', 'citruscafe', 'cafe'] }] },
  craft_shop: { cat: 'shops', s: 1, cost: 170, kind: 'shop', jobs: 4, cust: 15, goods: 1, fx: [{ k: 'well', r: 2, v: 3, max: 1 }] },
  restaurant: { cat: 'shops', s: 2, cost: 240, kind: 'shop', jobs: 7, cust: 40, goods: 5, fx: [{ k: 'inc', r: 3, v: 8, max: 1, t: ['bakery', 'market', 'covered_market'] }] },
  covered_market: { cat: 'shops', s: 2, cost: 320, kind: 'shop', jobs: 9, cust: 60, goods: 8, fx: [{ k: 'inc', r: 3, v: 10, max: 1 }] },
  workshop:   { cat: 'industry', s: 1, cost: 140, kind: 'industry', jobs: 6, out: 6 },
  cannery:    { cat: 'industry', s: 2, cost: 260, kind: 'industry', jobs: 10, out: 12 },
  distribution: { cat: 'industry', s: 2, cost: 300, kind: 'industry', jobs: 8, out: 6, fx: [{ k: 'inc', r: 6, v: 10, max: 1 }] },
  textile:    { cat: 'industry', s: 2, cost: 240, kind: 'industry', jobs: 9, out: 9 },
  sawmill:    { cat: 'industry', s: 2, cost: 220, kind: 'industry', jobs: 7, out: 8, fx: [{ k: 'well', r: 2, v: -4, max: 1 }] },
  pottery:    { cat: 'industry', s: 2, cost: 230, kind: 'industry', jobs: 8, out: 7, fx: [{ k: 'well', r: 2, v: -3, max: 1 }] },
  warehouse:  { cat: 'industry', s: 2, cost: 280, kind: 'industry', jobs: 6, out: 5, fx: [{ k: 'inc', r: 5, v: 10, max: 1, t: ['workshop', 'cannery', 'textile', 'sawmill', 'pottery', 'food_plant'] }] },
  food_plant: { cat: 'industry', s: 2, cost: 300, kind: 'industry', jobs: 12, out: 13, fx: [{ k: 'well', r: 2, v: -2, max: 1 }] },
  studio:     { cat: 'industry', s: 1, cost: 260, kind: 'industry', jobs: 6, out: 5, fx: [{ k: 'inc', r: 3, v: 5, max: 1, t: ['bookshop', 'tea_house', 'cafe', 'craft_shop'] }] },
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
});

export const KINDS = Object.freeze(['road', 'house', 'shop', 'industry', 'service', 'utility', 'nature', 'deco']);
export const CATS = Object.freeze(['paths', 'homes', 'shops', 'industry', 'services', 'green', 'decor']);
export const FAMS = Object.freeze(['jp', 'us', 'mx', 'fr', 'urb']);
export const ERAS = Object.freeze(['trad', 'cont']);
export const SERVICE_TYPES = Object.freeze(['edu', 'health', 'fire', 'police', 'culture', 'leisure']);
export const SVC_GROUPS = Object.freeze({ edu: ['edu'], health: ['health'], safety: ['fire', 'police'], leisure: ['culture', 'leisure'] });
export const UTILS = Object.freeze(['water', 'power', 'waste']);
// utility use: per resident for homes, per building for workplaces
export const USE = Object.freeze({ house: { water: 1, power: 1, waste: .6 }, shop: { water: 2, power: 3, waste: 2 }, industry: { water: 3, power: 6, waste: 4 }, service: { water: 2, power: 2, waste: 1 } });
export const BASE_SUPPLY = Object.freeze({ water: 30, power: 30, waste: 20 }); // the old village well, line and cart
export const ECON = Object.freeze({ spend: 2.4, tax: .5, localPrice: 4, exportPrice: 2, workRate: .6, refundRate: .5 });
export const BASE_UNLOCK = Object.freeze(['road', 'road_dirt', 'road_cobble', 'cottage', 'corner_store', 'jp_trad', 'jp_cont', 'us_trad', 'us_cont', 'mx_trad', 'mx_cont', 'fr_trad', 'fr_cont', 'cafe', 'bakery', 'garden', 'park', 'tree', 'flowerbed', 'bench', 'water', 'power', 'waste']);
export const LANDMARK = 'cafe'; // the network root; unique and cannot be demolished
/** Street styles (catalogue entries of kind 'road'). */
export const isRoadType = type => DEFS[type]?.kind === 'road';
export const ROAD_TYPES = Object.freeze(Object.keys(DEFS).filter(isRoadType));
