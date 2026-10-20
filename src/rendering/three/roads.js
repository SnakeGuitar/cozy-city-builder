// Tile roads: each road tile is a junction pad plus short arms toward neighbouring road tiles, drawn in its
// street look (rendering/three/roadMesh.js). The classic look at width 1 reproduces the original slabs and curbs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { edgeMat } from './art.js';
import { DEFS, isRoadType } from '../../core/config/catalog.js';
import { roadAt } from '../../core/domain/space.js';
import { createRoadBatch, addPad, addRibbon, finishBatch } from './roadMesh.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** On a tile, a street is at most one tile wide. */
export const tileWidth = type => Math.min(1, DEFS[type].road.width);

/** Adds the pieces of one road tile of `type` centred at `c`; `isRoad(x, z)` says whether a neighbouring cell holds a road. */
export function addRoadTile(batch, type, c, isRoad) {
  const w = tileWidth(type), look = DEFS[type].road.look, dirs = [], x = Math.round(c.x * 2), y = Math.round(c.z * 2);
  for (const [dx, dy] of DIRS) if (isRoad(c.x + dx, c.z + dy)) dirs.push({ x: dx, z: dy });
  addPad(batch, { x: c.x, y: 0, z: c.z }, w, look, dirs);
  for (const d of dirs) if (w < 1) addRibbon(batch, [{ x: c.x + d.x * w / 2, y: 0, z: c.z + d.z * w / 2 }, { x: c.x + d.x * .5, y: 0, z: c.z + d.z * .5 }], w, look, { decoSeed: x * 31 + y * 17 });
}

export function createRoadView(scene) {
  let group = null;
  return {
    rebuild(state) {
      if (group) { scene.remove(group); group.traverse(o => o.geometry && o.geometry.dispose()); }
      const batch = createRoadBatch(), road = (x, z) => roadAt(state, x, z);
      for (const b of Object.values(state.buildings)) if (isRoadType(b.type)) addRoadTile(batch, b.type, b.position, road);
      group = finishBatch(batch, mergeGeometries, edgeMat);
      scene.add(group);
    },
  };
}

/** A short straight piece of a street look centred on the origin (catalogue thumbnails, build ghosts). */
export function roadPreview(type, length = 2) {
  const batch = createRoadBatch(), w = tileWidth(type), look = DEFS[type].road.look;
  addRibbon(batch, [{ x: 0, y: 0, z: -length / 2 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: length / 2 }], w, look, { decoSeed: 1 });
  return finishBatch(batch, mergeGeometries, edgeMat);
}
