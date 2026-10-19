// Mapping between logical tiles (core) and world space (Three.js). One tile = one world unit.
import * as THREE from 'three';
import { GRID_SIZE } from '../../core/config/world.js';
import { DEFS } from '../../core/config/catalog.js';

export const HALF = GRID_SIZE / 2;
export const tileCenter = (x, y, s = 1) => new THREE.Vector3(x - HALF + s / 2, 0, y - HALF + s / 2);
export const buildingCenter = b => tileCenter(b.x, b.y, DEFS[b.type].s);
/** World point just above a building, for labels and relation lines. */
export const buildingTop = (b, lift = 0) => buildingCenter(b).setY((DEFS[b.type].s > 1 ? 1.4 : 1.25) + lift);
