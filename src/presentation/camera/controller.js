// Camera controller: owns the desired state (what the player asked for) and the visual state (what is drawn).
// Input calls its intent methods; the renderer reads `visual` each frame. No Three.js, no DOM.
import * as C from './model.js';

export function createCameraController({ smooth = true, onMoved = () => {} } = {}) {
  let desired = C.createCameraState('iso'), visual = C.visualFrom(desired);
  const set = (next, moved = true) => { desired = next; if (moved) onMoved(); };
  return {
    get desired() { return desired; }, get visual() { return visual; },
    smooth,
    pan: (dx, dy, screenH) => set(C.panPixels(desired, dx, dy, screenH)),
    panKeys: (px, pz, dt) => set(C.panKeys(desired, px, pz, dt)),
    orbit: (dx, dy) => set(C.orbitPixels(desired, dx, dy)),
    orbitBy: (dYaw, dPitch) => set(C.orbit(desired, dYaw, dPitch)),
    zoomBy: f => set(C.zoomBy(desired, f)),
    tilt: dir => set(C.tilt(desired, dir)),
    rotateStep: dir => set(C.rotateStep(desired, dir)),
    focus: (x, z) => set(C.focus(desired, x, z), false),
    reset: () => set(C.resetCamera(desired)),
    toggleMode: () => set(C.toggleMode(desired)),
    /** Restore a saved camera (or the default) and jump there without easing. */
    restore(raw) { desired = C.deserializeCamera(raw) || C.createCameraState('iso'); visual = C.visualFrom(desired); },
    serialize: () => C.serializeCamera(desired),
    update(dt) { visual = C.interpolate(visual, desired, dt, this.smooth); return visual; },
  };
}
