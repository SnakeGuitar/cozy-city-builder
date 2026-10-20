// Texture arrays: the painted textures of one size share a single sampler2DArray, so merged meshes of many colours
// draw with one material per texture size instead of one per colour. Each vertex carries its layer (`texLayer`).
// Only plain matte materials qualify: a painted canvas map, or a flat colour (stored as a solid layer). Glass, lamps,
// cut-outs, transparent and tinted materials keep their own. The layers hold the very same pixels (same filtering,
// mipmaps, wrapping and anisotropy), so a merged chunk looks exactly like its separate meshes. Rendering only.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SOLID = 64; // flat colours become 64 × 64 solid layers, next to the 64 × 64 paint washes
const arrays = new Map(); // 'w×h' → { w, h, n, data, tex, uniform, material }
const bySource = new Map(); // texture or flat colour → { material, layer }
const byMat = new WeakMap(); // source material → { material, layer } | null

const plainMat = m => m.constructor === THREE.MeshLambertMaterial && m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile &&
  m.visible && m.side === THREE.FrontSide && !m.transparent && m.opacity === 1 && !m.alphaTest && !m.vertexColors && !m.wireframe &&
  !m.flatShading && m.fog && m.blending === THREE.NormalBlending && m.depthTest && m.depthWrite && m.emissive.getHex() === 0 &&
  !m.emissiveMap && !m.alphaMap && !m.aoMap && !m.lightMap && !m.bumpMap && !m.normalMap && !m.displacementMap && !m.specularMap && !m.envMap;
const plainMap = t => t.isCanvasTexture && t.image instanceof HTMLCanvasElement && t.flipY && t.colorSpace === THREE.SRGBColorSpace &&
  t.wrapS === THREE.RepeatWrapping && t.wrapT === THREE.RepeatWrapping && t.repeat.x === 1 && t.repeat.y === 1 && !t.offset.x && !t.offset.y && !t.rotation &&
  t.magFilter === THREE.LinearFilter && t.minFilter === THREE.LinearMipmapLinearFilter;

function arrayOf(w, h) {
  const key = w + '×' + h; let a = arrays.get(key); if (a) return a;
  a = { w, h, n: 0, data: null, tex: null, uniform: { value: null } };
  const material = new THREE.MeshLambertMaterial();
  material.onBeforeCompile = sh => {
    sh.uniforms.layerMap = a.uniform;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float texLayer;\nvarying vec3 vLayerUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvLayerUv = vec3( uv, texLayer );');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2DArray layerMap;\nvarying vec3 vLayerUv;')
      .replace('#include <map_fragment>', 'diffuseColor *= texture( layerMap, vLayerUv );');
  };
  material.customProgramCacheKey = () => 'texLayer';
  a.material = material; arrays.set(key, a); resize(a, 8); return a;
}
/** A new (larger) texture holding the layers so far; texture dimensions are fixed once uploaded. */
function resize(a, cap) {
  const data = new Uint8Array(a.w * a.h * 4 * cap); if (a.data) data.set(a.data);
  const tex = new THREE.DataArrayTexture(data, a.w, a.h, cap);
  tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  a.tex?.dispose(); a.tex = tex; a.data = data; a.uniform.value = tex;
}
/** Appends a layer: `fill(bytes)` writes w × h RGBA texels, bottom row first (what flipY does for the canvas maps). */
function addLayer(a, fill) {
  if (a.n === a.tex.image.depth) resize(a, a.n * 2);
  const size = a.w * a.h * 4; fill(a.data.subarray(a.n * size, (a.n + 1) * size));
  a.tex.needsUpdate = true; return a.n++;
}
function canvasLayer(t) {
  const c = t.image, w = c.width, h = c.height, a = arrayOf(w, h), px = c.getContext('2d').getImageData(0, 0, w, h).data, row = w * 4;
  return { material: a.material, layer: addLayer(a, out => { for (let y = 0; y < h; y++) out.set(px.subarray((h - 1 - y) * row, (h - y) * row), y * row); }) };
}
function solidLayer(hex) {
  const a = arrayOf(SOLID, SOLID), r = hex >> 16 & 255, g = hex >> 8 & 255, b = hex & 255;
  return { material: a.material, layer: addLayer(a, out => { for (let i = 0; i < out.length; i += 4) { out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255; } }) };
}

/** The shared array material and layer standing in for `mat`, or null when `mat` must keep drawing on its own. */
export function layerOf(mat) {
  if (byMat.has(mat)) return byMat.get(mat);
  let out = null;
  if (mat && plainMat(mat)) {
    if (mat.map && plainMap(mat.map) && mat.color.getHex() === 0xffffff) { out = bySource.get(mat.map) || canvasLayer(mat.map); bySource.set(mat.map, out); }
    else if (!mat.map) { const hex = mat.color.getHex(); out = bySource.get(hex) || solidLayer(hex); bySource.set(hex, out); }
  }
  byMat.set(mat, out); return out;
}
/** Tags every vertex of `geo` with a layer (adds zero UVs if it has none, so it merges with its neighbours). */
export function setLayer(geo, layer) {
  const n = geo.attributes.position.count;
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  geo.setAttribute('texLayer', new THREE.Float32BufferAttribute(new Float32Array(n).fill(layer), 1));
  return geo;
}
/**
 * Regroups a material → geometry map: plain materials move to their array material (geometries tagged with their
 * layer and merged). Geometries that were merged are disposed; the result owns what it holds.
 */
export function layered(map) {
  const out = new Map();
  for (const [mat, geo] of map) { const l = layerOf(mat), key = l ? l.material : mat; if (l) setLayer(geo, l.layer); if (!out.has(key)) out.set(key, []); out.get(key).push(geo); }
  return new Map([...out].map(([mat, list]) => { if (list.length === 1) return [mat, list[0]]; const g = mergeGeometries(list); list.forEach(x => x.dispose()); return [mat, g]; }));
}
/** Layers in use per texture size (diagnostics). */
export const layerStats = () => Object.fromEntries([...arrays].map(([k, a]) => [k, a.n]));
