// Camera gestures must never place buildings by accident.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGestureTracker, PAINT_DELAY } from '../src/presentation/input/gestures.js';

const types = list => list.map(i => i.type);
const P = (id, x, y, t = 0, extra = {}) => ({ id, x, y, t, button: 0, touch: false, alt: false, ctrl: false, ...extra });
const T = (id, x, y, t = 0) => P(id, x, y, t, { touch: true });

test('a mouse click is a click; a mouse drag pans and is not a click', () => {
  const g = createGestureTracker();
  g.down(P(1, 100, 100), { paintMode: false }); assert.deepEqual(types(g.up(P(1, 101, 100))), ['click']);
  g.down(P(1, 100, 100), { paintMode: false });
  const mv = g.move(P(1, 140, 120)); assert.ok(types(mv).includes('pan'));
  assert.deepEqual(g.up(P(1, 140, 120)), []);
});

test('right drag orbits; right click cancels; Alt + drag orbits', () => {
  const g = createGestureTracker();
  g.down(P(1, 0, 0, 0, { button: 2 }), { paintMode: false }); assert.ok(types(g.move(P(1, 40, 0))).includes('orbit')); assert.deepEqual(g.up(P(1, 40, 0)), []);
  g.down(P(1, 0, 0, 0, { button: 2 }), { paintMode: false }); assert.deepEqual(types(g.up(P(1, 0, 0))), ['cancel']);
  g.down(P(1, 0, 0, 0, { alt: true }), { paintMode: true }); assert.ok(types(g.move(P(1, 40, 0))).includes('orbit'), 'Alt + drag orbits even with the road tool');
});

test('two-finger pinch and twist: zoom and orbit, never paint or click', () => {
  const g = createGestureTracker(), all = [];
  all.push(...g.down(T(1, 100, 100, 0), { paintMode: true }));
  all.push(...g.down(T(2, 200, 100, 20), { paintMode: true }));
  for (let i = 1; i <= 10; i++) { all.push(...g.move(T(1, 100 - i * 5, 100 - i * 3, 20 + i * 16))); all.push(...g.move(T(2, 200 + i * 5, 100 + i * 3, 20 + i * 16))); }
  all.push(...g.up(T(1, 50, 70, 300)), ...g.up(T(2, 250, 130, 300)));
  assert.ok(types(all).includes('pinch')); assert.ok(types(all).includes('twist'));
  assert.ok(!types(all).some(t => t === 'paint' || t === 'click'), types(all).join());
});

test('one finger pans when not building; a tap is a click', () => {
  const g = createGestureTracker();
  g.down(T(1, 50, 50), { paintMode: false }); assert.ok(types(g.move(T(1, 90, 60, 50))).includes('pan')); assert.deepEqual(g.up(T(1, 90, 60, 60)), []);
  g.down(T(1, 50, 50), { paintMode: false }); assert.deepEqual(types(g.up(T(1, 51, 50, 80))), ['click']);
});

test('touch painting waits for the finger to settle, so a pinch that starts with one finger cannot paint', () => {
  const g = createGestureTracker();
  assert.deepEqual(g.down(T(1, 50, 50, 0), { paintMode: true }), []);
  assert.ok(!types(g.move(T(1, 60, 50, PAINT_DELAY - 40))).includes('paint'));
  g.down(T(2, 150, 50, PAINT_DELAY - 20), { paintMode: true });
  assert.ok(!types(g.move(T(1, 70, 50, PAINT_DELAY + 50))).includes('paint'));
  g.up(T(1, 70, 50)); g.up(T(2, 150, 50));
  g.down(T(3, 50, 50, 1000), { paintMode: true });
  assert.ok(types(g.move(T(3, 80, 50, 1000 + PAINT_DELAY + 1))).includes('paint'), 'a resting finger paints roads');
});

test('mouse painting starts at once for roads and demolition', () => {
  const g = createGestureTracker();
  assert.deepEqual(types(g.down(P(1, 10, 10), { paintMode: true })), ['paint']);
  assert.ok(types(g.move(P(1, 40, 10))).includes('paint'));
  assert.deepEqual(types(g.up(P(1, 40, 10))), [], 'a dragged paint is not also a click');
});
