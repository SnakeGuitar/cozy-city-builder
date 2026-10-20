// A reproducible large town for performance checks, built only through commands (so it is a real, valid town):
// a grid of streets in several styles, lots filled with homes, shops, industry and services at mixed tiers and
// rotations. Used by tools/bench.mjs (simulation timings) and the browser's debug handle (rendering timings).
import { CMD } from '../core/commands/commands.js';
import { DEFS } from '../core/config/catalog.js';
import { createBlueprint, createPart } from '../core/domain/blueprint.js';

const STYLES = ['road', 'road_asphalt', 'road_cobble', 'road_narrow'];
const MIX = ['fr_trad', 'jp_cont', 'cottage', 'row_house', 'walkup', 'us_trad', 'mx_cont', 'fr_cont', 'bakery', 'corner_store', 'tea_house', 'bookshop', 'workshop', 'studio', 'clinic', 'library', 'tree', 'flowerbed', 'lamp', 'bench'];

/** Three custom designs (a tall cottage, a bakery with a balcony, a workshop with a chimney) saved in the game; returns their ids. */
function saveDesigns(game) {
  const ids = [];
  for (const [baseType, extra] of [['cottage', 'chimney'], ['bakery', 'balcony'], ['workshop', 'chimney']]) {
    const bp = createBlueprint({ name: 'Bench ' + baseType, baseType }), body = bp.parts[0];
    body.size.h += .15; bp.parts.push(createPart(bp.nextPartId++, extra, { parent: body.id, anchor: extra === 'balcony' ? 'back' : 'top', offset: extra === 'balcony' ? { y: .3 } : { x: .2 } }));
    const r = game.dispatch({ type: CMD.SaveBlueprint, blueprint: bp }); if (r.ok) ids.push(r.id);
  }
  return ids;
}
/** A small villa (two cottages, a tree, a bench, a hedge) saved in the game; returns its id or null. */
function saveVilla(game) {
  const items = [['cottage', -.75, -.5], ['cottage', .75, -.5], ['tree', -.75, .75], ['bench', .75, .75]].map(([type, x, z], i) => ({ id: i + 1, kind: 'building', type, position: { x, z }, rotation: 0, seed: i }));
  const r = game.dispatch({ type: CMD.SaveVilla, villa: { schema: 1, name: 'Bench villa', size: { w: 3, d: 3 }, seed: 1, variants: true, fence: { style: 'hedge', gate: 'front' }, items } });
  return r.ok ? r.id : null;
}

/**
 * Fills the map around the café. Returns { buildings, segments, rejected, custom, villas }. Deterministic for a given state.
 * `designs`: every third tiered building is a custom design, and villas fill the space between streets.
 */
export function buildBenchmarkTown(game, { spacing = 5, extent, designs = false } = {}) {
  const s = game.getSnapshot().state, half = (extent ?? s.map.size / 2 - 1.5);
  const dispatch = c => game.dispatch(c);
  if (!Object.values(s.buildings).some(b => b.type === 'cafe')) dispatch({ type: CMD.Place, buildingType: 'cafe', position: { x: 0, z: 0 }, rotation: 0, autoFace: false });
  let rejected = 0, k = 0, villas = 0; const bps = designs ? saveDesigns(game) : [], villa = designs ? saveVilla(game) : null;
  // streets: lines every `spacing` units each way (they cross into junctions)
  const lines = []; for (let v = -Math.floor(half / spacing) * spacing + spacing / 2; v <= half; v += spacing) lines.push(v);
  lines.forEach((v, i) => {
    for (const pts of [[{ x: -half, z: v }, { x: half, z: v }], [{ x: v, z: -half }, { x: v, z: half }]]) {
      const r = dispatch({ type: CMD.BuildRoad, points: pts, style: STYLES[i % STYLES.length], shape: 'polyline' }); if (!r.ok) rejected++;
    }
  });
  // villas in the middle of every other block, before the houses along the streets fill in around them
  if (villa) lines.forEach((a, i) => lines.forEach((b, j) => { if ((i + j) % 2) return; const r = dispatch({ type: CMD.PlaceVilla, villa: { id: villa }, position: { x: a + spacing / 2, z: b + spacing / 2 }, rotation: ((villas % 4) * Math.PI) / 2 }); if (r.ok) villas++; }));
  // buildings along every street, facing it, one per unit where they fit
  for (const v of lines) for (let t = -half + .6; t <= half - .6; t += 1.05) for (const side of [-1, 1]) {
    const type = MIX[k++ % MIX.length], d = DEFS[type].s / 2 + .62, rot = side > 0 ? Math.PI : 0, bp = designs && k % 3 === 0 && bps.find(id => game.getSnapshot().state.blueprints[id].versions[1].baseType === type);
    for (const [x, z, r] of [[t, v + side * d, rot], [v + side * d, t, side > 0 ? 3 * Math.PI / 2 : Math.PI / 2]]) {
      const res = dispatch({ type: CMD.Place, buildingType: type, ...(bp ? { blueprint: { id: bp } } : {}), position: { x, z }, rotation: r, autoFace: false });
      if (!res.ok) rejected++; else if (DEFS[type].tiers && k % 3 === 0) dispatch({ type: CMD.Upgrade, id: res.id });
    }
  }
  const st = game.getSnapshot().state;
  return { buildings: Object.keys(st.buildings).length, segments: Object.keys(st.roads.segments).length, rejected, custom: Object.values(st.buildings).filter(b => b.blueprint).length, villas };
}
