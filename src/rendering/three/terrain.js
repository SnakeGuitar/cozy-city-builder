// The ground of a generated map, drawn from the core's terrain data (domain/terrain.js): a height-mapped watercolour
// mesh coloured per biome, water and ice, instanced vegetation and rocks, mist, and the biome's light and fog.
// The classic meadow (no terrain) keeps the original painted ground from scene.js. Rendering only.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { C, T, waterMat } from './art.js';
import { BIOMES, BIOME_IDS, FLORA_KINDS } from '../../core/config/biomes.js';
import { heightAt, terrainDecor, hash2 } from '../../core/domain/terrain.js';
import { obbOf, queryArea } from '../../core/domain/space.js';
import { pointInObb } from '../../core/domain/geometry.js';
import { onRoad } from '../../core/domain/roads.js';

const PAPER = new THREE.Color('#efe3c6');
/** Biome light: multipliers for the sun and sky colours, and the hemisphere's ground bounce. */
export const LIGHT_TINTS = {
  warm: { sun: '#ffffff', sky: '#ffffff' }, bright: { sun: '#fffaf0', sky: '#fffdf6' }, golden: { sun: '#ffe2b8', sky: '#fff0dc' },
  misty: { sun: '#e9eef0', sky: '#eef2f0' }, cold: { sun: '#dfe9ff', sky: '#e6eeff' },
};

// ---------------------------------------------------------------- vegetation geometry (vertex coloured, merged per kind)
function coloured(geo, col) {
  const g = geo.index ? geo.toNonIndexed() : geo, c = new THREE.Color(col), a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g;
}
const trunk = (h, r = .025, col = C.woodD) => coloured(new THREE.CylinderGeometry(r * .7, r, h, 6).translate(0, h / 2, 0), col);
const ball = (r, x, y, z, col, sx = 1, sy = 1, sz = 1) => coloured(new THREE.IcosahedronGeometry(r, 1).scale(sx, sy, sz).translate(x, y, z), col);
const cone = (r, h, y, col, seg = 7) => coloured(new THREE.ConeGeometry(r, h, seg).translate(0, y + h / 2, 0), col);
function floraGeometry(kind) {
  const parts = [];
  switch (kind) {
    case 'broadleaf': parts.push(trunk(.22), ball(.17, 0, .33, 0, C.leaf), ball(.12, .09, .27, .05, C.leafD), ball(.11, -.07, .3, -.06, C.leafL)); break;
    case 'conifer': parts.push(trunk(.12), cone(.17, .26, .08, C.leafG), cone(.13, .22, .22, '#4f7a3a'), cone(.08, .18, .36, C.leafG)); break;
    case 'snow_conifer': parts.push(trunk(.12), cone(.17, .26, .08, '#4a6b4c'), cone(.13, .22, .22, '#4a6b4c'), cone(.08, .18, .36, '#4a6b4c'), cone(.12, .07, .23, '#f6f8fb'), cone(.07, .07, .37, '#f6f8fb'), cone(.04, .06, .5, '#f6f8fb')); break;
    case 'tree_fern': parts.push(trunk(.34, .02, '#6b5240')); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; parts.push(coloured(new THREE.ConeGeometry(.04, .26, 4).rotateZ(Math.PI / 2 + .5).rotateY(a).translate(Math.cos(a) * .1, .34, -Math.sin(a) * .1), i % 2 ? C.leafG : C.leaf)); } break;
    case 'autumn': parts.push(trunk(.22), ball(.17, 0, .33, 0, '#d9823f'), ball(.12, .09, .27, .05, '#c4553a'), ball(.11, -.07, .3, -.06, '#e7b04b')); break;
    case 'palm': { for (let i = 0; i < 5; i++) parts.push(coloured(new THREE.CylinderGeometry(.018, .022, .1, 6).translate(i * .012, .05 + i * .1, 0), '#9b7a55')); for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; parts.push(coloured(new THREE.ConeGeometry(.035, .3, 4).scale(1, 1, .3).rotateZ(Math.PI / 2 + .7).rotateY(a).translate(.05 + Math.cos(a) * .12, .5, -Math.sin(a) * .12), i % 2 ? C.leafG : C.leaf)); } break; }
    case 'dune_grass': for (let i = 0; i < 5; i++) parts.push(coloured(new THREE.ConeGeometry(.012, .14, 4).rotateZ((i - 2) * .25).translate((i - 2) * .025, .07, (i % 2) * .02), i % 2 ? '#c9b46a' : '#a9b56a')); break;
    case 'reeds': for (let i = 0; i < 6; i++) { parts.push(coloured(new THREE.CylinderGeometry(.005, .007, .3, 4).rotateZ((i - 3) * .06).translate((i - 3) * .02, .15, (i % 3) * .02 - .02), '#7f9a5a')); if (i % 2) parts.push(coloured(new THREE.CapsuleGeometry(.012, .05, 2, 4).translate((i - 3) * .02, .3, (i % 3) * .02 - .02), '#7a5a3a')); } break;
    case 'willow': parts.push(trunk(.2, .03), ball(.2, 0, .3, 0, '#9cbc6a', 1, .8, 1), ball(.17, 0, .2, 0, '#a9c482', 1.1, .9, 1.1)); break;
    case 'cypress': parts.push(trunk(.06, .02), ball(.07, 0, .3, 0, '#4e6b3a', 1, 3.6, 1)); break;
    case 'olive': parts.push(trunk(.14, .03, '#7a6a55'), ball(.13, .04, .22, 0, '#9aab84', 1.2, .7, 1), ball(.1, -.07, .2, .05, '#8a9c76', 1, .7, 1)); break;
    case 'shrub': parts.push(ball(.07, 0, .05, 0, C.leaf, 1.2, .8, 1), ball(.05, .06, .04, .03, C.leafD)); break;
    case 'shrub_dry': parts.push(ball(.07, 0, .05, 0, '#9a9a6a', 1.2, .7, 1), ball(.05, .06, .04, .03, '#b0a074')); break;
    case 'shrub_snow': parts.push(ball(.07, 0, .05, 0, '#5d7a5e', 1.2, .8, 1), ball(.06, 0, .09, 0, '#f6f8fb', 1.1, .4, 1)); break;
    case 'flowers': parts.push(ball(.04, 0, .025, 0, C.leaf, 1.6, .5, 1.6)); for (let i = 0; i < 5; i++) parts.push(ball(.016, Math.cos(i * 1.3) * .04, .05, Math.sin(i * 1.3) * .04, '#ffffff')); break;
    default: parts.push(coloured(new THREE.DodecahedronGeometry(.13, 0).scale(1.2, .6, 1).translate(0, .05, 0), '#a9a49a'));
  }
  return mergeGeometries(parts);
}
const floraMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const FLOWER_TINTS = ['#f3bfc8', '#f2d27c', '#ffffff', '#d2444b', '#b9a3cf'].map(c => new THREE.Color(c));

export function createTerrainView(sc) {
  const { scene } = sc;
  let group = null, flora = [], current = null, mist = [], hideKey = '';
  const iceMat = new THREE.MeshLambertMaterial({ color: '#e6f0f6', emissive: new THREE.Color('#9fc4d8'), emissiveIntensity: .12 });
  const seaMat = waterMat.clone(); seaMat.transparent = true; seaMat.opacity = .88; seaMat.depthWrite = false;
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: T.paint('#f4ecdc') });

  function dispose() {
    if (group) { scene.remove(group); group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    for (const m of mist) scene.remove(m.s); group = null; flora = []; mist = [];
  }
  /** Ground colour of a vertex: the biome's palette varied by noise, sand and mud near water, snow, rock. */
  function vertexColour(state, x, z, out) {
    const t = state.map.terrain, N = t.n - 1, i = Math.max(0, Math.min(N - 1, Math.floor(x - t.origin))), j = Math.max(0, Math.min(N - 1, Math.floor(z - t.origin))), k = j * N + i;
    const id = BIOME_IDS[t.cells.biome.charCodeAt(k) - 97], B = BIOMES[id], pal = B.look.ground, seed = state.map.seed;
    const n = hash2(Math.floor(x * 2), Math.floor(z * 2), seed + 3) * .5 + hash2(Math.floor(x * .5), Math.floor(z * .5), seed + 4) * .5;
    out.set(pal[Math.min(pal.length - 1, Math.floor(n * pal.length))]);
    const shore = +t.cells.waterDist[k], flag = t.cells.flags[k];
    if (id === 'beach' && shore <= 2) out.lerp(new THREE.Color('#f1e3b8'), shore <= 1 ? .9 : .5);
    else if (shore === 0 && flag === '1') out.lerp(new THREE.Color(id === 'beach' ? '#e2d3a3' : '#8a7a5a'), .55);
    else if (shore === 1 && id === 'wetland') out.lerp(new THREE.Color('#6f8a5a'), .4);
    if (flag === '3') out.lerp(new THREE.Color('#b3ada2'), .7);
    // fade to paper beyond the playable edge
    const half = state.map.size / 2, out2 = Math.max(Math.abs(x), Math.abs(z)) - half;
    if (out2 > 0) out.lerp(PAPER, Math.min(1, out2 / t.margin));
    return out;
  }
  function build(state) {
    dispose(); current = state; group = new THREE.Group(); scene.add(group);
    const t = state.map.terrain, sub = 2, N = (t.n - 1) * sub + 1, size = t.n - 1;
    const geo = new THREE.PlaneGeometry(size, size, N - 1, N - 1).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), uv = geo.attributes.uv;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v) + t.origin + size / 2, z = pos.getZ(v) + t.origin + size / 2;
      pos.setXYZ(v, x, heightAt(state, x, z), z); vertexColour(state, x, z, c); col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      uv.setXY(v, x / 4, z / 4);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, groundMat); ground.receiveShadow = true; ground.renderOrder = -1; group.add(ground);
    // a skirt of paper below the edge so the map never shows its underside
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(size * 3, size * 3).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: PAPER }));
    skirt.position.y = Math.min(...t.heights) / 1000 - .05; group.add(skirt);
    // water and ice, one quad per wet cell at the water surface
    const water = [], ice = [];
    for (let j = 0; j < t.n - 1; j++) for (let i = 0; i < t.n - 1; i++) {
      const f = t.cells.flags[j * (t.n - 1) + i]; if (f !== '1' && f !== '2') continue;
      const x = t.origin + i + .5, z = t.origin + j + .5, top = Math.max(...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => t.heights[(j + b) * t.n + i + a] / 1000));
      const y = Math.min(t.waterLevel, top + .02) + .01;
      (f === '1' ? water : ice).push(new THREE.PlaneGeometry(1.02, 1.02).rotateX(-Math.PI / 2).translate(x, y, z));
    }
    if (water.length) { const m = new THREE.Mesh(mergeGeometries(water), seaMat); m.renderOrder = 1; group.add(m); }
    if (ice.length) { const m = new THREE.Mesh(mergeGeometries(ice), iceMat); m.receiveShadow = true; group.add(m); }
    // vegetation: one instanced mesh per kind
    const decor = terrainDecor(state), byKind = new Map(FLORA_KINDS.map(k => [k, []]));
    for (const d of decor) (byKind.get(d.kind) || byKind.get('rock')).push(d);
    for (const [kind, list] of byKind) {
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(floraGeometry(kind), floraMat, list.length); mesh.castShadow = kind !== 'flowers' && kind !== 'dune_grass'; mesh.receiveShadow = true;
      if (kind === 'flowers' || kind === 'autumn') list.forEach((d, i) => mesh.setColorAt(i, kind === 'flowers' ? FLOWER_TINTS[(d.v + i) % FLOWER_TINTS.length] : new THREE.Color().setHSL(.05 + d.v * .03, .6, .62)));
      group.add(mesh); flora.push({ mesh, list });
    }
    hideKey = ''; refreshHidden(state);
    // mist for foggy biomes
    const fog = state.map.biomePreset !== 'mixed' && BIOMES[state.map.biomePreset]?.look.fog;
    if (fog) for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.puff(), color: fog.color, transparent: true, depthWrite: false, opacity: .25 * fog.density + .1 }));
      const x = (hash2(i, 1, state.map.seed) - .5) * size * .9, z = (hash2(i, 2, state.map.seed) - .5) * size * .9; s.scale.set(6, 2.2, 1);
      s.position.set(x, heightAt(state, x, z) + .5, z); scene.add(s); mist.push({ s, x, z, ph: i });
    }
  }
  /** Hides wild plants and rocks standing under buildings or roads (they are scenery, the town wins). */
  function refreshHidden(state) {
    const key = Object.keys(state.buildings).length + ':' + Object.keys(state.roads.segments).length + ':' + Object.keys(state.roads.nodes).length + ':' + JSON.stringify(Object.values(state.buildings).map(b => [b.position.x, b.position.z, b.rotation]).slice(-3));
    if (key === hideKey) return; hideKey = key;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (const { mesh, list } of flora) {
      list.forEach((d, i) => {
        const covered = queryArea(state, { minX: d.x - .2, maxX: d.x + .2, minZ: d.z - .2, maxZ: d.z + .2 }).some(id => pointInObb(obbOf(state.buildings[id]), d.x, d.z, .15)) || onRoad(state, d.x, d.z);
        q.setFromAxisAngle(up, d.rot); p.set(d.x, heightAt(state, d.x, d.z), d.z); s.setScalar(covered ? 0 : d.scale);
        m4.compose(p, q, s); mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    }
  }
  return {
    /** Draws a map: generated terrain, or the classic painted meadow. */
    rebuild(state) {
      const generated = !!state.map?.terrain;
      for (const o of sc.classicGround) o.visible = !generated;
      if (!generated) { dispose(); current = state; scene.fog = null; return; }
      if (current?.map !== state.map || !group) build(state); else refreshHidden(state);
    },
    /** After the town changed: re-check which plants are covered. */
    refresh(state) { if (group) refreshHidden(state); },
    /** Biome light tint and fog for this frame (call after the day light is applied). */
    frame(state, camera, target, clock) {
      const T0 = state.map?.terrain, preset = state.map?.biomePreset;
      const B = T0 && (preset === 'mixed' ? null : BIOMES[preset]);
      const tint = LIGHT_TINTS[B?.look.light || 'warm'];
      sc.sun.color.multiply(new THREE.Color(tint.sun)); sc.hemi.color.multiply(new THREE.Color(tint.sky));
      const fog = B?.look.fog;
      if (fog) { // fog by depth from the camera, scaled to how far the camera stands from what it looks at
        const dist = camera.position.distanceTo(target);
        if (!scene.fog) scene.fog = new THREE.Fog(fog.color, 1, 100);
        scene.fog.color.set(fog.color); scene.fog.near = dist * (1.05 - fog.density * .35); scene.fog.far = dist * (1.9 - fog.density * .5);
      } else scene.fog = null;
      for (const m of mist) { m.s.position.x = m.x + Math.sin(clock * .05 + m.ph) * 1.5; m.s.material.opacity = .14 + Math.sin(clock * .2 + m.ph) * .05; }
    },
    get weather() { const p = current?.map?.biomePreset; return p === 'snowy' ? 'snow' : p === 'autumn_valley' ? 'leaves' : 'petals'; },
  };
}
