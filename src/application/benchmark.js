// A reproducible large town for performance checks, built only through commands (so it is a real, valid town):
// a grid of streets in several styles, lots filled with homes, shops, industry and services at mixed tiers and
// rotations. Used by tools/bench.mjs (simulation timings) and the browser's debug handle (rendering timings).
import { CMD } from '../core/commands/commands.js';
import { DEFS } from '../core/config/catalog.js';

const STYLES = ['road', 'road_asphalt', 'road_cobble', 'road_narrow'];
const MIX = ['fr_trad', 'jp_cont', 'cottage', 'row_house', 'walkup', 'us_trad', 'mx_cont', 'fr_cont', 'bakery', 'corner_store', 'tea_house', 'bookshop', 'workshop', 'studio', 'clinic', 'library', 'tree', 'flowerbed', 'lamp', 'bench'];

/** Fills the map around the café. Returns { buildings, segments, rejected }. Deterministic for a given state. */
export function buildBenchmarkTown(game, { spacing = 5, extent } = {}) {
  const s = game.getSnapshot().state, half = (extent ?? s.map.size / 2 - 1.5);
  const dispatch = c => game.dispatch(c);
  if (!Object.values(s.buildings).some(b => b.type === 'cafe')) dispatch({ type: CMD.Place, buildingType: 'cafe', position: { x: 0, z: 0 }, rotation: 0, autoFace: false });
  let rejected = 0, k = 0;
  // streets: lines every `spacing` units each way (they cross into junctions)
  const lines = []; for (let v = -Math.floor(half / spacing) * spacing + spacing / 2; v <= half; v += spacing) lines.push(v);
  lines.forEach((v, i) => {
    for (const pts of [[{ x: -half, z: v }, { x: half, z: v }], [{ x: v, z: -half }, { x: v, z: half }]]) {
      const r = dispatch({ type: CMD.BuildRoad, points: pts, style: STYLES[i % STYLES.length], shape: 'polyline' }); if (!r.ok) rejected++;
    }
  });
  // buildings along every street, facing it, one per unit where they fit
  for (const v of lines) for (let t = -half + .6; t <= half - .6; t += 1.05) for (const side of [-1, 1]) {
    const type = MIX[k++ % MIX.length], d = DEFS[type].s / 2 + .62, rot = side > 0 ? Math.PI : 0;
    for (const [x, z, r] of [[t, v + side * d, rot], [v + side * d, t, side > 0 ? 3 * Math.PI / 2 : Math.PI / 2]]) {
      const res = dispatch({ type: CMD.Place, buildingType: type, position: { x, z }, rotation: r, autoFace: false });
      if (!res.ok) rejected++; else if (DEFS[type].tiers && k % 3 === 0) dispatch({ type: CMD.Upgrade, id: res.id });
    }
  }
  const st = game.getSnapshot().state;
  return { buildings: Object.keys(st.buildings).length, segments: Object.keys(st.roads.segments).length, rejected };
}
