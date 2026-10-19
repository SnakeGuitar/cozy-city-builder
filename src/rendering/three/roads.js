// All road tiles as one merged mesh with curbs where a road ends.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C, M, edgeMat } from './art.js';
import { isRoadAt } from '../../core/domain/grid.js';
import { tileCenter } from './coords.js';

export function createRoadView(scene) {
  let group = null;
  return {
    rebuild(state) {
      if (group) { scene.remove(group); group.traverse(o => o.geometry && o.geometry.dispose()); }
      group = new THREE.Group(); const slabs = [], curbs = [];
      const road = (x, y) => isRoadAt(state, x, y);
      for (const b of Object.values(state.buildings)) if (b.type === 'road') {
        const c = tileCenter(b.x, b.y);
        slabs.push(new THREE.BoxGeometry(1, .035, 1).translate(c.x, .0175, c.z));
        if (!road(b.x, b.y + 1)) curbs.push(new THREE.BoxGeometry(1, .05, .07).translate(c.x, .025, c.z + .465));
        if (!road(b.x, b.y - 1)) curbs.push(new THREE.BoxGeometry(1, .05, .07).translate(c.x, .025, c.z - .465));
        if (!road(b.x + 1, b.y)) curbs.push(new THREE.BoxGeometry(.07, .05, 1).translate(c.x + .465, .025, c.z));
        if (!road(b.x - 1, b.y)) curbs.push(new THREE.BoxGeometry(.07, .05, 1).translate(c.x - .465, .025, c.z));
      }
      if (slabs.length) { const m = new THREE.Mesh(mergeGeometries(slabs), M.cobble()); m.receiveShadow = true; group.add(m); }
      if (curbs.length) { const cg = mergeGeometries(curbs); const m = new THREE.Mesh(cg, M.paint(C.stone)); m.receiveShadow = true; m.castShadow = true; group.add(m); group.add(new THREE.LineSegments(new THREE.EdgesGeometry(cg, 40), edgeMat)); }
      scene.add(group);
    },
  };
}
