// The building editor's model (application/blueprintEditor.js): reversible edits, gestures, selection, autosave.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlueprintEditor, recoverDraft, DRAFT_KEY } from '../src/application/blueprintEditor.js';
import { createBlueprint, resolveParts, offsetForPose, blueprintBaseTypes, MODULES } from '../src/core/index.js';

const memStorage = () => { const m = new Map(); return { map: m, read: k => m.get(k) ?? null, write: (k, v) => { m.set(k, v); return true; }, remove: k => m.delete(k) }; };
const ed = (o = {}) => createBlueprintEditor({ baseType: 'fr_trad', name: 'Casa', ...o });

test('pose → offset is the exact inverse of resolving parts, for every starting design', () => {
  for (const t of blueprintBaseTypes()) {
    const bp = createBlueprint({ name: 'x', baseType: t }), res = resolveParts(bp);
    for (const p of bp.parts) {
      const r = res.get(p.id), back = offsetForPose(bp, p.id, { x: r.x, y: r.y, z: r.z, ry: r.ry }, res);
      for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(back.offset[k] - p.offset[k]) < 1e-4, `${t} part ${p.id} ${k}`);
      assert.ok(Math.abs(back.rotation - p.rotation) < 1e-4);
    }
  }
});

test('adding hangs the module where it fits; undo and redo walk the history', () => {
  const e = ed(), body = e.draft.parts.find(p => p.module === 'body');
  e.select(body.id);
  const n0 = e.draft.parts.length, id = e.addPart('balcony');
  assert.equal(e.part(id).parent, body.id); assert.equal(e.part(id).anchor, 'front'); assert.deepEqual(e.selection, [id]);
  const chim = e.addPart('chimney', { parent: body.id });
  assert.equal(e.part(chim).anchor, 'top', 'a chimney goes on top');
  const tree = e.addPart('tree_small', { parent: null }); assert.equal(e.part(tree).anchor, 'ground');
  assert.equal(e.draft.parts.length, n0 + 3);
  assert.ok(e.undo() && e.undo()); assert.equal(e.draft.parts.length, n0 + 1); assert.deepEqual(e.selection, [], 'undone parts leave the selection');
  assert.ok(e.redo()); assert.equal(e.draft.parts.length, n0 + 2); assert.ok(e.part(chim));
  e.addPart('sign', { parent: body.id }); assert.equal(e.canRedo, false, 'a new edit clears redo');
  assert.equal(e.addPart('roof_flat', { parent: null }), null, 'a roof never stands on the lot');
});

test('a gizmo drag is one undo step; the next drag is another', () => {
  const e = ed(), win = e.draft.parts.find(p => p.module === 'window_sash'), x0 = win.offset.x;
  const r = resolveParts(e.draft).get(win.id);
  for (let i = 1; i <= 5; i++) e.transformPart(win.id, { pose: { x: r.x + i * .01, y: r.y, z: r.z, ry: r.ry } });
  assert.ok(Math.abs(e.part(win.id).offset.x - (x0 + .05)) < 1e-9);
  e.endGesture();
  e.transformPart(win.id, { pose: { x: r.x, y: r.y + .05, z: r.z, ry: r.ry } });
  assert.ok(e.undo()); assert.ok(Math.abs(e.part(win.id).offset.x - (x0 + .05)) < 1e-9, 'second drag undone');
  assert.ok(e.undo()); assert.equal(e.part(win.id).offset.x, x0, 'whole first drag undone at once');
  assert.ok(e.updatePart(win.id, { size: { w: 99 } })); assert.equal(e.part(win.id).size.w, MODULES.window_sash.max.w, 'sizes are clamped');
});

test('removing takes the children along; duplicating copies a subtree with fresh ids', () => {
  const e = ed(), body = e.draft.parts.find(p => p.module === 'body'), n = e.draft.parts.length;
  const copies = e.duplicate([body.id]);
  assert.equal(e.draft.parts.length, n * 2, 'body with roof, door and windows copied');
  const copy = e.part(copies[0]); assert.equal(copy.module, 'body'); assert.notEqual(copy.id, body.id);
  assert.ok(e.draft.parts.filter(p => p.parent === copy.id).length === n - 1, 'children hang from the copy');
  assert.equal(new Set(e.draft.parts.map(p => p.id)).size, e.draft.parts.length, 'ids stay unique');
  assert.equal(e.removeParts([copy.id]), n); assert.equal(e.draft.parts.length, n);
  assert.ok(e.undo()); assert.equal(e.draft.parts.length, n * 2);
});

test('multi-selection moves together in one step; selection toggles', () => {
  const e = ed(), ids = e.draft.parts.filter(p => p.module === 'window_sash').map(p => p.id);
  e.select(ids[0]); e.select(ids[1], { toggle: true }); assert.deepEqual(e.selection, ids);
  e.select(ids[0], { toggle: true }); assert.deepEqual(e.selection, [ids[1]]);
  const before = ids.map(id => e.part(id).offset.y);
  assert.ok(e.updateMany(ids, p => ({ offset: { y: p.offset.y + .05 } })));
  ids.forEach((id, i) => assert.ok(Math.abs(e.part(id).offset.y - before[i] - .05) < 1e-9));
  e.undo(); ids.forEach((id, i) => assert.equal(e.part(id).offset.y, before[i]));
});

test('validation follows the draft; saved designs keep their base type', () => {
  const e = ed(); assert.ok(e.validation().ok);
  const door = e.draft.parts.find(p => MODULES[p.module].entrance); e.removeParts([door.id]);
  assert.ok(e.validation().issues.some(i => i.code === 'noEntrance'));
  e.undo(); assert.ok(e.validation().ok);
  assert.ok(e.setBaseType('bakery')); assert.equal(e.draft.baseType, 'bakery');
  const saved = { ...createBlueprint({ name: 'v', baseType: 'cottage' }), id: 'bp4', version: 2 };
  const e2 = createBlueprintEditor({ blueprint: saved });
  assert.equal(e2.setBaseType('bakery'), false); assert.equal(e2.differsFromOriginal(), false);
  e2.setName('otra'); assert.ok(e2.differsFromOriginal() && e2.dirty);
  assert.equal(saved.name, 'v', 'the original is never touched');
});

test('drafts are autosaved after every change and can be recovered after a crash', () => {
  const st = memStorage(), e = ed({ storage: st });
  assert.equal(recoverDraft(st), null);
  e.addPart('chimney', { parent: e.draft.parts[0].id });
  const back = recoverDraft(st); assert.deepEqual(back.parts, e.draft.parts);
  st.write(DRAFT_KEY, '{"v":1,"blueprint":{"schema":1,"parts":"oops"}}'); assert.equal(recoverDraft(st), null, 'an unreadable draft is ignored');
  st.write(DRAFT_KEY, 'not json'); assert.equal(recoverDraft(st), null);
  e.setName('Casa azul'); e.markSaved({ id: 'bp1', version: 1 }); assert.equal(st.map.has(DRAFT_KEY), false, 'saving clears the draft');
  assert.equal(e.dirty, false); assert.equal(e.draft.id, 'bp1');
  const again = createBlueprintEditor({ blueprint: back, original: null, recovered: true, storage: st });
  assert.ok(again.dirty && again.differsFromOriginal(), 'a recovered draft counts as unsaved until saved or discarded');
});
