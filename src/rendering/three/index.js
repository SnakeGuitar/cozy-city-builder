// The Three.js view: a facade over scene, building views, roads, ambient life and overlays.
// It reacts to core events and snapshots; it never changes game state.
import * as THREE from 'three';
import { DEFS } from '../../core/config/catalog.js';
import { windowMat, lampMat } from './art.js';
import { createScene, applyDayLight } from './scene.js';
import { createBuildingViews, glowMat } from './buildings.js';
import { createRoadView } from './roads.js';
import { createAmbient } from './ambient.js';
import { createOverlays } from './overlays.js';
import { HALF, buildingTop, buildingCenter } from './coords.js';
import { variantOf } from './models/index.js';
export { renderThumbnails } from './thumbnails.js';

export function createThreeView(container) {
  const sc = createScene(container);
  const ambient = createAmbient(sc.scene, sc.rig);
  const buildings = createBuildingViews(sc.scene, ambient);
  const roads = createRoadView(sc.scene);
  const overlays = createOverlays(sc.scene);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), _v = new THREE.Vector3();
  const setRay = (cx, cy) => { ndc.set(cx / sc.size.w * 2 - 1, -(cy / sc.size.h) * 2 + 1); ray.setFromCamera(ndc, sc.camera); };
  const groundAt = (cx, cy) => { setRay(cx, cy); return ray.ray.intersectPlane(plane, hit) ? hit.clone() : null; };
  let night = 0;

  return {
    canvas: sc.renderer.domElement, rig: sc.rig, overlays, ambient, variantOf,
    get night() { return night; },
    resize: (w, h) => sc.resize(w, h),
    /** Rebuild everything from a snapshot (start, new game, load). */
    rebuild(state, opts) { buildings.rebuildAll(state, opts); roads.rebuild(state); overlays.refreshOccupancy(state.grid); },
    /** React to core events (plain data). */
    applyEvents(events, state) {
      let roadsDirty = false, gridDirty = false;
      for (const e of events) {
        if (e.type === 'building_placed') { gridDirty = true; if (e.buildingType === 'road') roadsDirty = true; else buildings.add(state.buildings[e.id]); }
        else if (e.type === 'building_removed') { gridDirty = true; if (e.buildingType === 'road') roadsDirty = true; else buildings.remove(e.id, true); }
        else if (e.type === 'building_moved' || e.type === 'building_rotated') { gridDirty = true; const b = state.buildings[e.id]; if (b) buildings.replace(b, { animate: e.type === 'building_moved' }); }
        else if (e.type === 'goal_completed') ambient.confetti();
        else if (e.type === 'state_replaced') { this.rebuild(state, { animate: true }); }
      }
      if (roadsDirty) roads.rebuild(state);
      if (gridDirty) overlays.refreshOccupancy(state.grid);
    },
    /** One frame: camera, light for the time of day, animations, render. Returns { night, tint, tintOpacity }. */
    frame(rdt, sdt, clock, state, derived) {
      sc.updateCamera(rdt);
      const light = applyDayLight(sc, state.clock.time, { window: windowMat, lamp: lampMat, glow: glowMat });
      night = light.night;
      ambient.update(rdt, sdt, clock, state.population, derived.roads);
      buildings.update(rdt, clock);
      for (const d of sc.decoTrees) for (const c of d.children) if (c.userData.sub === 'sway') c.rotation.z = Math.sin(clock * 1.1 + d.position.x) * .03;
      sc.render();
      return light;
    },
    // ---- camera
    pan(dxPx, dyPx) {
      const r = sc.rig, wpp = (15 / r.zoom) / sc.size.h, rx = Math.cos(r.yaw), rz = -Math.sin(r.yaw), fx = -Math.sin(r.yaw), fz = -Math.cos(r.yaw), fs = 1 / Math.sin(r.pitch);
      r.tt.x -= (dxPx * rx - dyPx * fx * fs) * wpp; r.tt.z -= (dxPx * rz - dyPx * fz * fs) * wpp; sc.clampTarget(); r.target.copy(r.tt);
    },
    panKeys(px, pz, rdt) { const r = sc.rig, pan = 8 / r.zoom * rdt, c = Math.cos(r.yaw), s = Math.sin(r.yaw); r.tt.x += (px * c + pz * s) * pan; r.tt.z += (-px * s + pz * c) * pan; sc.clampTarget(); },
    zoomBy(factor) { sc.rig.tzoom = Math.max(.55, Math.min(3.2, sc.rig.tzoom * factor)); },
    setZoom(z) { sc.rig.tzoom = Math.max(.55, Math.min(3.2, z)); },
    tilt(dir) { sc.rig.tpitch = Math.max(.5, Math.min(.85, sc.rig.tpitch + dir * .04)); },
    rotate(dir) { sc.rig.tyaw += dir * Math.PI / 2; },
    focusBuilding(b) { sc.rig.tt.copy(buildingCenter(b)); },
    getCamera() { const r = sc.rig; return [r.tt.x, r.tt.z, r.tyaw, r.tzoom]; },
    setCamera(c) { const r = sc.rig; if (!Array.isArray(c) || c.length < 4 || !c.every(Number.isFinite)) return; r.tt.set(c[0], 0, c[1]); r.tyaw = r.yaw = c[2]; r.tzoom = r.zoom = Math.max(.55, Math.min(3.2, c[3])); sc.clampTarget(); r.target.copy(r.tt); },
    // ---- picking and projection
    /** Tile under the cursor for a footprint of side s (the cursor sits at the footprint's centre). */
    tileAt(cx, cy, s = 1) { const p = groundAt(cx, cy); return p ? { x: Math.floor(p.x + HALF - (s - 1) / 2), y: Math.floor(p.z + HALF - (s - 1) / 2) } : null; },
    pickBuilding(cx, cy, state) {
      setRay(cx, cy); const id = buildings.pick(ray); if (id && state.buildings[id]) return id;
      const t = this.tileAt(cx, cy); if (!t || t.x < 0 || t.y < 0 || t.x >= 2 * HALF || t.y >= 2 * HALF) return 0;
      return state.grid[t.y * 2 * HALF + t.x] || 0;
    },
    project(v) { _v.copy(v).project(sc.camera); return [(_v.x + 1) / 2 * sc.size.w, (1 - _v.y) / 2 * sc.size.h]; },
    topOf: (b, lift) => buildingTop(b, lift),
    selectBuilding: id => buildings.select(id),
    setBuildingHidden: (id, h) => buildings.setHidden(id, h),
    sizeOf: type => DEFS[type].s,
  };
}
