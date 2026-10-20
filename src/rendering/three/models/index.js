// Model registry: building type id → procedural model. Adding a building type means adding one entry here
// (plus its row in core/config/catalog.js and its strings in ui/dom/i18n.js).
import { Kit, bake } from '../art.js';
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

const protoCache = new Map();
/** A baked, shareable prototype for (type, variant). Clone it per building. */
export function getProto(type, variant = 0) {
  const key = type + ':' + variant;
  if (!protoCache.has(key)) { const k = Kit(hashString(key)); MODELS[type](k, variant); protoCache.set(key, bake(k)); }
  return protoCache.get(key);
}
