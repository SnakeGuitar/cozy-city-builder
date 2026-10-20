// The module library for custom buildings (blueprints). Pure data: no engine, no DOM.
// Module ids are persisted inside blueprints. Never rename one; add a blueprint schema migration instead.
//
// cat     library category (filters) · tags: search words beyond the name
// size    default { w, h, d } in world units; min / max bound every resizable axis
// attach  where a part of this module may hang: 'ground' (the lot), 'top' (on its parent), 'face' (on a parent's side)
// cost    coins at the default size (scaled with the part's size) · weight: complexity points (limits per blueprint)
// entrance  the module is a way in (a building needs one) · roof: covers its parent · colorable: has a main colour
// variants  how many looks the renderer has for it (part.variant picks one)
export const MODULE_CATS = Object.freeze(['structure', 'roof', 'openings', 'details', 'garden']);

const BASE = {
  body:         { cat: 'structure', tags: ['wall', 'block', 'storey', 'mass'], size: { w: .8, h: .5, d: .8 }, min: { w: .2, h: .15, d: .2 }, max: { w: 2, h: 2.4, d: 2 }, attach: ['ground', 'top'], cost: 18, weight: 6, colorable: true, color: '#efe2c6', variants: 3 },
  plinth:       { cat: 'structure', tags: ['base', 'floor', 'terrace', 'slab'], size: { w: .9, h: .06, d: .9 }, min: { w: .2, h: .02, d: .2 }, max: { w: 2, h: .3, d: 2 }, attach: ['ground'], cost: 4, weight: 2, colorable: true, color: '#ddd0b5', variants: 1 },
  column:       { cat: 'structure', tags: ['pillar', 'post', 'porch'], size: { w: .06, h: .45, d: .06 }, min: { w: .03, h: .1, d: .03 }, max: { w: .2, h: 2, d: .2 }, attach: ['ground', 'top'], cost: 2, weight: 2, colorable: true, color: '#f8f0de', variants: 2 },
  roof_gable:   { cat: 'roof', tags: ['pitched', 'tiles'], size: { w: .9, h: .35, d: .9 }, min: { w: .2, h: .08, d: .2 }, max: { w: 2.2, h: 1.2, d: 2.2 }, attach: ['top'], cost: 12, weight: 4, roof: true, colorable: true, color: '#c86a50', variants: 2 },
  roof_hip:     { cat: 'roof', tags: ['pyramid', 'pitched', 'tiles'], size: { w: .9, h: .3, d: .9 }, min: { w: .2, h: .08, d: .2 }, max: { w: 2.2, h: 1.2, d: 2.2 }, attach: ['top'], cost: 13, weight: 4, roof: true, colorable: true, color: '#7f948f', variants: 1 },
  roof_flat:    { cat: 'roof', tags: ['terrace', 'parapet', 'modern'], size: { w: .84, h: .06, d: .84 }, min: { w: .2, h: .03, d: .2 }, max: { w: 2.2, h: .3, d: 2.2 }, attach: ['top'], cost: 8, weight: 2, roof: true, colorable: true, color: '#b8a88b', variants: 1 },
  roof_shed:    { cat: 'roof', tags: ['lean-to', 'single pitch', 'modern'], size: { w: .9, h: .22, d: .9 }, min: { w: .2, h: .05, d: .2 }, max: { w: 2.2, h: 1, d: 2.2 }, attach: ['top'], cost: 10, weight: 3, roof: true, colorable: true, color: '#3f4d4a', variants: 1 },
  window_sash:  { cat: 'openings', tags: ['window', 'glass', 'shutters'], size: { w: .16, h: .2, d: .03 }, min: { w: .08, h: .08, d: .03 }, max: { w: .6, h: .6, d: .03 }, attach: ['face'], cost: 4, weight: 2, colorable: true, color: '#f8f0de', variants: 3 },
  window_round: { cat: 'openings', tags: ['oculus', 'porthole', 'glass'], size: { w: .14, h: .14, d: .03 }, min: { w: .08, h: .08, d: .03 }, max: { w: .4, h: .4, d: .03 }, attach: ['face'], cost: 4, weight: 2, colorable: true, color: '#f8f0de', variants: 1 },
  door:         { cat: 'openings', tags: ['entrance', 'entry', 'way in'], size: { w: .18, h: .3, d: .03 }, min: { w: .12, h: .2, d: .03 }, max: { w: .5, h: .6, d: .03 }, attach: ['face'], cost: 6, weight: 2, entrance: true, colorable: true, color: '#5e9d94', variants: 3 },
  shopfront:    { cat: 'openings', tags: ['entrance', 'shop', 'display', 'glass'], size: { w: .5, h: .3, d: .04 }, min: { w: .25, h: .2, d: .04 }, max: { w: 1.6, h: .6, d: .04 }, attach: ['face'], cost: 12, weight: 3, entrance: true, colorable: true, color: '#3e7770', variants: 2 },
  gate:         { cat: 'openings', tags: ['entrance', 'industrial', 'garage', 'loading'], size: { w: .4, h: .32, d: .03 }, min: { w: .2, h: .2, d: .03 }, max: { w: 1.4, h: .8, d: .03 }, attach: ['face'], cost: 10, weight: 2, entrance: true, colorable: true, color: '#7f948f', variants: 1 },
  awning:       { cat: 'details', tags: ['shade', 'canopy', 'stripes'], size: { w: .4, h: .1, d: .14 }, min: { w: .15, h: .06, d: .08 }, max: { w: 1.6, h: .2, d: .4 }, attach: ['face'], cost: 3, weight: 2, colorable: true, color: '#d2444b', variants: 2 },
  balcony:      { cat: 'details', tags: ['railing', 'terrace'], size: { w: .35, h: .15, d: .14 }, min: { w: .15, h: .1, d: .08 }, max: { w: 1.6, h: .2, d: .4 }, attach: ['face'], cost: 6, weight: 4, colorable: true, color: '#3f4d4a', variants: 1 },
  sign:         { cat: 'details', tags: ['board', 'shop', 'name'], size: { w: .3, h: .08, d: .02 }, min: { w: .1, h: .04, d: .02 }, max: { w: 1.2, h: .3, d: .02 }, attach: ['face'], cost: 2, weight: 1, colorable: true, color: '#f2d27c', variants: 2 },
  chimney:      { cat: 'details', tags: ['smoke', 'stack'], size: { w: .1, h: .25, d: .1 }, min: { w: .05, h: .1, d: .05 }, max: { w: .5, h: 1.2, d: .5 }, attach: ['top', 'ground'], cost: 3, weight: 1, colorable: true, color: '#c47a5c', variants: 2 },
  planter:      { cat: 'garden', tags: ['flowers', 'pot', 'box'], size: { w: .16, h: .08, d: .16 }, min: { w: .08, h: .05, d: .08 }, max: { w: .8, h: .2, d: .8 }, attach: ['ground', 'top', 'face'], cost: 2, weight: 2, colorable: true, color: '#d2444b', variants: 3 },
  shrub:        { cat: 'garden', tags: ['bush', 'hedge', 'green'], size: { w: .2, h: .16, d: .2 }, min: { w: .08, h: .06, d: .08 }, max: { w: 1.2, h: .5, d: 1.2 }, attach: ['ground', 'top'], cost: 2, weight: 2, colorable: false, color: '#86a86a', variants: 2 },
  tree_small:   { cat: 'garden', tags: ['tree', 'shade', 'green'], size: { w: .3, h: .5, d: .3 }, min: { w: .15, h: .25, d: .15 }, max: { w: .8, h: 1.4, d: .8 }, attach: ['ground'], cost: 6, weight: 3, colorable: false, color: '#86a86a', variants: 3 },
  fence:        { cat: 'garden', tags: ['railing', 'border', 'wall'], size: { w: .6, h: .12, d: .03 }, min: { w: .1, h: .05, d: .02 }, max: { w: 2, h: .4, d: .08 }, attach: ['ground'], cost: 2, weight: 2, colorable: true, color: '#fbf7ee', variants: 2 },
  lamp_post:    { cat: 'garden', tags: ['light', 'lantern', 'street'], size: { w: .06, h: .4, d: .06 }, min: { w: .04, h: .2, d: .04 }, max: { w: .12, h: .8, d: .12 }, attach: ['ground'], cost: 4, weight: 1, colorable: true, color: '#3f4d4a', variants: 1 },
  bench:        { cat: 'garden', tags: ['seat', 'rest'], size: { w: .24, h: .08, d: .08 }, min: { w: .12, h: .06, d: .06 }, max: { w: .6, h: .12, d: .14 }, attach: ['ground'], cost: 2, weight: 1, colorable: true, color: '#a7744d', variants: 1 },
};
export const MODULES = Object.freeze(Object.fromEntries(Object.entries(BASE).map(([id, m]) => [id, Object.freeze({ id, ...m })])));
export const MODULE_IDS = Object.freeze(Object.keys(MODULES));

/** Face anchors of a parent part. 'front' is the parent's local +z side (a building's front, the side autoFace turns to the road), 'right' +x. */
export const FACES = Object.freeze(['front', 'right', 'back', 'left']);
/** Rotation about the vertical axis that turns local +z (a face part's outward normal) to each face. */
export const FACE_ANGLE = Object.freeze({ front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 });
export const ANCHORS = Object.freeze(['ground', 'top', ...FACES]);

/** Limits that keep a custom building cheap to draw and to check. */
export const BLUEPRINT_LIMITS = Object.freeze({ parts: 80, weight: 260, height: 3.2, nameLength: 40, depth: 6 });
/** Base types a blueprint may borrow its rules from: every building kind except roads and the unique café. */
export const BLUEPRINT_KINDS = Object.freeze(['house', 'shop', 'industry', 'service', 'utility', 'nature', 'deco']);
/** Kinds whose buildings need an entrance (people go in). */
export const NEEDS_ENTRANCE = Object.freeze(['house', 'shop', 'industry', 'service']);

/**
 * Searches the library: words in `query` must all appear in a module's id, category or tags (case-insensitive);
 * `cat` narrows to one category. Returns module ids in library order.
 */
export function searchModules(query = '', cat = null, nameOf = id => id) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return MODULE_IDS.filter(id => {
    const m = MODULES[id]; if (cat && m.cat !== cat) return false;
    const hay = [id, m.cat, ...m.tags, nameOf(id)].join(' ').toLowerCase().replace(/_/g, ' ');
    return words.every(w => hay.includes(w));
  });
}
