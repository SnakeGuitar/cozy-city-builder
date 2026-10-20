// Plane geometry on the ground (x, z), in world units. Pure functions over plain numbers and { x, z } points.
//
// Conventions shared with every renderer:
//   - the map is centred on the origin; one unit is one grid cell;
//   - a rotation `a` (radians) turns a building about the vertical axis like Three.js `rotation.y` (Godot: `rotation.y`):
//     its local +x points to (cos a, −sin a) and its local +z (the front) to (sin a, cos a);
//   - an oriented box (OBB) is { x, z, hw, hd, c, s }: centre, half width along local x, half depth along local z, cos/sin.
export const TAU = Math.PI * 2;
export const QUARTER = Math.PI / 2;
const EPS = 1e-9;

/** Angle in [0, 2π). Values within 1e-9 of a quarter turn snap to it exactly, so grid rotations stay exact numbers. */
export function normAngle(a) {
  let r = a % TAU; if (r < 0) r += TAU;
  const q = Math.round(r / QUARTER);
  if (Math.abs(r - q * QUARTER) < 1e-9) r = (q % 4) * QUARTER;
  return r;
}
/** [cos, sin] with exact values at quarter turns (keeps grid-aligned boxes free of rounding noise). */
export function cosSin(a) {
  const q = a / QUARTER, k = Math.round(q);
  if (Math.abs(q - k) < 1e-9) return [[1, 0], [0, 1], [-1, 0], [0, -1]][((k % 4) + 4) % 4];
  return [Math.cos(a), Math.sin(a)];
}
/** Rotation r of the old grid (0 front +z, 1 +x, 2 −z, 3 −x) as radians. */
export const quarterToAngle = r => [0, QUARTER, Math.PI, 3 * QUARTER][((r % 4) + 4) % 4];
/** The nearest quarter turn (0..3) of an angle. */
export const angleToQuarter = a => ((Math.round(normAngle(a) / QUARTER) % 4) + 4) % 4;
export const isQuarter = a => { const q = a / QUARTER; return Math.abs(q - Math.round(q)) < 1e-9; };

export function makeObb(x, z, w, d, a) { const [c, s] = cosSin(a); return { x, z, hw: w / 2, hd: d / 2, c, s }; }
/** Corners in order around the box. */
export function obbCorners(o) {
  const ux = [o.c * o.hw, -o.s * o.hw], uz = [o.s * o.hd, o.c * o.hd];
  return [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([i, j]) => ({ x: o.x + ux[0] * i + uz[0] * j, z: o.z + ux[1] * i + uz[1] * j }));
}
/** Axis-aligned half extents of an oriented box. */
export const obbExtent = o => ({ ex: Math.abs(o.c) * o.hw + Math.abs(o.s) * o.hd, ez: Math.abs(o.s) * o.hw + Math.abs(o.c) * o.hd });
export function obbAabb(o) { const { ex, ez } = obbExtent(o); return { minX: o.x - ex, maxX: o.x + ex, minZ: o.z - ez, maxZ: o.z + ez }; }

/**
 * Separating-axis test for two oriented boxes. True when their interiors overlap by more than `eps`;
 * boxes that only touch along an edge do not overlap (neighbours may share a wall).
 */
export function obbOverlap(a, b, eps = 1e-6) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const axes = [[a.c, -a.s], [a.s, a.c], [b.c, -b.s], [b.s, b.c]];
  for (const [nx, nz] of axes) {
    const ra = a.hw * Math.abs(a.c * nx - a.s * nz) + a.hd * Math.abs(a.s * nx + a.c * nz);
    const rb = b.hw * Math.abs(b.c * nx - b.s * nz) + b.hd * Math.abs(b.s * nx + b.c * nz);
    if (Math.abs(dx * nx + dz * nz) >= ra + rb - eps) return false;
  }
  return true;
}
/** A point in a box's local frame. */
export function toLocal(o, x, z) { const dx = x - o.x, dz = z - o.z; return { lx: dx * o.c - dz * o.s, lz: dx * o.s + dz * o.c }; }
/** Distance from a point to a box (0 inside). */
export function pointObbDistance(o, x, z) { const { lx, lz } = toLocal(o, x, z); return Math.hypot(Math.max(0, Math.abs(lx) - o.hw), Math.max(0, Math.abs(lz) - o.hd)); }
export const pointInObb = (o, x, z, eps = 0) => { const { lx, lz } = toLocal(o, x, z); return Math.abs(lx) <= o.hw + eps && Math.abs(lz) <= o.hd + eps; };

/** Distance from point p to segment ab, and the parameter t of the closest point. */
export function pointSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, L = vx * vx + vz * vz;
  const t = L > EPS ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L)) : 0;
  return { d: Math.hypot(px - (ax + vx * t), pz - (az + vz * t)), t };
}
function segmentsIntersect(a, b, c, d) {
  const o = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  return ((o1 > 0) !== (o2 > 0)) && ((o3 > 0) !== (o4 > 0)) && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}
/** Distance from segment ab to a box (0 when it touches or crosses it). */
export function segmentObbDistance(o, a, b) {
  if (pointInObb(o, a.x, a.z) || pointInObb(o, b.x, b.z)) return 0;
  const cs = obbCorners(o);
  for (let i = 0; i < 4; i++) if (segmentsIntersect(a, b, cs[i], cs[(i + 1) % 4])) return 0;
  let d = Math.min(pointObbDistance(o, a.x, a.z), pointObbDistance(o, b.x, b.z));
  for (const c of cs) d = Math.min(d, pointSegment(c.x, c.z, a.x, a.z, b.x, b.z).d);
  return d;
}
/**
 * Lot distance between two axis-aligned rectangles, in the units of the old tile metric:
 * 0 when they overlap, 1 when they share an edge, n + 1 when n cells of gap lie between them (Chebyshev).
 * For grid-aligned buildings this equals the original tile distance exactly.
 */
export function lotDistance(A, B) {
  const gx = Math.max(A.minX - B.maxX, B.minX - A.maxX), gz = Math.max(A.minZ - B.maxZ, B.minZ - A.maxZ);
  if (gx < -EPS && gz < -EPS) return 0;
  return Math.max(0, gx, gz) + 1;
}
