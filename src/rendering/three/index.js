// The Three.js view: a facade over scene, terrain, camera rig, building views, roads, ambient life and overlays.
// It reacts to core events and snapshots and draws the camera state it is given; it never changes game state.
import * as THREE from 'three';
import { DEFS } from '../../core/config/catalog.js';
import { buildingAtPoint, mapHalf, footprintObb } from '../../core/domain/space.js';
import { obbCorners } from '../../core/domain/geometry.js';
import { heightAt } from '../../core/domain/terrain.js';
import { getBlueprint } from '../../core/domain/blueprint.js';
import { blueprintProto } from './blueprintModel.js';
import { windowMat, lampMat } from './art.js';
import { createScene, applyDayLight } from './scene.js';
import { createCameraRig } from './cameraRig.js';
import { createBuildingViews, glowMat } from './buildings.js';
import { createRoadView } from './roads.js';
import { createAmbient } from './ambient.js';
import { createOverlays } from './overlays.js';
import { createTerrainView } from './terrain.js';
import { buildingTop, buildingCenter, tileFromWorld } from './coords.js';
import { variantOf } from './models/index.js';
import { planViewUpdates } from '../../presentation/viewUpdates.js';
export { renderThumbnails } from './thumbnails.js';

/** `time(name, fn)` measures named pieces of work (rebuilds) for the performance overlay; optional. */
export function createThreeView(container, { time = (name, fn) => fn() } = {}) {
  const sc = createScene(container);
  const rig = createCameraRig();
  let current = null; // the state last drawn: terrain heights come from it
  const ground = (x, z) => (current ? heightAt(current, x, z) : 0);
  /** Height a building stands at: its footprint's highest ground point (a plinth fills the rest on slopes). */
  const baseOf = b => { if (!current?.map?.terrain) return { base: 0, low: 0 }; const pts = [b.position, ...obbCorners(footprintObb(b.type, b.position, b.rotation))].map(p => ground(p.x, p.z)); return { base: Math.max(...pts), low: Math.min(...pts) }; };
  const terrain = createTerrainView(sc);
  const ambient = createAmbient(sc.scene, rig.target, ground);
  // a custom building is drawn from the exact blueprint version it was built from (a missing one: its base type)
  const modelOf = b => { const bp = b.blueprint && current && getBlueprint(current, b.blueprint); return bp ? blueprintProto(bp) : null; };
  const buildings = createBuildingViews(sc.scene, ambient, baseOf, modelOf);
  const roads = createRoadView(sc.scene);
  const overlays = createOverlays(sc.scene, ground);
  let night = 0;

  return {
    canvas: sc.renderer.domElement, overlays, ambient, variantOf, rig,
    /** The Three.js scene, for diagnostics only (perf breakdowns); nothing outside rendering edits it. */
    scene: sc.scene,
    get night() { return night; },
    resize(w, h) { sc.resize(w, h); rig.setSize(w, h); },
    /** Finishes building animations now and re-merges every chunk (benchmarks, reduced motion). */
    settleAnimations() { buildings.settleAnimations(); },
    buildingStats: () => buildings.stats,
    /** Road pieces cached and chunks merged by the last road update (how incremental it was). */
    roadStats: () => roads.stats,
    /** Renderer counters for the last frame (draw calls, triangles) and live GPU resources. */
    info() { const i = sc.renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures }; },
    /** Rebuild everything from a snapshot (start, new game, load). */
    rebuild(state, opts) {
      current = state; time('rebuild.terrain', () => terrain.rebuild(state)); overlays.setMap(state);
      time('rebuild.buildings', () => buildings.rebuildAll(state, opts)); time('rebuild.roads', () => roads.rebuild(state, ground)); overlays.refreshOccupancy(state); ambient.setWeather(terrain.weather);
    },
    /** React to core events (plain data). */
    applyEvents(events, state) {
      current = state;
      const plan = planViewUpdates(events, state);
      for (let i = 0; i < plan.confetti; i++) ambient.confetti();
      if (plan.rebuild) { this.rebuild(state, { animate: true }); return; }
      for (const { op, id, animate } of plan.ops) {
        const b = state.buildings[id];
        if (op === 'add') buildings.add(b); else if (op === 'remove') buildings.remove(id, true);
        else if (op === 'replace') buildings.replace(b, { animate }); else if (op === 'upgrade') buildings.upgrade(b);
      }
      if (plan.clearRoadHighlight) overlays.roadHighlight(null, null);
      if (plan.roads) time('rebuild.roads', () => roads.rebuild(state, ground));
      if (plan.occupancy) time('rebuild.occupancy', () => overlays.refreshOccupancy(state));
      if (plan.roads || plan.occupancy) time('rebuild.scenery', () => terrain.refresh(state));
    },
    /** One frame: camera from its visual state, time-of-day light, animations, render. Returns { night, tint, tintOpacity }. */
    frame(rdt, sdt, clock, state, derived, cameraVisual) {
      current = state;
      const camera = rig.apply(cameraVisual);
      const light = applyDayLight(sc, state.clock.time, { window: windowMat, lamp: lampMat, glow: glowMat }, rig.target);
      terrain.frame(state, camera, rig.target, clock);
      night = light.night;
      ambient.update(rdt, sdt, clock, state.population, derived.roads, state);
      buildings.update(rdt, clock);
      for (const d of sc.decoTrees) for (const c of d.children) if (c.userData.sub === 'sway') c.rotation.z = Math.sin(clock * 1.1 + d.position.x) * .03;
      sc.render(camera);
      return light;
    },
    // ---- picking and projection (work with either projection, over flat or hilly ground)
    /** Ground point under a screen position: the ray meets the terrain (refined from the y = 0 plane), or null. */
    groundPoint(cx, cy) {
      const p = rig.groundAt(cx, cy); if (!p || !current?.map?.terrain) return p;
      const r = rig.raycaster(cx, cy).ray, plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
      for (let i = 0; i < 6; i++) { plane.constant = -ground(p.x, p.z); if (!r.intersectPlane(plane, hit)) break; p.copy(hit); }
      return p;
    },
    tileAt(cx, cy, s = 1) { const p = this.groundPoint(cx, cy); return p ? tileFromWorld(p, s, current ? mapHalf(current) : undefined) : null; },
    /** Ground point { x, z } under a screen position, or null. */
    groundAt(cx, cy) { const p = this.groundPoint(cx, cy); return p ? { x: p.x, z: p.z } : null; },
    pickBuilding(cx, cy, state) {
      const id = buildings.pick(rig.raycaster(cx, cy)); if (id && state.buildings[id]) return id;
      const p = this.groundPoint(cx, cy); if (!p) return 0;
      return buildingAtPoint(state, p.x, p.z)?.id || 0;
    },
    project: v => rig.project(v),
    /** World point above a building (labels, relation lines), standing on its ground. */
    topOf: (b, lift) => { const t = buildingTop(b, lift); t.y += b.id !== undefined && current?.buildings[b.id] ? baseOf(b).base : ground(b.position.x, b.position.z); return t; },
    groundHeight: ground,
    centerOf: b => { const c = buildingCenter(b); return { x: c.x, z: c.z }; },
    selectBuilding: id => buildings.select(id),
    setBuildingHidden: (id, h) => buildings.setHidden(id, h),
    sizeOf: type => DEFS[type].s,
  };
}
