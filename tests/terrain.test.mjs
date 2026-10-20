// Procedural terrain and biomes: determinism, the character of each biome, terrain rules, saving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTerrain, createMap, heightAt, groundAt, biomeAt, terrainDecor, buildableShare, canPlace, planRoad, CMD,
  MAP_PRESETS, BIOME_IDS, BIOMES, GENERATOR_VERSION, createSaveDocument, loadSave, serializeGame, normalizeMap, computeDerived, createNewGameState } from '../src/core/index.js';
import { createGame } from '../src/application/game.js';
import { makeState } from './helpers.mjs';

const withMap = (preset, seed = 7, size = 32) => makeState([], { map: createMap({ preset, seed, size }), coins: 9999 });
const share = (T, flag) => [...T.cells.flags].filter(c => c === flag).length / T.cells.flags.length;
const kinds = s => { const k = {}; for (const d of terrainDecor(s)) k[d.kind] = (k[d.kind] || 0) + 1; return k; };
const cellsOf = (s, pred) => { const out = [], h = s.map.size / 2; for (let z = -h + .5; z < h; z++) for (let x = -h + .5; x < h; x++) if (pred(x, z)) out.push({ x, z }); return out; };

for (const preset of MAP_PRESETS) test(`${preset}: same seed and version, same map; another seed, another map`, () => {
  const a = generateTerrain({ seed: 4242, size: 32, preset }), b = generateTerrain({ seed: 4242, size: 32, preset });
  assert.deepEqual(a, b);
  const c = generateTerrain({ seed: 4243, size: 32, preset });
  assert.notDeepEqual(a.heights, c.heights, 'heights differ');
  const s = withMap(preset, 4242); assert.deepEqual(terrainDecor(s), terrainDecor(withMap(preset, 4242)), 'decoration too');
  // the town centre is always dry, gentle ground for the café
  assert.equal(canPlace(s, 'cafe', { x: 0, z: 0 }, 0), null);
  assert.ok(buildableShare(s) > .45, `${preset} leaves room to build`);
});

test('biomes differ from each other', () => {
  const sig = p => JSON.stringify(generateTerrain({ seed: 9, size: 24, preset: p }).heights.slice(0, 300));
  assert.equal(new Set(MAP_PRESETS.map(sig)).size, MAP_PRESETS.length);
});

test('each biome has its character', () => {
  const plains = withMap('plains'); assert.ok(buildableShare(plains) > .9, 'plains: mostly flat and buildable'); assert.ok(kinds(plains).flowers > 50, 'flowers');
  const fog = withMap('cloud_forest'), temperate = withMap('temperate_forest');
  assert.ok(terrainDecor(fog).length > terrainDecor(plains).length * 3, 'cloud forest: dense vegetation'); assert.ok(BIOMES.cloud_forest.look.fog, 'with mist');
  assert.ok(kinds(fog).tree_fern > 0 && buildableShare(fog) >= .5, 'but with clearings to build in');
  const snow = withMap('snowy'), T = snow.map.terrain;
  assert.ok(kinds(snow).snow_conifer > 100 && kinds(snow).rock > 0); assert.ok(share(T, '2') > 0, 'frozen ground'); assert.ok([...T.cells.temperature].every(t => +t <= 3), 'cold');
  const beach = withMap('beach'), B = beach.map.terrain;
  assert.ok(share(B, '1') > .15 && share(B, '1') < .5, 'beach: sea along one side'); assert.ok(kinds(beach).palm > 20, 'palms');
  assert.ok(kinds(temperate).broadleaf > 100 && kinds(temperate).conifer > 50);
  const autumn = withMap('autumn_valley'), A = autumn.map.terrain;
  assert.ok(share(A, '1') > .01, 'a river'); assert.ok(Math.max(...A.heights) / 1000 > 2, 'the valley sides rise'); assert.ok(kinds(autumn).autumn > 100, 'autumn leaves');
  const wet = withMap('wetland'); assert.ok(share(wet.map.terrain, '1') > .1 && kinds(wet).reeds > 20, 'ponds and reeds'); assert.ok(buildableShare(wet) < .8, 'limited building');
  const med = withMap('mediterranean'); assert.ok([...med.map.terrain.cells.moisture].filter(m => +m <= 3).length > med.map.terrain.cells.moisture.length / 2, 'dry'); assert.ok(kinds(med).cypress > 0 && kinds(med).olive > 0);
  const mixed = withMap('mixed'); assert.ok(new Set(mixed.map.terrain.cells.biome).size >= 3, 'a mixed map has several regions');
  assert.deepEqual([...new Set(cellsOf(mixed, () => true).map(p => biomeAt(mixed, p.x, p.z)))].every(b => BIOME_IDS.includes(b)), true);
});

test('height is continuous between vertices and buildings and roads follow the terrain rules', () => {
  const s = withMap('autumn_valley', 3), T = s.map.terrain;
  const i = 10, j = 12, x = T.origin + i, z = T.origin + j;
  assert.equal(heightAt(s, x, z), T.heights[j * T.n + i] / 1000);
  const mid = heightAt(s, x + .5, z), a = T.heights[j * T.n + i] / 1000, b = T.heights[j * T.n + i + 1] / 1000;
  assert.ok(Math.abs(mid - (a + b) / 2) < 1e-9, 'bilinear');
  const water = cellsOf(s, (px, pz) => groundAt(s, px, pz) === 'water' && Math.max(Math.abs(px), Math.abs(pz)) < 10)[0];
  assert.ok(water, 'the river'); assert.equal(canPlace(s, 'fr_trad', water, 0), 'water');
  const steep = cellsOf(s, (px, pz) => Math.max(Math.abs(px), Math.abs(pz)) < 12 && canPlace(s, 'fr_trad', { x: px, z: pz }, 0) === 'slope')[0];
  assert.ok(steep, 'the valley sides are too steep to build on in places');
  const lo = Math.min(...[[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]].map(([dx, dz]) => heightAt(s, steep.x + dx, steep.z + dz))), hi = Math.max(...[[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]].map(([dx, dz]) => heightAt(s, steep.x + dx, steep.z + dz)));
  assert.ok(hi - lo > .3, 'because the ground under it really rises');
  const snow = withMap('snowy', 11), rock = cellsOf(snow, (px, pz) => groundAt(snow, px, pz) === 'rock')[0];
  assert.ok(rock); assert.equal(canPlace(snow, 'fr_trad', rock, 0), 'rock');
  // roads: never through water, never too steep
  assert.equal(planRoad(s, { points: [{ x: water.x - 3, z: water.z }, { x: water.x + 3, z: water.z }], style: 'road' }).reason !== undefined, true);
  const across = planRoad(s, { points: [{ x: water.x, z: water.z - 4 }, { x: water.x, z: water.z + 4 }], style: 'road' });
  assert.ok(['water', 'slope', 'rock'].includes(across.reason), `a road across the river is refused (${across.reason})`);
  // a controlled ramp: plains ground rising 0.5 per unit between x = 2 and x = 6
  const ramp = withMap('plains', 1), R = ramp.map.terrain;
  for (let j = 0; j < R.n; j++) for (let i = 0; i < R.n; i++) { const x = R.origin + i; R.heights[j * R.n + i] = Math.round(Math.max(0, Math.min(4, x - 2)) * 500); }
  assert.equal(planRoad(ramp, { points: [{ x: 1, z: -3 }, { x: 7, z: -3 }], style: 'road' }).reason, 'slope', 'straight up the ramp is too steep');
  assert.ok(planRoad(ramp, { points: [{ x: 4, z: -6 }, { x: 4, z: 4 }], style: 'road' }).ok, 'across the ramp it stays level');
  assert.equal(canPlace(ramp, 'fr_trad', { x: 4, z: 0 }, 0), 'slope'); assert.equal(canPlace(ramp, 'fr_trad', { x: -4, z: 0 }, 0), null);
});

test('decoration is scenery, not buildings, and never blocks building', () => {
  const g = createGame({ state: createNewGameState('sandbox', 'done', { preset: 'cloud_forest', seed: 5, size: 32 }) });
  const { state } = g.getSnapshot();
  assert.deepEqual(state.buildings, {}); assert.ok(terrainDecor(state).length > 500);
  const tree = terrainDecor(state).find(d => d.kind === 'broadleaf' && !groundAt(state, d.x, d.z) && canPlace(state, 'tree', { x: d.x, z: d.z }, 0) === null);
  assert.ok(tree, 'a building may stand where a wild tree grows (the renderer hides it)');
  assert.ok(!JSON.stringify(serializeGame(state)).includes('broadleaf'), 'not saved');
});

test('generated maps round-trip through saves; older saves stand on the classic meadow', () => {
  const g = createGame({ state: createNewGameState('normal', 'explore', { preset: 'beach', seed: 77, size: 40 }) });
  for (let i = 0; i < 20; i++) g.tick();
  const doc = JSON.parse(JSON.stringify(createSaveDocument(g.getSnapshot().state)));
  assert.equal(doc.game.map.biomePreset, 'beach'); assert.equal(doc.game.map.generatorVersion, GENERATOR_VERSION); assert.equal(doc.game.map.terrain.heights.length, 49 * 49);
  const { state, warnings } = loadSave(doc); assert.deepEqual(warnings, []);
  assert.deepEqual(state.map, g.getSnapshot().state.map); assert.deepEqual(serializeGame(state), serializeGame(g.getSnapshot().state));
  // a v7 document (before maps) loads on the classic map
  const v7 = { ...doc, v: 7, game: { ...doc.game } }; delete v7.game.map;
  const old = loadSave(v7).state; assert.equal(old.map.biomePreset, 'classic'); assert.equal(old.map.terrain, null); assert.equal(old.map.size, 24); assert.equal(heightAt(old, 3, 4), 0);
  // damaged terrain is regenerated from its seed; an unknown preset falls back with a warning
  const warn = [], fixed = normalizeMap({ ...doc.game.map, terrain: { n: 3 } }, w => warn.push(w));
  assert.deepEqual(fixed.terrain, g.getSnapshot().state.map.terrain); assert.equal(warn.length, 1);
  assert.equal(normalizeMap({ biomePreset: 'lava', size: 32, seed: 1 }, w => warn.push(w)).biomePreset, 'classic'); assert.equal(warn.length, 2);
});

test('a new generated map is safe empty and plays from the café', () => {
  for (const preset of ['beach', 'snowy', 'mixed']) {
    const g = createGame({ state: createNewGameState('normal', 'explore', { preset, seed: 21, size: 24 }) });
    for (let i = 0; i < 30; i++) g.tick();
    assert.ok(!/NaN|Infinity/.test(JSON.stringify(computeDerived(g.getSnapshot().state).city)));
    assert.ok(g.dispatch({ type: CMD.Place, buildingType: 'cafe', position: { x: 0, z: 0 }, rotation: 0 }).ok, preset);
    const r = g.dispatch({ type: CMD.BuildRoad, points: [{ x: -1.6, z: 1.6 }, { x: 2.5, z: 1.6 }], style: 'road' });
    assert.ok(r.ok, `${preset}: ${r.reason}`);
  }
});
