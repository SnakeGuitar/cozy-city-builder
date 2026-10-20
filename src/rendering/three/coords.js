// Mapping between the core's ground coordinates and Three.js world space. They are the same plane:
// core position { x, z } → THREE (x, height, z); core rotation → rotation.y. One grid cell = one world unit.
import * as THREE from 'three';
import { GRID_SIZE } from '../../core/config/world.js';
import { DEFS } from '../../core/config/catalog.js';

export const HALF = GRID_SIZE / 2;
/** Centre of grid cell (x, y) (or of an s × s block starting there) on a 24-cell map. */
export const tileCenter = (x, y, s = 1) => new THREE.Vector3(x - HALF + s / 2, 0, y - HALF + s / 2);
export const buildingCenter = b => new THREE.Vector3(b.position.x, 0, b.position.z);
/** World point just above a building, for labels and relation lines. */
export const buildingTop = (b, lift = 0) => buildingCenter(b).setY((DEFS[b.type].s > 1 ? 1.4 : 1.25) + lift);
/** Tile under a world point for a footprint of side s (the cursor sits at the footprint's centre). */
export const tileFromWorld = (p, s = 1) => ({ x: Math.floor(p.x + HALF - (s - 1) / 2), y: Math.floor(p.z + HALF - (s - 1) / 2) });
