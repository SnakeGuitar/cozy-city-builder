// The Three.js view: a facade over scene, terrain, camera rig, building views, roads, ambient life and overlays.
// It reacts to core events and snapshots and draws the camera state it is given; it never changes game state.
import * as THREE from 'three';
import { DEFS } from '../../core/config/catalog.js';
import { buildingAtPoint, mapHalf, footprintObb } from '../../core/domain/space.js';
import { obbCorners } from '../../core/domain/geometry.js';
import { heightAt } from '../../core/domain/terrain.js';
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
export { renderThumbnails } from './thumbnails.js';

export function createThreeView(container) {
  const sc = createScene(container);
  const rig = createCameraRig();
  let current = null; // the state last drawn: terrain heights come from it
  const ground = (x, z) => (current ? heightAt(current, x, z) : 0);
  /** Height a building stands at: its footprint's highest ground point (a plinth fills the rest on slopes). */
  const baseOf = b => { if (!current?.map?.terrain) return { base: 0, low: 0 }; const pts = [b.position, ...obbCorners(footprintObb(b.type, b.position, b.rotation))].map(p => ground(p.x, p.z)); return { base: Math.max(...pts), low: Math.min(...pts) }; };
  const terrain = createTerrainView(sc);
  const ambient = createAmbient(sc.scene, rig.target, ground);
  const buildings = createBuildingViews(sc.scene, ambient, baseOf);
  const roads = createRoadView(sc.scene);
  const overlays = createOverlays(sc.scene, ground);
  let night = 0;

  return {
    canvas: sc.renderer.domElement, overlays, ambient, variantOf, rig,
    get night() { return night; },
    resize(w, h) { sc.resize(w, h); rig.setSize(w, h); },
    /** Rebuild everything from a snapshot (start, new game, load). */
    rebuild(state, opts) {
      current = state; terrain.rebuild(state); overlays.setMap(state);
      buildings.rebuildAll(state, opts); roads.rebuild(state, ground); overlays.refreshOccupancy(state); ambient.setWeather(terrain.weather);
    },
    /** React to core events (plain data). */
    applyEvents(events, state) {
      current = state;
      let roadsDirty = false, gridDirty = false;
      for (const e of events) {
        if (e.type === 'building_placed') { gridDirty = true; buildings.add(state.buildings[e.id]); }
        else if (e.type === 'building_removed') { gridDirty = true; buildings.remove(e.id, true); }
        else if (e.type === 'road_built' || e.type === 'road_removed' || e.type === 'road_edited' || e.type === 'roads_replaced') { roadsDirty = true; if (e.type === 'road_removed') overlays.roadHighlight(null, null); }
        else if (e.type === 'building_moved' || e.type === 'building_rotated') { gridDirty = true; const b = state.buildings[e.id]; if (b) buildings.replace(b, { animate: e.type === 'building_moved' }); }
        else if (e.type === 'building_upgraded') { const b = state.buildings[e.id]; if (b) buildings.upgrade(b); }
        else if (e.type === 'goal_completed') ambient.confetti();
        else if (e.type === 'state_replaced') this.rebuild(state, { animate: true });
      }
      if (roadsDirty) roads.rebuild(state, ground);
      if (gridDirty) overlays.refreshOccupancy(state);
      if (roadsDirty || gridDirty) terrain.refresh(state);
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
