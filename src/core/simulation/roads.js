// Road network: which road tiles reach the landmark café, and which buildings touch that network.
import { LANDMARK } from '../config/catalog.js';
import { GRID_SIZE } from '../config/world.js';
import { adjacentTiles, isRoadAt, tileIndex } from '../domain/grid.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** @returns {{reach:number[], mainRoads:number[][], connected:Record<number,boolean>}} reach[tile] = 1 for road tiles linked to the café */
export function computeRoadNetwork(state, things) {
  const reach = new Array(GRID_SIZE * GRID_SIZE).fill(0), mainRoads = [];
  const cafe = things.find(b => b.type === LANDMARK);
  if (cafe) {
    const queue = [];
    for (const [x, y] of adjacentTiles(cafe)) if (isRoadAt(state, x, y) && !reach[tileIndex(x, y)]) { reach[tileIndex(x, y)] = 1; queue.push([x, y]); }
    while (queue.length) {
      const [x, y] = queue.pop(); mainRoads.push([x, y]);
      for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (isRoadAt(state, nx, ny) && !reach[tileIndex(nx, ny)]) { reach[tileIndex(nx, ny)] = 1; queue.push([nx, ny]); } }
    }
  }
  const connected = {};
  for (const b of things) connected[b.id] = b.type === LANDMARK ? mainRoads.length > 0 : adjacentTiles(b).some(([x, y]) => reach[tileIndex(x, y)]);
  return { reach, mainRoads, connected };
}
