// Road network: which road pieces reach the landmark café, and which buildings come close enough to that network.
// A building is connected when its footprint lies within ROAD_ACCESS of a road reached from the café.
import { LANDMARK, isRoadType } from '../config/catalog.js';
import { ROAD_ACCESS } from '../config/world.js';
import { footprintObb, mapSize, mapHalf, queryArea } from '../domain/space.js';
import { obbAabb, pointObbDistance } from '../domain/geometry.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const HALF_TILE = .5;

/** Road tiles of the grid street tool: their cell (ix, iy) from their centre. */
function roadCells(state) {
  const h = mapHalf(state), cells = new Map();
  for (const b of Object.values(state.buildings)) if (isRoadType(b.type)) cells.set(Math.round(b.position.x + h - .5) + ',' + Math.round(b.position.z + h - .5), b);
  return cells;
}
/** Road pieces within reach of a building's footprint. */
function roadsNear(state, b, test) {
  const o = footprintObb(b.type, b.position, b.rotation), a = obbAabb(o), m = HALF_TILE + ROAD_ACCESS, out = [];
  for (const id of queryArea(state, { minX: a.minX - m, maxX: a.maxX + m, minZ: a.minZ - m, maxZ: a.maxZ + m })) {
    const r = state.buildings[id]; if (!r || !isRoadType(r.type) || !test(r)) continue;
    if (pointObbDistance(o, r.position.x, r.position.z) <= m + 1e-9) out.push(r);
  }
  return out;
}

/** @returns {{reach:number[], mainRoads:number[][], connected:Record<number,boolean>}} reach[cell] = 1 for road cells linked to the café */
export function computeRoadNetwork(state, things) {
  const N = mapSize(state), h = mapHalf(state), reach = new Array(N * N).fill(0), mainRoads = [], reached = new Set();
  const cells = roadCells(state), cellOf = r => [Math.round(r.position.x + h - .5), Math.round(r.position.z + h - .5)];
  const cafe = things.find(b => b.type === LANDMARK);
  if (cafe) {
    const queue = [];
    const visit = r => { if (reached.has(r.id)) return; reached.add(r.id); const [x, y] = cellOf(r); if (x >= 0 && y >= 0 && x < N && y < N) reach[y * N + x] = 1; queue.push(r); };
    for (const r of roadsNear(state, cafe, () => true)) visit(r);
    while (queue.length) {
      const r = queue.pop(), [x, y] = cellOf(r); mainRoads.push([x, y]);
      for (const [dx, dy] of DIRS) { const n = cells.get((x + dx) + ',' + (y + dy)); if (n) visit(n); }
    }
  }
  const connected = {};
  for (const b of things) connected[b.id] = b.type === LANDMARK ? mainRoads.length > 0 : roadsNear(state, b, r => reached.has(r.id)).length > 0;
  return { reach, mainRoads, connected };
}
