// "Where is the nearest road edge?" — the query placement snapping uses, independent of how roads are stored.
// Returns { x, z, nx, nz, half, d } or null:
//   (x, z)   the closest point on the road's centre line (or the centre of a node pad),
//   (nx, nz) the unit ground normal from the road toward the asking point,
//   half     the distance from (x, z) to the road edge along that normal, d the distance from the point to the road edge.
import { nearestRoadPoint } from './roads.js';

export function graphRoadQuery(state, x, z, maxDist) { const r = nearestRoadPoint(state, x, z, maxDist); return r && r.d >= -1e-9 ? r : null; }
/** Registered queries (one per road representation). */
export const roadQueries = [graphRoadQuery];
