// Model registry: building type id → procedural model. Adding a building type means adding one entry here
// (plus its row in core/config/catalog.js and its strings in ui/dom/i18n.js).
import * as THREE from 'three';
import { C, M, Kit, bake } from '../art.js';
import { DEFS } from '../../../core/config/catalog.js';
import { hashString } from '../../../core/util/random.js';
import { TOWN_MODELS } from './town.js';
import { HOUSE_MODELS } from './houses.js';
import { CITY_MODELS } from './city.js';
import { URBAN_MODELS } from './urban.js';
import { TRADE_MODELS } from './trade.js';

export const MODELS = { ...TOWN_MODELS, ...HOUSE_MODELS, ...CITY_MODELS, ...URBAN_MODELS, ...TRADE_MODELS };
/** How many visual variants a type has; a building's persisted seed picks one. Purely visual. */
export const VARIANTS = { fr_trad: 3, fr_cont: 2, jp_trad: 2, jp_cont: 2, us_trad: 3, us_cont: 2, mx_trad: 3, mx_cont: 2, tree: 3, flowerbed: 3, bench: 2,
  cottage: 5, row_house: 6, walkup: 3, apartments: 3, courtyard: 3, corner_store: 3, tea_house: 3, bookshop: 3, craft_shop: 3, restaurant: 3, covered_market: 3,
  textile: 3, sawmill: 3, pottery: 3, warehouse: 3, food_plant: 3, studio: 3 };
export const variantOf = (type, seed) => VARIANTS[type] ? seed % VARIANTS[type] : 0;

/** Models that draw their own tiers (they take (k, variant, tier)); the others get dressTier below. */
export const TIERED_MODELS = new Set([...Object.keys(URBAN_MODELS), ...Object.keys(TRADE_MODELS)]);

/**
 * Tier progression for models drawn as a single tier: tier 2 improves the lot (lanterns, flower borders),
 * tier 3 also raises the building by about a storey and crowns it with a golden finial.
 */
function dressTier(k, type, tier) {
  if (tier < 2) return;
  const half = DEFS[type].s / 2 - .06, body = new THREE.Group();
  for (const c of [...k.root.children]) body.add(c);
  k.root.add(body);
  if (tier >= 3) body.scale.y = 1.2;
  body.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(body), top = box.max.y;
  for (const sx of [-1, 1]) { k.lampPost(null, sx * (half - .03), .02, half - .03, .32); k.bloom(null, sx * (half - .2), .05, half - .02, .2, 5, [C.red, C.white, C.butter, C.pink]); }
  if (tier >= 3) {
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
    k.cyl(null, .008, .01, .16, M.paint(C.iron), cx, top - .02, cz, 6);
    k.sph(null, .028, M.paint(C.lemonD), cx, top + .16, cz, 1, 1, 1, 10);
    k.m(null, new THREE.BoxGeometry(.006, .06, .09), M.paint(C.lemon), cx, top + .1, cz + .045);
    for (const sx of [-1, 1]) k.pot(null, sx * (half - .02), .02, -half + .06, 1.1, C.terra, [C.lemon, C.white]);
  }
}

const protoCache = new Map();
/** A baked, shareable prototype for (type, variant, tier). Clone it per building. */
export function getProto(type, variant = 0, tier = 1) {
  const key = type + ':' + variant + (tier > 1 ? ':t' + tier : '');
  if (!protoCache.has(key)) {
    const k = Kit(hashString(type + ':' + variant));
    if (TIERED_MODELS.has(type)) MODELS[type](k, variant, tier); else { MODELS[type](k, variant); dressTier(k, type, tier); }
    protoCache.set(key, bake(k));
  }
  return protoCache.get(key);
}
