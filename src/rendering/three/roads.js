// The road network drawn from the core's graph (state.roads). Segments that continue through a plain two-way node
// (same style and width) are merged into one chain, so curves and bends are a single ribbon with mitred joints.
// Junctions, dead-end cells of the grid tool and lone cells get a pad below the ribbons; the chains stop at the pad's
// edge so their curbs never cross a side street. Free road ends without a pad get an end curb.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { edgeMat } from './art.js';
import { layered } from './texArrays.js';
import { DEFS } from '../../core/config/catalog.js';
import { roadPieces } from '../../presentation/roadLayout.js';
import { createRoadBatch, addPad, addRibbon, finishBatch, bakePiece, disposePiece, assemblePieces, disposeGroup } from './roadMesh.js';

const lookOf = style => DEFS[style]?.road?.look || 'classic';

const drawRibbon = (batch, rb, heightAt) => addRibbon(batch, rb.points.map(p => ({ x: p.x, y: heightAt(p.x, p.z), z: p.z })), rb.width, lookOf(rb.style), { closedStart: rb.closedStart, closedEnd: rb.closedEnd, decoSeed: rb.segmentIds[0] * 7 });
const drawPad = (batch, p, heightAt) => addPad(batch, { x: p.center.x, y: heightAt(p.center.x, p.center.z) - .002, z: p.center.z }, p.width, lookOf(p.style), p.exits);

/**
 * The drawn network, kept in step incrementally: pieces (presentation/roadLayout.js roadPieces) are baked once per
 * key and merged per 8-unit chunk; an edit rebakes only new pieces and re-merges only chunks whose pieces changed.
 * Plain surfaces and borders share texture arrays (texArrays.js): a chunk draws a few meshes whatever its looks.
 */
export function createRoadView(scene) {
  const root = new THREE.Group(), pieces = new Map(), chunks = new Map(); // key → baked piece; chunk → { sig, group }
  let ground = null; // the map the cached heights belong to
  const stats = { pieces: 0, built: 0, chunks: 0, merged: 0 };
  scene.add(root);
  const clear = () => {
    for (const p of pieces.values()) disposePiece(p); pieces.clear();
    for (const c of chunks.values()) { root.remove(c.group); disposeGroup(c.group); } chunks.clear();
  };
  return {
    stats,
    /** Brings the drawn network in line with `state`, rebuilding only what changed. */
    rebuild(state, heightAt) {
      if (ground !== state.map) { clear(); ground = state.map; }
      const want = new Map(); let built = 0, merged = 0;
      for (const p of roadPieces(state)) {
        if (!pieces.has(p.key)) { const b = createRoadBatch(); if (p.ribbon) drawRibbon(b, p.ribbon, heightAt); else drawPad(b, p.pad, heightAt); const piece = bakePiece(b, mergeGeometries); piece.byMat = layered(piece.byMat); pieces.set(p.key, piece); built++; }
        if (!want.has(p.chunk)) want.set(p.chunk, []);
        want.get(p.chunk).push(p.key);
      }
      for (const [id, c] of chunks) if (!want.has(id)) { root.remove(c.group); disposeGroup(c.group); chunks.delete(id); }
      for (const [id, keys] of want) {
        const sig = keys.sort().join('\n'), c = chunks.get(id);
        if (c?.sig === sig) continue;
        if (c) { root.remove(c.group); disposeGroup(c.group); }
        const group = assemblePieces(keys.map(k => pieces.get(k)), mergeGeometries, edgeMat);
        root.add(group); chunks.set(id, { sig, group }); merged++;
      }
      const live = new Set([...want.values()].flat());
      for (const [k, p] of pieces) if (!live.has(k)) { disposePiece(p); pieces.delete(k); }
      Object.assign(stats, { pieces: pieces.size, built, chunks: chunks.size, merged });
    },
    dispose() { clear(); scene.remove(root); },
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
