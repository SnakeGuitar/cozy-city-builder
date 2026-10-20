// Camera state (pure) and the Three.js rig: limits, persistence, and that picking matches drawing in both projections.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cam from '../src/presentation/camera/model.js';
import { createCameraController } from '../src/presentation/camera/controller.js';
import { createCameraRig } from '../src/rendering/three/cameraRig.js';
import { tileCenter, tileFromWorld } from '../src/rendering/three/coords.js';
import { CMD } from '../src/core/index.js';
import { createGame, newGameState } from '../src/application/game.js';

const { CAMERA } = Cam;
test('limits: pitch, zoom and target stay in range; yaw turns freely', () => {
  let c = Cam.createCameraState();
  for (let i = 0; i < 100; i++) c = Cam.tilt(c, 1); assert.equal(c.pitch, CAMERA.pitchMax);
  for (let i = 0; i < 100; i++) c = Cam.tilt(c, -1); assert.equal(c.pitch, CAMERA.pitchMin);
  c = Cam.zoomBy(c, 1e6); assert.equal(c.zoom, CAMERA.zoomMax); c = Cam.zoomBy(c, 1e-6); assert.equal(c.zoom, CAMERA.zoomMin);
  for (let i = 0; i < 200; i++) c = Cam.panPixels(c, 5000, 3000, 800);
  assert.ok(Math.abs(c.target.x) <= CAMERA.bound && Math.abs(c.target.z) <= CAMERA.bound);
  let y = Cam.createCameraState(); for (let i = 0; i < 30; i++) y = Cam.rotateStep(y, 1);
  assert.ok(Math.abs(y.yaw - (CAMERA.yaw + 30 * CAMERA.stepYaw)) < 1e-9, 'continuous 360° orbit');
  const o = Cam.orbit(Cam.createCameraState(), 0, 99); assert.equal(o.pitch, CAMERA.pitchMax, 'never flips over the top');
});

test('perspective keeps the camera above the ground at every allowed pitch and zoom', () => {
  for (const z of [CAMERA.zoomMin, 1, CAMERA.zoomMax]) {
    const c = Cam.clampCamera({ ...Cam.createCameraState('persp'), zoom: z, pitch: 0 });
    assert.ok(Math.sin(c.pitch) * c.distance > .5, `zoom ${z}`);
  }
});

test('serialize → JSON → deserialize restores the camera; bad data falls back', () => {
  let c = Cam.toggleMode(Cam.orbit(Cam.panPixels(Cam.createCameraState(), 120, -40, 700), 7.5, .2));
  const back = Cam.deserializeCamera(JSON.parse(JSON.stringify(Cam.serializeCamera(c))));
  assert.equal(back.mode, 'persp'); assert.ok(Math.abs(back.target.x - c.target.x) < 1e-12);
  assert.ok(Math.abs(Math.cos(back.yaw) - Math.cos(c.yaw)) < 1e-12 && back.yaw >= 0 && back.yaw < Math.PI * 2, 'yaw normalised');
  assert.equal(Cam.deserializeCamera({ target: { x: 'a' } }), null); assert.equal(Cam.deserializeCamera(null), null);
  const legacy = Cam.deserializeCamera([-3, 4.5, .785, 2.1]); assert.equal(legacy.mode, 'iso'); assert.equal(legacy.zoom, 2.1);
  const ctl = createCameraController(); ctl.restore(Cam.serializeCamera(c)); assert.deepEqual(ctl.serialize(), Cam.serializeCamera(back));
  ctl.restore({ garbage: true }); assert.deepEqual(ctl.desired, Cam.createCameraState('iso'));
});

test('desired vs visual: smoothing eases, reduced motion snaps; mode changes blend', () => {
  const d = Cam.toggleMode(Cam.createCameraState());
  let v = Cam.visualFrom(Cam.createCameraState());
  v = Cam.interpolate(v, d, 1 / 60, true); assert.ok(v.blend > 0 && v.blend < 1, 'iso → perspective is a transition');
  for (let i = 0; i < 300; i++) v = Cam.interpolate(v, d, 1 / 60, true); assert.equal(v.blend, 1);
  const snap = Cam.interpolate(Cam.visualFrom(Cam.createCameraState()), d, 1 / 60, false); assert.equal(snap.blend, 1); assert.equal(snap.pitch, d.pitch);
  const ctl = createCameraController({ smooth: false }); ctl.toggleMode(); assert.equal(ctl.update(.016).blend, 1);
  let moved = 0; const c2 = createCameraController({ onMoved: () => moved++ }); c2.pan(10, 0, 600); c2.focus(1, 1); assert.equal(moved, 1, 'focus is not a player move');
});

// ---- picking: a screen point over a tile must hit that tile, in both projections
function rigFor(state, blend) { const r = createCameraRig(); r.setSize(1280, 720); r.apply({ ...Cam.visualFrom(state), blend }); return r; }
const views = [];
for (const yaw of [0, .7, 2.2, 4]) for (const pitch of [.3, .62, 1.2]) for (const zoom of [.8, 2]) views.push({ yaw, pitch, zoom });
for (const [name, mode, blend] of [['orthographic', 'iso', 0], ['perspective', 'persp', 1], ['mid-transition', 'persp', .5]]) {
  test(`${name}: raycasting returns the tile under the cursor`, () => {
    for (const v of views) {
      const st = Cam.clampCamera({ ...Cam.createCameraState(mode), ...v, target: { x: 1.5, z: -2 } });
      const rig = rigFor(st, blend);
      for (const [x, y] of [[13, 10], [10, 14], [12, 12]]) {
        const [sx, sy] = rig.project(tileCenter(x, y));
        const hit = rig.groundAt(sx, sy); assert.ok(hit, `${name} ${JSON.stringify(v)} misses`);
        assert.deepEqual(tileFromWorld(hit), { x, y }, `${name} ${JSON.stringify(v)} tile ${x},${y}`);
      }
    }
  });
  test(`${name}: clicking a tile places the building on that tile`, () => {
    const st = Cam.clampCamera({ ...Cam.createCameraState(mode), yaw: 2.4, pitch: .5, zoom: 1.4 });
    const rig = rigFor(st, blend), g = createGame({ state: newGameState('normal') });
    const [sx, sy] = rig.project(tileCenter(11, 11, 2)); // a 2×2 footprint is aimed at its centre
    const tile = tileFromWorld(rig.groundAt(sx, sy), 2);
    assert.deepEqual(tile, { x: 11, y: 11 });
    assert.ok(g.dispatch({ type: CMD.Place, buildingType: 'cafe', ...tile }).ok);
    assert.equal(g.getSnapshot().state.grid[11 * 24 + 11], g.getSnapshot().state.grid[12 * 24 + 12]);
  });
}
