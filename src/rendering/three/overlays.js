// Build-mode helpers drawn in the world: grid, occupied tiles, footprint, effect range, ghost preview, relation lines.
import * as THREE from 'three';
import { GRID_SIZE } from '../../core/config/world.js';
import { DEFS, isRoadType } from '../../core/config/catalog.js';
import { M, T } from './art.js';
import { getProto } from './models/index.js';
import { roadPreview } from './roads.js';
import { HALF, tileCenter } from './coords.js';

const N = GRID_SIZE;
export const RELATION_COLOURS = { inc: '#b98a12', well: '#4f8a1e', svc: '#3f7a8c' };

export function createOverlays(scene) {
  const gridLines = (() => { const pts = []; for (let i = 0; i <= N; i++) pts.push(i - HALF, .04, -HALF, i - HALF, .04, HALF, -HALF, .04, i - HALF, HALF, .04, i - HALF);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#6a4631', transparent: true, opacity: .16 })); l.visible = false; scene.add(l); return l; })();
  const occ = new THREE.InstancedMesh(new THREE.PlaneGeometry(.92, .92).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#c9584f', transparent: true, opacity: .16, depthWrite: false }), N * N);
  occ.visible = false; occ.renderOrder = 2; scene.add(occ);
  const markMat = new THREE.MeshBasicMaterial({ map: T.frame(), color: '#6fa35a', transparent: true, depthWrite: false, opacity: .95 });
  const foot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), markMat); foot.visible = false; foot.renderOrder = 3; scene.add(foot);
  const range = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.frame(), color: '#e8c33a', transparent: true, depthWrite: false, opacity: .7 })); range.visible = false; range.renderOrder = 2; scene.add(range);
  const ghostMats = new Map(), ghostEdge = new THREE.LineBasicMaterial({ color: '#6a4631', transparent: true, opacity: .3 });
  let ghost = null, ghostKey = '';
  const relations = new THREE.Group(); scene.add(relations);

  function ghostOf(type, variant) {
    const o = isRoadType(type) ? roadPreview(type, 1) : getProto(type, variant).clone();
    o.traverse(c => { if (c.isMesh) { if (!ghostMats.has(c.material)) { const g = c.material.clone(); g.transparent = true; g.opacity = .62; ghostMats.set(c.material, g); } c.material = ghostMats.get(c.material); c.castShadow = false; } if (c.isLineSegments) c.material = ghostEdge; });
    return o;
  }
  return {
    setBuildMode(on) { gridLines.visible = occ.visible = on; },
    refreshOccupancy(grid) { const m = new THREE.Matrix4(); let n = 0; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (grid[y * N + x]) { m.makeTranslation(x - HALF + .5, .05, y - HALF + .5); occ.setMatrixAt(n++, m); } occ.count = n; occ.instanceMatrix.needsUpdate = true; },
    footprint(x, y, s, ok) { const c = tileCenter(x, y, s); foot.visible = true; foot.position.set(c.x, .05, c.z); foot.scale.set(s, 1, s); markMat.color.set(ok ? '#5f9a2c' : '#c8553f'); },
    hideFootprint() { foot.visible = false; },
    /** Largest effect or service radius of a type around (x, y). */
    range(type, x, y) {
      const d = DEFS[type], r = d.r || (d.fx ? Math.max(...d.fx.map(f => f.r)) : 0);
      if (!r) { range.visible = false; return; }
      const c = tileCenter(x, y, d.s); range.position.set(c.x, .045, c.z); range.scale.set(d.s + 2 * r, 1, d.s + 2 * r); range.visible = true;
    },
    hideRange() { range.visible = false; },
    ghost(type, variant, x, y, r, ok, time) {
      const key = type + ':' + variant;
      if (ghostKey !== key) { if (ghost) scene.remove(ghost); ghost = ghostOf(type, variant); ghostKey = key; scene.add(ghost); }
      const c = tileCenter(x, y, DEFS[type].s); ghost.visible = true;
      ghost.position.set(c.x, ok ? .06 + Math.sin(time * 3.3) * .015 : .02, c.z); ghost.rotation.y = r * Math.PI / 2;
    },
    hideGhost() { if (ghost) ghost.visible = false; },
    clearGhost() { if (ghost) scene.remove(ghost); ghost = null; ghostKey = ''; },
    /** links: [{ from: Vector3, to: Vector3, kind: 'inc'|'well'|'svc' }] */
    relations(links) {
      relations.clear();
      for (const { from, to, kind } of links) {
        const mid = from.clone().lerp(to, .5); mid.y += .6 + from.distanceTo(to) * .12;
        const geo = new THREE.BufferGeometry().setFromPoints(new THREE.QuadraticBezierCurve3(from, mid, to).getPoints(30));
        const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: RELATION_COLOURS[kind], dashSize: .12, gapSize: .08, transparent: true, opacity: .9, depthTest: false }));
        line.computeLineDistances(); line.renderOrder = 10; relations.add(line);
      }
    },
  };
}
