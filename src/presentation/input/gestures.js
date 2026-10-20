// Pointer gesture interpreter, pure (no DOM): pointer events in, intents out.
//   intents: hover · pan · orbit · pinch(factor) · twist(angle) · paint(x, y, dragging) · paint_end(x, y, touch) · click(x, y, painted, touch) · cancel
// Rules that keep camera gestures from building by accident:
//   · a second finger turns the whole touch into a camera gesture: no paint, no click until every finger lifts;
//   · any drag past the threshold is a camera move, never a click;
//   · on touch, road painting only starts after the finger rests for PAINT_DELAY ms, so a pinch cannot paint.
export const DRAG_THRESHOLD = 5, PAINT_DELAY = 140, TWIST_DEADZONE = .06;

export function createGestureTracker() {
  const pts = new Map();
  let g = null; // current gesture
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  const two = () => [...pts.values()].slice(0, 2);
  return {
    /** p: { id, x, y, t, button, touch: bool, alt, ctrl }; ctx: { paintMode } */
    down(p, ctx) {
      pts.set(p.id, { x: p.x, y: p.y });
      if (pts.size >= 2) { const [a, b] = two(); g = { kind: 'multi', d: dist(a, b), a: ang(a, b), twist: 0, rotating: false }; return []; }
      g = { kind: 'single', sx: p.x, sy: p.y, x: p.x, y: p.y, t0: p.t, btn: p.button, touch: p.touch, moved: false, painting: false,
        orbit: p.button === 1 || p.button === 2 || p.alt || p.ctrl, paintMode: ctx.paintMode && p.button === 0 && !p.alt && !p.ctrl };
      if (g.paintMode && !g.touch) { g.painting = true; return [{ type: 'paint', x: p.x, y: p.y, dragging: false }]; }
      return [];
    },
    move(p) {
      if (!pts.has(p.id)) return [{ type: 'hover', x: p.x, y: p.y }];
      pts.set(p.id, { x: p.x, y: p.y });
      if (!g) return [];
      if (g.kind === 'multi') {
        if (pts.size < 2) return [];
        const [a, b] = two(), d = dist(a, b), an = ang(a, b), out = [];
        if (g.d > 0 && d > 0) out.push({ type: 'pinch', factor: d / g.d });
        let da = an - g.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        g.twist += da; if (!g.rotating && Math.abs(g.twist) > TWIST_DEADZONE) g.rotating = true;
        if (g.rotating) out.push({ type: 'twist', angle: da });
        g.d = d; g.a = an; return out;
      }
      const dx = p.x - g.x, dy = p.y - g.y; g.x = p.x; g.y = p.y;
      if (Math.hypot(p.x - g.sx, p.y - g.sy) > DRAG_THRESHOLD) g.moved = true;
      if (g.paintMode && g.touch && !g.painting && p.t - g.t0 >= PAINT_DELAY) { g.painting = true; return [{ type: 'paint', x: g.sx, y: g.sy, dragging: false }, { type: 'paint', x: p.x, y: p.y, dragging: true }]; }
      if (g.painting) return [{ type: 'paint', x: p.x, y: p.y, dragging: g.moved }, { type: 'hover', x: p.x, y: p.y }];
      if (!g.moved) return [{ type: 'hover', x: p.x, y: p.y }];
      return [{ type: g.orbit ? 'orbit' : 'pan', dx, dy }, { type: 'hover', x: p.x, y: p.y }];
    },
    up(p) {
      pts.delete(p.id);
      const cur = g;
      if (!cur) return [];
      if (cur.kind === 'multi') { if (pts.size === 0) g = null; return []; }
      g = null;
      if (cur.moved) return cur.painting ? [{ type: 'paint_end', x: p.x, y: p.y, touch: !!cur.touch }] : [];
      if (cur.btn === 2) return [{ type: 'cancel' }];
      if (cur.btn !== 0) return [];
      const click = { type: 'click', x: p.x, y: p.y, painted: cur.painting, touch: !!cur.touch };
      return cur.painting ? [{ type: 'paint_end', x: p.x, y: p.y, touch: !!cur.touch }, click] : [click];
    },
    cancel(p) { pts.delete(p.id); if (pts.size === 0) g = null; return []; },
    get active() { return !!g; },
  };
}
