// The Three.js view: a facade over scene, camera rig, building views, roads, ambient life and overlays.
// It reacts to core events and snapshots and draws the camera state it is given; it never changes game state.
import { DEFS, isRoadType } from '../../core/config/catalog.js';
import { GRID_SIZE } from '../../core/config/world.js';
import { windowMat, lampMat } from './art.js';
import { createScene, applyDayLight } from './scene.js';
import { createCameraRig } from './cameraRig.js';
import { createBuildingViews, glowMat } from './buildings.js';
import { createRoadView } from './roads.js';
import { createAmbient } from './ambient.js';
import { createOverlays } from './overlays.js';
import { buildingTop, buildingCenter, tileFromWorld } from './coords.js';
import { variantOf } from './models/index.js';
export { renderThumbnails } from './thumbnails.js';


export function createThreeView(container) {
  const sc = createScene(container);
  const rig = createCameraRig();
  const ambient = createAmbient(sc.scene, rig.target);
  const buildings = createBuildingViews(sc.scene, ambient);
  const roads = createRoadView(sc.scene);
  const overlays = createOverlays(sc.scene);
  let night = 0;

  return {
    canvas: sc.renderer.domElement, overlays, ambient, variantOf, rig,
    get night() { return night; },
    resize(w, h) { sc.resize(w, h); rig.setSize(w, h); },
    /** Rebuild everything from a snapshot (start, new game, load). */
    rebuild(state, opts) { buildings.rebuildAll(state, opts); roads.rebuild(state); overlays.refreshOccupancy(state.grid); },
    /** React to core events (plain data). */
    applyEvents(events, state) {
      let roadsDirty = false, gridDirty = false;
      for (const e of events) {
        if (e.type === 'building_placed') { gridDirty = true; if (isRoadType(e.buildingType)) roadsDirty = true; else buildings.add(state.buildings[e.id]); }
        else if (e.type === 'building_removed') { gridDirty = true; if (isRoadType(e.buildingType)) roadsDirty = true; else buildings.remove(e.id, true); }
        else if (e.type === 'building_moved' || e.type === 'building_rotated') { gridDirty = true; const b = state.buildings[e.id]; if (b) buildings.replace(b, { animate: e.type === 'building_moved' }); }
        else if (e.type === 'building_upgraded') { const b = state.buildings[e.id]; if (b) buildings.upgrade(b); }
        else if (e.type === 'goal_completed') ambient.confetti();
        else if (e.type === 'state_replaced') this.rebuild(state, { animate: true });
      }
      if (roadsDirty) roads.rebuild(state);
      if (gridDirty) overlays.refreshOccupancy(state.grid);
    },
    /** One frame: camera from its visual state, time-of-day light, animations, render. Returns { night, tint, tintOpacity }. */
    frame(rdt, sdt, clock, state, derived, cameraVisual) {
      const camera = rig.apply(cameraVisual);
      const light = applyDayLight(sc, state.clock.time, { window: windowMat, lamp: lampMat, glow: glowMat }, rig.target);
      night = light.night;
      ambient.update(rdt, sdt, clock, state.population, derived.roads);
      buildings.update(rdt, clock);
      for (const d of sc.decoTrees) for (const c of d.children) if (c.userData.sub === 'sway') c.rotation.z = Math.sin(clock * 1.1 + d.position.x) * .03;
      sc.render(camera);
      return light;
    },
    // ---- picking and projection (work with either projection)
    tileAt(cx, cy, s = 1) { const p = rig.groundAt(cx, cy); return p ? tileFromWorld(p, s) : null; },
    pickBuilding(cx, cy, state) {
      const id = buildings.pick(rig.raycaster(cx, cy)); if (id && state.buildings[id]) return id;
      const t = this.tileAt(cx, cy); if (!t || t.x < 0 || t.y < 0 || t.x >= GRID_SIZE || t.y >= GRID_SIZE) return 0;
      return state.grid[t.y * GRID_SIZE + t.x] || 0;
    },
    project: v => rig.project(v),
    topOf: (b, lift) => buildingTop(b, lift),
    centerOf: b => { const c = buildingCenter(b); return { x: c.x, z: c.z }; },
    selectBuilding: id => buildings.select(id),
    setBuildingHidden: (id, h) => buildings.setHidden(id, h),
    sizeOf: type => DEFS[type].s,
  };
}
