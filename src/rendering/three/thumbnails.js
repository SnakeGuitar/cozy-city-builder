// Catalogue thumbnails rendered once from the same procedural models.
import * as THREE from 'three';
import { DEFS, isRoadType } from '../../core/config/catalog.js';
import { getProto } from './models/index.js';
import { roadPreview } from './roads.js';

export function renderThumbnails(size = 168) {
  const out = {};
  const R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); R.setSize(size, size); R.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight('#fff4e2', '#c8b392', 1.3)); const dl = new THREE.DirectionalLight('#ffe9c8', 1.6); dl.position.set(3, 6, 4); sc.add(dl);
  const c = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50);
  for (const k of Object.keys(DEFS)) {
    let o;
    o = isRoadType(k) ? roadPreview(k) : getProto(k, 0).clone();
    sc.add(o);
    const box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const d = 10; c.position.set(ctr.x + Math.sin(Math.PI / 4) * Math.cos(.62) * d, ctr.y + Math.sin(.62) * d, ctr.z + Math.cos(Math.PI / 4) * Math.cos(.62) * d); c.lookAt(ctr);
    const e = Math.max(.5, Math.max(sz.x, sz.z) * .78 + sz.y * .5) * .62; c.left = -e; c.right = e; c.top = e; c.bottom = -e; c.updateProjectionMatrix();
    R.render(sc, c); out[k] = R.domElement.toDataURL(); sc.remove(o);
  }
  R.dispose(); R.forceContextLoss && R.forceContextLoss();
  return out;
}
