// Catalogue thumbnails rendered from the same procedural models: the catalogue once at start, custom designs
// (blueprint versions) on demand with a cache, through a small renderer that is released when idle.
import * as THREE from 'three';
import { DEFS, isRoadType } from '../../core/config/catalog.js';
import { getProto } from './models/index.js';
import { roadPreview } from './roads.js';
import { blueprintProto } from './blueprintModel.js';
import { villaPreview, disposePreview } from './villaView.js';

function studio(size) {
  const R = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); R.setSize(size, size); R.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight('#fff4e2', '#c8b392', 1.3)); const dl = new THREE.DirectionalLight('#ffe9c8', 1.6); dl.position.set(3, 6, 4); sc.add(dl);
  const c = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50);
  return {
    /** A three-quarter picture of `o`, framed to its bounds, as a data URL. */
    shoot(o) {
      sc.add(o);
      const box = new THREE.Box3().setFromObject(o), sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
      const d = 10; c.position.set(ctr.x + Math.sin(Math.PI / 4) * Math.cos(.62) * d, ctr.y + Math.sin(.62) * d, ctr.z + Math.cos(Math.PI / 4) * Math.cos(.62) * d); c.lookAt(ctr);
      const e = Math.max(.5, Math.max(sz.x, sz.z) * .78 + sz.y * .5) * .62; c.left = -e; c.right = e; c.top = e; c.bottom = -e; c.updateProjectionMatrix();
      R.render(sc, c); const url = R.domElement.toDataURL(); sc.remove(o); return url;
    },
    dispose() { R.dispose(); R.forceContextLoss && R.forceContextLoss(); },
  };
}

export function renderThumbnails(size = 168) {
  const out = {}, s = studio(size);
  for (const k of Object.keys(DEFS)) out[k] = s.shoot(isRoadType(k) ? roadPreview(k) : getProto(k, 0).clone());
  s.dispose();
  return out;
}

/**
 * thumbOf(blueprint) → data URL of a saved design; thumbOf.villa(state, villa) → of a saved villa. Cached per
 * id@version; the small renderer goes away after 3 s idle.
 */
export function createBlueprintThumbnails(size = 168) {
  const cache = new Map(); let s = null, idle = null;
  const shoot = (key, make) => {
    if (key && cache.has(key)) return cache.get(key);
    s = s || studio(size); clearTimeout(idle); idle = setTimeout(() => { s.dispose(); s = null; }, 3000);
    const o = make(), url = s.shoot(o); if (key) cache.set(key, url); return { o, url }; // a draft (no key) is never cached
  };
  const thumbOf = bp => { const r = shoot(`${bp.id}@${bp.version}`, () => blueprintProto(bp).clone()); return typeof r === 'string' ? r : r.url; };
  thumbOf.villa = (state, v) => { const r = shoot(v.id ? `${v.id}@${v.version}` : null, () => villaPreview(state, v)); if (typeof r === 'string') return r; disposePreview(r.o); return r.url; };
  return thumbOf;
}
