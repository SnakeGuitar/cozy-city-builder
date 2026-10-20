// Input adapter: DOM pointer, wheel and keyboard events → gesture intents (presentation/input/gestures.js)
// → camera controller, interaction and commands. It only translates; it holds no camera or game logic.
import { CMD } from '../../core/commands/commands.js';
import { createGestureTracker } from '../../presentation/input/gestures.js';

export function bindInput({ canvas, interaction, camera, game, audio, isPlaying, onEscape, onTogglePlacement, onTogglePerf }) {
  const tracker = createGestureTracker(), keys = new Set();
  const run = intents => { for (const it of intents) switch (it.type) {
    case 'hover': interaction.pointerMove(it.x, it.y); break;
    case 'pan': camera.pan(it.dx, it.dy, canvas.clientHeight); break;
    case 'orbit': camera.orbit(it.dx, it.dy); break;
    case 'pinch': camera.zoomBy(it.factor); break;
    case 'twist': camera.orbitBy(-it.angle, 0); break;
    case 'paint': interaction.paint(it.x, it.y, it.dragging); break;
    case 'paint_end': interaction.paintEnd(it.x, it.y, it.touch); break;
    case 'click': interaction.click(it.x, it.y, it.painted, it.touch); break;
    case 'cancel': interaction.cancel(); break;
  } };
  const pt = e => ({ id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, button: e.button, touch: e.pointerType === 'touch', alt: e.altKey, ctrl: e.ctrlKey || e.metaKey });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => { if (!isPlaying()) return; audio.init(); try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already-released pointer */ } run(tracker.down(pt(e), { paintMode: interaction.startsPainting(e.clientX, e.clientY) })); });
  canvas.addEventListener('pointermove', e => { if (isPlaying()) run(tracker.move(pt(e))); });
  canvas.addEventListener('pointerup', e => { if (isPlaying()) run(tracker.up(pt(e))); });
  canvas.addEventListener('pointercancel', e => run(tracker.cancel(pt(e))));
  canvas.addEventListener('pointerleave', () => interaction.pointerLeave());
  canvas.addEventListener('wheel', e => {
    e.preventDefault(); if (!isPlaying()) return;
    if ((e.ctrlKey || e.metaKey) && interaction.rotateBy(-Math.sign(e.deltaY || e.deltaX) * Math.PI / 36)) return; // free placement: turn by 5°
    if (e.shiftKey) camera.tilt(Math.sign(e.deltaY || e.deltaX)); else camera.zoomBy(Math.exp(-e.deltaY * .0012));
  }, { passive: false });
  addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'f3') { e.preventDefault(); onTogglePerf?.(); return; }
    if (!isPlaying()) { if (k === 'escape') { e.preventDefault(); onEscape(); } return; }
    keys.add(k);
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) && !e.ctrlKey && !e.metaKey) interaction.aimCenter(); // the preview follows the view
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) { e.preventDefault(); if (k === 'y' || e.shiftKey) interaction.redoRoad(); else interaction.undoRoad(); return; }
    if (k === 'escape') { if (!interaction.cancel()) onEscape(); }
    else if (k === 'q' || k === 'e') camera.rotateStep(k === 'q' ? -1 : 1);
    else if (k === 'c') camera.reset();
    else if (k === 'v') camera.toggleMode();
    else if (k === 'r') interaction.rotate(e.shiftKey ? -1 : 1);
    else if (k === 'enter') { if (interaction.pending) interaction.confirmPending(); else interaction.placeAtCenter(); } // keyboard: place at the middle of the view
    else if (k === 'f') interaction.flipCorner();
    else if (k === 'g' && interaction.tool.kind !== 'select') onTogglePlacement?.();
    else if (k === ' ') { e.preventDefault(); game.dispatch({ type: CMD.TogglePause }); }
    else if (k === '1' || k === '2' || k === '3') game.dispatch({ type: CMD.SetSpeed, speed: +k });
    else if (k === 'delete' || k === 'backspace') { if (interaction.road) interaction.demolishRoad(); else interaction.armDemolish(); }
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
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
