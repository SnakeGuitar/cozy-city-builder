// Input port: mouse, touch (pan and pinch), wheel and keyboard → camera moves, interaction intents and commands.
import { CMD } from '../../core/commands/commands.js';

export function bindInput({ canvas, view, interaction, game, audio, onCameraMoved }) {
  const ptrs = new Map(), keys = new Set();
  let drag = null, painting = false;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    audio.init(); canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = { pinch: Math.hypot(a.x - b.x, a.y - b.y), z: view.rig.tzoom }; painting = false; return; }
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, btn: e.button, moved: false };
    if (e.button === 0 && interaction.startsPainting()) { painting = true; interaction.paint(e.clientX, e.clientY, false); }
  });
  canvas.addEventListener('pointermove', e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (drag && drag.pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; view.setZoom(drag.z * Math.hypot(a.x - b.x, a.y - b.y) / drag.pinch); onCameraMoved(); return; }
    if (drag && !drag.pinch) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
      if (painting) interaction.paint(e.clientX, e.clientY, drag.moved);
      else if (drag.moved) { view.pan(dx, dy); onCameraMoved(); }
      drag.x = e.clientX; drag.y = e.clientY;
    }
    interaction.pointerMove(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerleave', () => interaction.pointerLeave());
  canvas.addEventListener('pointerup', e => {
    ptrs.delete(e.pointerId); if (!drag) return;
    const d = drag; if (ptrs.size === 0) drag = null; else if (d.pinch) { drag = null; return; }
    if (d.pinch) return;
    const wasPainting = painting; painting = false;
    if (d.moved) return;
    if (d.btn === 2) { interaction.cancel(); return; }
    if (d.btn === 0) interaction.click(e.clientX, e.clientY, wasPainting);
  });
  canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; painting = false; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault(); onCameraMoved();
    if (e.shiftKey) view.tilt(Math.sign(e.deltaY)); else view.zoomBy(Math.exp(-e.deltaY * .0012));
  }, { passive: false });
  addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase(); keys.add(k);
    if (k === 'escape') interaction.cancel();
    else if (k === 'q' || k === 'e') { view.rotate(k === 'q' ? -1 : 1); onCameraMoved(); }
    else if (k === 'r') interaction.rotate();
    else if (k === ' ') { e.preventDefault(); game.dispatch({ type: CMD.TogglePause }); }
    else if (k === '1' || k === '2' || k === '3') game.dispatch({ type: CMD.SetSpeed, speed: +k });
    else if (k === 'delete' || k === 'backspace') interaction.armDemolish();
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  return {
    /** WASD / arrow keys held this frame, as a pan direction. */
    panDirection() {
      let px = 0, pz = 0;
      if (keys.has('w') || keys.has('arrowup')) pz -= 1; if (keys.has('s') || keys.has('arrowdown')) pz += 1;
      if (keys.has('a') || keys.has('arrowleft')) px -= 1; if (keys.has('d') || keys.has('arrowright')) px += 1;
      return { px, pz };
    },
  };
}
