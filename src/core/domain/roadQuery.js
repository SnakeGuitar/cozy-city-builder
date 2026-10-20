// "Where is the nearest road edge?" — one query per road representation, so placement snapping does not depend on
// how roads are stored. Each query returns { x, z, nx, nz, half, d } or null:
//   (x, z)   the closest point on the road's centre line (or on its edge when half = 0),
//   (nx, nz) the unit ground normal from the road toward the asking point,
//   half     the distance from (x, z) to the road edge along that normal, d the distance from the point to the road edge.
import { isRoadType } from '../config/catalog.js';
import { queryArea } from './space.js';

/** Roads of the grid street tool: 1 × 1 cells; the normal is the cell side facing the point. */
export function tileRoadQuery(state, x, z, maxDist) {
  let best = null;
  for (const id of queryArea(state, { minX: x - maxDist - .5, maxX: x + maxDist + .5, minZ: z - maxDist - .5, maxZ: z + maxDist + .5 })) {
    const b = state.buildings[id]; if (!b || !isRoadType(b.type)) continue;
    const dx = x - b.position.x, dz = z - b.position.z, alongX = Math.abs(dx) >= Math.abs(dz);
    const nx = alongX ? Math.sign(dx || 1) : 0, nz = alongX ? 0 : Math.sign(dz || 1);
    const ex = alongX ? b.position.x + nx * .5 : b.position.x + Math.max(-.5, Math.min(.5, dx));
    const ez = alongX ? b.position.z + Math.max(-.5, Math.min(.5, dz)) : b.position.z + nz * .5;
    const d = Math.hypot(x - ex, z - ez);
    if (d <= maxDist && (!best || d < best.d)) best = { x: ex, z: ez, nx, nz, half: 0, d };
  }
  return best;
}
/** Registered queries; the road graph adds its own. */
export const roadQueries = [tileRoadQuery];
