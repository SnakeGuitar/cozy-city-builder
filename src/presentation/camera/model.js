// Camera state and operations, engine-neutral and pure. A state is plain data:
//   { target: { x, z }, yaw, pitch, zoom, mode: 'iso' | 'persp', distance }
// `zoom` sets how much of the town is visible (view height 15 / zoom at the target in both modes);
// `distance` is derived: fixed for the isometric camera, VIEW_HEIGHT / (2·tan(fov/2)) / zoom in perspective.
// The renderer interpolates a *visual* state toward the *desired* one; only the desired state is saved.
import { GRID_SIZE } from '../../core/config/world.js';

const HALF = GRID_SIZE / 2;
export const CAMERA = Object.freeze({
  viewHeight: 15, isoDistance: 45, fov: 35 * Math.PI / 180,
  pitchMin: .2, pitchMax: 1.4,            // ≈ 11° … 80°: never under the ground, never flipped over the top
  zoomMin: .55, zoomMax: 3.2,
  bound: HALF + 2,                        // the point of interest stays over the map (plus a small margin)
  isoPitch: .62, perspPitch: .55, yaw: Math.PI / 4, zoom: 1.3,
  stepYaw: Math.PI / 12,                  // Q/E: 15° per press, eased
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const distanceFor = (mode, zoom) => mode === 'persp' ? CAMERA.viewHeight / (2 * Math.tan(CAMERA.fov / 2)) / zoom : CAMERA.isoDistance;

export function createCameraState(mode = 'iso') {
  return clampCamera({ target: { x: .5, z: .5 }, yaw: CAMERA.yaw, pitch: mode === 'persp' ? CAMERA.perspPitch : CAMERA.isoPitch, zoom: CAMERA.zoom, mode, distance: 0 });
}
export function clampCamera(c) {
  const zoom = clamp(c.zoom, CAMERA.zoomMin, CAMERA.zoomMax), mode = c.mode === 'persp' ? 'persp' : 'iso';
  return { target: { x: clamp(c.target.x, -CAMERA.bound, CAMERA.bound), z: clamp(c.target.z, -CAMERA.bound, CAMERA.bound) },
    yaw: c.yaw, pitch: clamp(c.pitch, CAMERA.pitchMin, CAMERA.pitchMax), zoom, mode, distance: distanceFor(mode, zoom) };
}
/** Drag by screen pixels: the ground under the cursor follows it (vertical drags are stretched by 1/sin(pitch)). */
export function panPixels(c, dx, dy, screenH) {
  const wpp = (CAMERA.viewHeight / c.zoom) / Math.max(1, screenH), fs = 1 / Math.sin(c.pitch);
  const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw), fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
  return clampCamera({ ...c, target: { x: c.target.x - (dx * rx - dy * fx * fs) * wpp, z: c.target.z - (dx * rz - dy * fz * fs) * wpp } });
}
/** Keyboard pan: px/pz in −1…1, relative to the view; speed scales with how far out we are. */
export function panKeys(c, px, pz, dt) {
  const s = 8 / c.zoom * dt, co = Math.cos(c.yaw), si = Math.sin(c.yaw);
  return clampCamera({ ...c, target: { x: c.target.x + (px * co + pz * si) * s, z: c.target.z + (-px * si + pz * co) * s } });
}
export const orbit = (c, dYaw, dPitch) => clampCamera({ ...c, yaw: c.yaw + dYaw, pitch: c.pitch + dPitch });
export const orbitPixels = (c, dx, dy) => orbit(c, -dx * .008, dy * .006);
export const zoomBy = (c, factor) => clampCamera({ ...c, zoom: c.zoom * factor });
export const tilt = (c, dir) => clampCamera({ ...c, pitch: c.pitch + dir * .05 });
export const rotateStep = (c, dir) => clampCamera({ ...c, yaw: c.yaw + dir * CAMERA.stepYaw });
export const focus = (c, x, z) => clampCamera({ ...c, target: { x, z } });
/** Back to the default framing, keeping the projection mode. */
export const resetCamera = c => createCameraState(c.mode);
/** Isometric ⇄ perspective. Perspective starts a little lower so the 3D reads better. */
export function toggleMode(c) {
  const mode = c.mode === 'iso' ? 'persp' : 'iso';
  return clampCamera({ ...c, mode, pitch: mode === 'persp' ? Math.min(c.pitch, CAMERA.perspPitch + .15) : c.pitch });
}

// ---------------------------------------------------------------- persistence
const TAU = Math.PI * 2;
const normYaw = y => ((y % TAU) + TAU) % TAU;
export const serializeCamera = c => ({ target: { x: c.target.x, z: c.target.z }, yaw: normYaw(c.yaw), pitch: c.pitch, zoom: c.zoom, mode: c.mode, distance: c.distance });
/** Untrusted data → a valid camera state, or null. Accepts the v1–v3 `[x, z, yaw, zoom]` array too. */
export function deserializeCamera(raw) {
  const ok = v => typeof v === 'number' && Number.isFinite(v);
  if (Array.isArray(raw)) return raw.length >= 4 && raw.every(ok) ? clampCamera({ ...createCameraState('iso'), target: { x: raw[0], z: raw[1] }, yaw: normYaw(raw[2]), zoom: raw[3] }) : null;
  if (!raw || typeof raw !== 'object' || !raw.target || !ok(raw.target.x) || !ok(raw.target.z) || !ok(raw.yaw) || !ok(raw.pitch) || !ok(raw.zoom)) return null;
  return clampCamera({ target: { x: raw.target.x, z: raw.target.z }, yaw: normYaw(raw.yaw), pitch: raw.pitch, zoom: raw.zoom, mode: raw.mode === 'persp' ? 'persp' : 'iso', distance: 0 });
}

// ---------------------------------------------------------------- visual interpolation
/** The visual state also carries `blend` (0 isometric … 1 perspective) for the projection transition. */
export const visualFrom = c => ({ ...c, target: { ...c.target }, blend: c.mode === 'persp' ? 1 : 0 });
/** Eases the visual state toward the desired one. smooth = false (reduced motion) snaps at once. Pure. */
export function interpolate(v, d, dt, smooth = true) {
  const k = smooth ? 1 - Math.exp(-dt * 9) : 1, L = (a, b) => a + (b - a) * k;
  const blend = L(v.blend, d.mode === 'persp' ? 1 : 0);
  return { target: { x: L(v.target.x, d.target.x), z: L(v.target.z, d.target.z) }, yaw: L(v.yaw, d.yaw), pitch: L(v.pitch, d.pitch), zoom: L(v.zoom, d.zoom),
    mode: d.mode, distance: L(v.distance, d.distance), blend: Math.abs(blend - Math.round(blend)) < 1e-3 ? Math.round(blend) : blend };
}
