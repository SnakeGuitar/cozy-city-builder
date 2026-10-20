// Turning a dragged pointer path into a road request: the ends plus a few control points (pure, no DOM).
// Ramer–Douglas–Peucker keeps the points that carry the shape; a nearly straight drag becomes a straight road.
import { pointSegment } from '../../core/domain/geometry.js';

function rdp(pts, tol, out) {
  if (pts.length < 3) return;
  const a = pts[0], b = pts.at(-1); let worst = 0, at = -1;
  for (let i = 1; i < pts.length - 1; i++) { const d = pointSegment(pts[i].x, pts[i].z, a.x, a.z, b.x, b.z).d; if (d > worst) { worst = d; at = i; } }
  if (worst <= tol) return;
  rdp(pts.slice(0, at + 1), tol, out); out.push(pts[at]); rdp(pts.slice(at), tol, out);
}
/**
 * [{x, z}, …] → [start, …controlPoints, end] with at most `maxControl` control points.
 * `tol` is how far (world units) the drag may wander from a straight line and still count as straight.
 */
export function simplifyPath(points, { tol = .35, maxControl = 3 } = {}) {
  const pts = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z) > 1e-6);
  if (pts.length < 2) return pts.map(p => ({ x: p.x, z: p.z }));
  let t = tol, mid = [];
  for (let k = 0; k < 8; k++) { mid = []; rdp(pts, t, mid); if (mid.length <= maxControl) break; t *= 1.6; }
  return [pts[0], ...mid, pts.at(-1)].map(p => ({ x: p.x, z: p.z }));
}
