// The road network drawn from the core's graph (state.roads). Segments that continue through a plain two-way node
// (same style and width) are merged into one chain, so curves and bends are a single ribbon with mitred joints.
// Junctions, dead-end cells of the grid tool and lone cells get a pad below the ribbons; the chains stop at the pad's
// edge so their curbs never cross a side street. Free road ends without a pad get an end curb.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { edgeMat } from './art.js';
import { DEFS } from '../../core/config/catalog.js';
import { roadLayout } from '../../presentation/roadLayout.js';
import { createRoadBatch, addPad, addRibbon, finishBatch } from './roadMesh.js';

const lookOf = style => DEFS[style]?.road?.look || 'classic';

/** Adds the whole network to a batch (layout from presentation/roadLayout.js). `heightAt(x, z)` drapes it on the ground. */
export function addNetwork(batch, state, heightAt = () => 0) {
  const { ribbons, pads } = roadLayout(state);
  for (const rb of ribbons) addRibbon(batch, rb.points.map(p => ({ x: p.x, y: heightAt(p.x, p.z), z: p.z })), rb.width, lookOf(rb.style), { closedStart: rb.closedStart, closedEnd: rb.closedEnd, decoSeed: rb.segmentIds[0] * 7 });
  for (const p of pads) addPad(batch, { x: p.center.x, y: heightAt(p.center.x, p.center.z) - .002, z: p.center.z }, p.width, lookOf(p.style), p.exits);
  return batch;
}

export function createRoadView(scene) {
  let group = null;
  return {
    rebuild(state, heightAt) {
      if (group) { scene.remove(group); group.traverse(o => o.geometry && o.geometry.dispose()); }
      group = finishBatch(addNetwork(createRoadBatch(), state, heightAt), mergeGeometries, edgeMat);
      scene.add(group);
    },
  };
}

/** A short straight piece of a street look centred on the origin (catalogue thumbnails, build ghosts). */
export function roadPreview(type, length = 2) {
  const batch = createRoadBatch(), w = Math.min(1.5, DEFS[type].road.width), look = DEFS[type].road.look;
  addRibbon(batch, [{ x: 0, y: 0, z: -length / 2 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: length / 2 }], w, look, { decoSeed: 1 });
  return finishBatch(batch, mergeGeometries, edgeMat);
}
/** A planned road (preview while drawing): the ribbon along the planned centre line, tinted by validity. */
export function roadPlanPreview(plan, heightAt = () => 0) {
  const batch = createRoadBatch();
  if (plan.polyline && plan.polyline.length > 1) addRibbon(batch, plan.polyline.map(p => ({ x: p.x, y: heightAt(p.x, p.z) + .01, z: p.z })), plan.width, lookOf(plan.style), { closedStart: plan.start?.kind === 'free', closedEnd: plan.end?.kind === 'free' });
  return finishBatch(batch, mergeGeometries, edgeMat);
}
