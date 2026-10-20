// Procedural terrain, pure and deterministic: the same (seed, generator version, size, preset) always gives the same map.
// No Math.random: every value comes from integer hash noise seeded by the map seed.
//
// state.map = { size, seed, generatorVersion, biomePreset, terrain }
//   terrain = null for the classic flat meadow (every save made before generated maps), or
//   { n, origin, margin, waterLevel, heights: int[n·n] (millimetres, vertices on whole units),
//     cells: { biome: string, flags: string, moisture: string, temperature: string, waterDist: string } }  (one char per cell)
//   flags: '0' land · '1' water · '2' ice · '3' rock outcrop. Cells cover the map plus MAP_MARGIN of scenery on each side.
//
// Vegetation and loose rocks are decoration (terrainDecor): generated from the same seed, never stored as buildings.
import { BIOMES, BIOME_IDS, MIXED_POOL, GENERATOR_VERSION, MAP_MARGIN, MAX_BUILD_STEP, MAX_ROAD_GRADE, CLASSIC_PRESET, MAP_PRESETS } from '../config/biomes.js';
import { GRID_SIZE } from '../config/world.js';
import { obbCorners } from './geometry.js';

// ---------------------------------------------------------------- deterministic noise
/** Hash of an integer lattice point and a seed → [0, 1). */
export function hash2(ix, iz, seed) {
  let h = Math.imul(ix | 0, 374761393) + Math.imul(iz | 0, 668265263) + Math.imul(seed | 0, 362437) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
/** Smooth value noise in [0, 1). */
export function valueNoise(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = fade(x - x0), fz = fade(z - z0);
  const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed), c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
/** Fractal noise in [0, 1): `octaves` layers, each twice the frequency and half the amplitude. */
export function fbm(x, z, seed, octaves = 4) {
  let s = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) { s += valueNoise(x * f, z * f, seed + o * 1013) * amp; norm += amp; amp *= .5; f *= 2; }
  return s / norm;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- height and climate of one preset
/** A preset's ground height at (x, z) before the town centre is levelled. */
function presetHeight(id, x, z, size, seed) {
  const P = BIOMES[id], R = P.relief, f = R.freq;
  let h = (fbm(x * f + 31.7, z * f - 12.3, seed + 11, R.octaves) - .5) * 2 * R.amp;
  const angle = hash2(1, 2, seed) * Math.PI * 2, cx = Math.cos(angle), cz = Math.sin(angle);
  if (P.shape === 'hills') h += (fbm(x * f * .35, z * f * .35, seed + 23, 2) - .5) * R.amp * 1.4;
  else if (P.shape === 'coast') { // the sea lies beyond a wavy coastline on one side; the land rises gently inland
    const t = x * cx + z * cz, coast = size * .27 + (valueNoise(t * .02 + 7, (x * -cz + z * cx) * .09, seed + 51) - .5) * 4;
    h = h * .45 + (coast - t) * .16;
  } else if (P.shape === 'valley') { // a river meanders along a valley floor; the ground climbs toward the edges
    const along = x * cx + z * cz, across = -x * cz + z * cx + size * .2 + (valueNoise(along * .07, 3.3, seed + 61) - .5) * 4;
    const p = Math.abs(across);
    h = h * .5 + Math.pow(p / (size * .5), 1.5) * 3.2 - .1;
    if (p < 1.4) h = Math.min(h, -.55 + p * .32);
  } else if (P.shape === 'basin') h = h * .7 + .02 + (fbm(x * .16, z * .16, seed + 71, 2) - .55) * .55; // low ground, pools where it dips
  return h;
}
/** Regions of a mixed map: centres and their biomes, from the seed. */
function mixedRegions(size, seed) {
  const k = 4 + Math.floor(hash2(9, 9, seed) * 2), out = [], pool = [...MIXED_POOL];
  for (let i = 0; i < k; i++) {
    const a = (i / k + hash2(i, 3, seed) * .2) * Math.PI * 2, r = size * (.18 + hash2(i, 5, seed) * .3);
    const pick = Math.floor(hash2(i, 7, seed) * pool.length), biome = pool.splice(pick, 1)[0] || MIXED_POOL[i % MIXED_POOL.length];
    out.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, biome });
  }
  return out;
}
function regionWeights(regions, x, z, size) {
  const s2 = Math.pow(size * .2, 2), w = regions.map(r => Math.exp(-((x - r.x) ** 2 + (z - r.z) ** 2) / (2 * s2)));
  const sum = w.reduce((a, b) => a + b, 0) || 1; return w.map(v => v / sum);
}

/**
 * Generates a map's terrain. Pure: same inputs, same output, on any machine.
 * @param {{ seed: number, size: number, preset: string, version?: number }} p
 */
export function generateTerrain({ seed, size, preset, version = GENERATOR_VERSION }) {
  if (version !== GENERATOR_VERSION) throw new Error(`terrain generator v${version} is not available (this is v${GENERATOR_VERSION})`);
  if (!MAP_PRESETS.includes(preset)) throw new Error(`unknown map preset ${preset}`);
  seed = seed >>> 0;
  const M = MAP_MARGIN, n = size + 2 * M + 1, origin = -(size / 2 + M), cellsN = n - 1, half = size / 2;
  const regions = preset === 'mixed' ? mixedRegions(size, seed) : null;
  const weightsAt = (x, z) => regions ? regionWeights(regions, x, z, size) : [1];
  const idsAt = regions ? regions.map(r => r.biome) : [preset];
  const raw = (x, z) => { const w = weightsAt(x, z); return idsAt.reduce((s, id, i) => s + w[i] * presetHeight(id, x, z, size, seed), 0); };
  const levelAt = (x, z) => { const w = weightsAt(x, z); return idsAt.reduce((s, id, i) => s + w[i] * BIOMES[id].water.level, 0); };
  // the town centre is levelled to dry, gentle ground so the café always has a home
  const centre = Math.max(raw(0, 0), levelAt(0, 0) + .45, 0);
  const heights = new Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = origin + i, z = origin + j, k = smooth(size * .07, size * .2, Math.hypot(x, z));
    let h = raw(x, z) * k + centre * (1 - k);
    if (Math.max(Math.abs(x), Math.abs(z)) > half) h += (Math.max(Math.abs(x), Math.abs(z)) - half) * .05; // scenery rises a little past the edge
    heights[j * n + i] = Math.round(h * 1000);
  }
  const H = (i, j) => heights[j * n + i] / 1000;
  // cells: water, climate, biome, rock
  const biome = [], flags = [], moisture = [], temperature = [], wet = new Array(cellsN * cellsN).fill(false);
  for (let j = 0; j < cellsN; j++) for (let i = 0; i < cellsN; i++) {
    const x = origin + i + .5, z = origin + j + .5, w = weightsAt(x, z), main = idsAt[w.indexOf(Math.max(...w))];
    const avg = (H(i, j) + H(i + 1, j) + H(i, j + 1) + H(i + 1, j + 1)) / 4;
    const water = avg < levelAt(x, z);
    wet[j * cellsN + i] = water;
    const P = BIOMES[main];
    const m = Math.max(0, Math.min(.999, idsAt.reduce((s, id, q) => s + w[q] * BIOMES[id].moisture, 0) + (fbm(x * .08, z * .08, seed + 31, 3) - .5) * .5));
    const t = Math.max(0, Math.min(.999, idsAt.reduce((s, id, q) => s + w[q] * BIOMES[id].temperature, 0) + (fbm(x * .06, z * .06, seed + 41, 3) - .5) * .3 - Math.max(0, avg) * .06));
    const slope = Math.max(H(i, j), H(i + 1, j), H(i, j + 1), H(i + 1, j + 1)) - Math.min(H(i, j), H(i + 1, j), H(i, j + 1), H(i + 1, j + 1));
    const rocky = !water && P.rocks > 0 && Math.hypot(x, z) > size * .16 && hash2(i, j, seed + 81) < P.rocks * Math.min(1, slope / .5 + (fbm(x * .2, z * .2, seed + 91, 2) > .66 ? .6 : 0));
    biome.push(String.fromCharCode(97 + BIOME_IDS.indexOf(main)));
    flags.push(water ? (P.water.kind === 'ice' ? '2' : '1') : rocky ? '3' : '0');
    moisture.push(String(Math.floor(m * 10))); temperature.push(String(Math.floor(t * 10)));
  }
  // distance to water (cells, capped at 9), for moisture-loving plants and shores
  const dist = wet.map(v => (v ? 0 : 9));
  for (let pass = 0; pass < 9; pass++) for (let j = 0; j < cellsN; j++) for (let i = 0; i < cellsN; i++) {
    const k = j * cellsN + i; if (dist[k] === 0) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < cellsN && b < cellsN) dist[k] = Math.min(dist[k], dist[b * cellsN + a] + 1); }
  }
  return { n, origin, margin: M, waterLevel: levelAt(0, 0), heights,
    cells: { biome: biome.join(''), flags: flags.join(''), moisture: moisture.join(''), temperature: temperature.join(''), waterDist: dist.join('') } };
}

// ---------------------------------------------------------------- maps
/** A map description: the classic flat meadow, or a generated one. */
export function createMap({ size = GRID_SIZE, seed = 0, preset = CLASSIC_PRESET } = {}) {
  if (preset === CLASSIC_PRESET) return { size: GRID_SIZE, seed: 0, generatorVersion: 0, biomePreset: CLASSIC_PRESET, terrain: null };
  return { size, seed: seed >>> 0, generatorVersion: GENERATOR_VERSION, biomePreset: preset, terrain: generateTerrain({ seed, size, preset }) };
}
const terrainOf = state => state.map?.terrain || null;

/** Ground height at a point (bilinear between vertices); 0 on the classic map. */
export function heightAt(state, x, z) {
  const T = terrainOf(state); if (!T) return 0;
  const fx = Math.max(0, Math.min(T.n - 1.000001, x - T.origin)), fz = Math.max(0, Math.min(T.n - 1.000001, z - T.origin));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, h = (a, b) => T.heights[b * T.n + a];
  return ((h(i, j) * (1 - u) + h(i + 1, j) * u) * (1 - v) + (h(i, j + 1) * (1 - u) + h(i + 1, j + 1) * u) * v) / 1000;
}
/** Index of the cell under a point, or −1 outside the generated area. */
export function cellIndex(state, x, z) {
  const T = terrainOf(state); if (!T) return -1;
  const i = Math.floor(x - T.origin), j = Math.floor(z - T.origin), N = T.n - 1;
  return i >= 0 && j >= 0 && i < N && j < N ? j * N + i : -1;
}
const FLAG = { '0': null, '1': 'water', '2': 'ice', '3': 'rock' };
/** What covers the ground at a point: null (land), 'water', 'ice' or 'rock'. */
export function groundAt(state, x, z) { const k = cellIndex(state, x, z); return k < 0 ? null : FLAG[terrainOf(state).cells.flags[k]]; }
/** Biome id at a point ('classic' on the classic map). */
export function biomeAt(state, x, z) { const k = cellIndex(state, x, z); return k < 0 ? (state.map?.biomePreset || CLASSIC_PRESET) : BIOME_IDS[terrainOf(state).cells.biome.charCodeAt(k) - 97]; }

/**
 * Why a building cannot stand on this ground, or null: 'water' (water or ice), 'rock' (an outcrop) or 'slope'
 * (the ground under the footprint rises more than MAX_BUILD_STEP). `o` is the building's collision box.
 */
export function terrainBlocker(state, o, { onWater = false } = {}) {
  if (!terrainOf(state)) return null;
  const pts = [{ x: o.x, z: o.z }, ...obbCorners(o)];
  const c = obbCorners(o); for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; pts.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, { x: (a.x * 3 + b.x) / 4, z: (a.z * 3 + b.z) / 4 }); }
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) {
    const g = groundAt(state, p.x, p.z);
    if (g === 'rock') return 'rock';
    if ((g === 'water' || g === 'ice') && !onWater) return 'water';
    const h = heightAt(state, p.x, p.z); lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return hi - lo > MAX_BUILD_STEP + 1e-9 ? 'slope' : null;
}
/** Why a road cannot follow this centre line, or null: 'water', 'rock' or 'slope' (steeper than MAX_ROAD_GRADE). */
export function roadTerrainBlocker(state, polyline) {
  if (!terrainOf(state)) return null;
  for (let i = 0; i < polyline.length; i++) {
    const p = polyline[i], g = groundAt(state, p.x, p.z);
    if (g === 'water' || g === 'ice') return 'water';
    if (g === 'rock') return 'rock';
    if (i) { const q = polyline[i - 1], run = Math.hypot(p.x - q.x, p.z - q.z); if (run > 1e-9 && Math.abs(heightAt(state, p.x, p.z) - heightAt(state, q.x, q.z)) / run > MAX_ROAD_GRADE + 1e-9) return 'slope'; }
  }
  return null;
}

// ---------------------------------------------------------------- decoration (never stored)
const decoCache = new WeakMap();
/**
 * Vegetation and loose rocks for a generated map: [{ kind, x, z, scale, rot, v }], in a fixed order.
 * Pure for a given map; cached per terrain object. Renderers hide items standing under buildings or roads.
 */
export function terrainDecor(state) {
  const T = terrainOf(state); if (!T) return [];
  if (decoCache.has(T)) return decoCache.get(T);
  const N = T.n - 1, seed = state.map.seed >>> 0, out = [], size = state.map.size;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, flag = T.cells.flags[k], biome = BIOMES[BIOME_IDS[T.cells.biome.charCodeAt(k) - 97]];
    const x0 = T.origin + i, z0 = T.origin + j, cx = x0 + .5, cz = z0 + .5, nearCentre = Math.hypot(cx, cz) < size * .1;
    if (flag === '3') { for (let q = 0; q < 2; q++) out.push({ kind: 'rock', x: x0 + .25 + hash2(i, j * 7 + q, seed + 5) * .5, z: z0 + .25 + hash2(i * 3 + q, j, seed + 6) * .5, scale: .8 + hash2(i, j + q, seed + 7) * .7, rot: hash2(i + q, j, seed + 8) * 6.28, v: q }); continue; }
    if (flag !== '0') continue;
    const F = biome.flora, wetness = +T.cells.moisture[k] / 10, shore = +T.cells.waterDist[k];
    let density = F.density * (nearCentre ? .15 : 1) * (.6 + wetness * .6);
    if (F.clearings && fbm(cx * .09, cz * .09, seed + 101, 2) < F.clearings) density *= .15; // clearings in forests
    const count = Math.floor(density * 3 + hash2(i, j, seed + 103));
    const kinds = Object.entries(F.mix), total = kinds.reduce((s, [, w]) => s + w, 0);
    for (let q = 0; q < count; q++) {
      let r = hash2(i * 13 + q, j * 7, seed + 107) * total, kind = kinds[0][0];
      for (const [kk, w] of kinds) { if ((r -= w) <= 0) { kind = kk; break; } }
      if (kind === 'reeds' && shore > 2) kind = 'shrub';      // reeds grow at the water's edge
      out.push({ kind, x: x0 + .12 + hash2(i, j * 5 + q, seed + 109) * .76, z: z0 + .12 + hash2(i * 5 + q, j, seed + 113) * .76,
        scale: .75 + hash2(i + q * 3, j, seed + 127) * .6, rot: hash2(i, j + q * 3, seed + 131) * 6.28, v: Math.floor(hash2(i + q, j + q, seed + 137) * 3) });
    }
    if (biome.rocks && hash2(i, j, seed + 139) < biome.rocks * .15) out.push({ kind: 'rock', x: cx, z: cz, scale: .45, rot: hash2(j, i, seed + 141) * 6.28, v: 2 });
  }
  decoCache.set(T, out); return out;
}

/** Share of the playable map where a 1 × 1 building could stand (no water, rock or steep slope). For balance and tests. */
export function buildableShare(state) {
  if (!terrainOf(state)) return 1;
  const half = state.map.size / 2; let ok = 0, all = 0;
  for (let z = -half + .5; z < half; z++) for (let x = -half + .5; x < half; x++) { all++; if (!terrainBlocker(state, { x, z, hw: .5, hd: .5, c: 1, s: 0 })) ok++; }
  return ok / all;
}
