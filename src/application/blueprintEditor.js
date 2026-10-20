// The building editor's model: a draft blueprint, a selection and an undo/redo stack of reversible commands.
// Engine- and DOM-free: a renderer shows `draft`, a UI calls the operations below. Nothing reaches the game until
// the player confirms, which saves an immutable blueprint version through the core's SaveBlueprint command.
//
// Every edit is a command { label, do(draft), undo(draft) } run through `run`; consecutive edits of one gesture
// (dragging a gizmo, typing in a number field) share a `merge` key and become one undo step.
// Drafts are autosaved through a storage port ({ read(key), write(key, value), remove(key) }) after every change,
// so a crash or a closed tab loses nothing: `recoverDraft` reads the last one back (validated like a save).
import { MODULES } from '../core/config/modules.js';
import { DEFS } from '../core/config/catalog.js';
import { createBlueprint, createPart, normalizeBlueprint, validateBlueprint, blueprintCost, blueprintExtraCost, blueprintWeight, resolveParts,
  offsetForPose, partSubtree, anchorsFor, isBlueprintBase, entranceOf, sameDesign } from '../core/domain/blueprint.js';
import { BLUEPRINT_LIMITS, FACES } from '../core/config/modules.js';

export const DRAFT_KEY = 'villa-limon-blueprint-draft';
export const EDITOR_UNDO_LIMIT = 200;
const clone = o => JSON.parse(JSON.stringify(o));

/**
 * Opens an editor on `blueprint` (a saved version to edit, or none for a new design of `baseType`).
 * `original` (the saved version; defaults to `blueprint`) stays untouched for comparison; `storage` enables autosave; `onChange(kind)` is
 * called after every change ('edit' · 'select' · 'history'). `recovered` marks a draft brought back after a crash (unsaved).
 */
export function createBlueprintEditor({ blueprint = null, original: from, baseType = 'cottage', name = '', storage = null, recovered = false, onChange = () => {} } = {}) {
  let original = from !== undefined ? (from ? clone(from) : null) : blueprint ? clone(blueprint) : null; // a recovered draft names its saved version apart
  let draft = blueprint ? clone(blueprint) : createBlueprint({ name, baseType });
  let selection = [], undo = [], redo = [], rev = 0, savedRev = recovered ? -1 : 0, memo = { rev: -1 }; // a recovered draft starts unsaved
  const byId = id => draft.parts.find(p => p.id === id);

  function changed(kind) {
    if (kind === 'edit') { rev++; autosave(); }
    selection = selection.filter(id => byId(id)); // parts removed by undo leave the selection
    onChange(kind);
  }
  function autosave() { if (storage) storage.write(DRAFT_KEY, JSON.stringify({ v: 1, blueprint: draft })); }
  /** Runs a reversible command; `merge` folds it into the previous one of the same gesture. */
  function run(cmd, merge = null) {
    cmd.do(draft);
    const last = undo.at(-1);
    if (merge && last && last.merge === merge) last.redo = cmd.do; // same gesture: undo still goes back to before its first step
    else { undo.push({ label: cmd.label, redo: cmd.do, undo: cmd.undo, merge }); if (undo.length > EDITOR_UNDO_LIMIT) undo.shift(); }
    redo = []; changed('edit');
  }
  /** A command that replaces whole parts (by id) and restores them on undo; parts missing before are removed on undo. */
  function partsCommand(label, mutate) {
    const before = clone(draft.parts), meta = { name: draft.name, baseType: draft.baseType, seed: draft.seed, nextPartId: draft.nextPartId };
    const after = (() => { const d = clone(draft); mutate(d); return d; })();
    return { label, do: d => { d.parts = clone(after.parts); Object.assign(d, { name: after.name, baseType: after.baseType, seed: after.seed, nextPartId: after.nextPartId }); },
      undo: d => { d.parts = clone(before); Object.assign(d, meta); } };
  }

  /** Where a new part of `module` goes: on `parentId` (null: the lot; undefined: the selected part) when it may hang there, else on the lot or the first wall. */
  function placementFor(module, parentId) {
    const m = MODULES[module], sel = parentId !== undefined ? parentId : selection.at(-1) ?? null, par = sel !== null ? byId(sel) : null;
    if (par) { const a = anchorsFor(module, par.id); if (a.length) return { parent: par.id, anchor: a.includes('top') && !m.attach.includes('face') ? 'top' : a.includes('front') ? 'front' : a[0] }; }
    if (m.attach.includes('ground')) return { parent: null, anchor: 'ground' };
    if (parentId === null) return null; // explicitly on the lot, where this module cannot stand
    const host = draft.parts.find(p => p.module === 'body'); if (!host) return null;
    const a = anchorsFor(module, host.id); return { parent: host.id, anchor: a.includes('front') ? 'front' : a[0] };
  }

  const api = {
    get draft() { return draft; }, get original() { return original; }, get selection() { return selection; }, get primary() { return selection.at(-1) ?? null; },
    get canUndo() { return undo.length > 0; }, get canRedo() { return redo.length > 0; }, get undoLabel() { return undo.at(-1)?.label || null; }, get redoLabel() { return redo.at(-1)?.label || null; },
    /** Changed since opened or since the last save. */
    get dirty() { return rev !== savedRev; }, get revision() { return rev; },
    /** Validation of the current draft (memoised per revision): { ok, issues }. */
    validation() { if (memo.rev !== rev) memo = { rev, result: validateBlueprint(draft) }; return memo.result; },
    /** Price breakdown: base type, parts, whole; complexity used and allowed. */
    cost() { return { base: DEFS[draft.baseType].cost, extra: blueprintExtraCost(draft), total: blueprintCost(draft), weight: blueprintWeight(draft), maxWeight: BLUEPRINT_LIMITS.weight, parts: draft.parts.length, maxParts: BLUEPRINT_LIMITS.parts }; },
    entrance: () => entranceOf(draft),
    resolved: () => resolveParts(draft),
    part: byId,
    /** Whether the draft differs from the version it was opened from (always true for a new design). */
    differsFromOriginal: () => !original || original.name !== draft.name || !sameDesign(original, draft),

    // ---- selection
    select(ids, { add = false, toggle = false } = {}) {
      const list = (Array.isArray(ids) ? ids : [ids]).filter(id => byId(id));
      if (toggle) { for (const id of list) selection = selection.includes(id) ? selection.filter(x => x !== id) : [...selection, id]; }
      else selection = add ? [...new Set([...selection, ...list])] : list;
      onChange('select');
    },
    selectAll() { selection = draft.parts.map(p => p.id); onChange('select'); },
    clearSelection() { selection = []; onChange('select'); },

    // ---- edits (each one undoable)
    /** Adds a part of `module` (placed by placementFor unless `at` says where); selects it. Returns its id or null. */
    addPart(module, at = {}) {
      if (!MODULES[module]) return null;
      const where = at.anchor ? { parent: at.parent ?? null, anchor: at.anchor } : placementFor(module, at.parent);
      if (!where) return null;
      const id = draft.nextPartId;
      // starting spot: the lot centre, the middle of a face, or (things on top that are not roofs) off-centre so a roof does not hide them
      const par = where.parent !== null ? byId(where.parent) : null, onTop = where.anchor === 'top' && !MODULES[module].roof && par;
      const offset = at.offset || (where.anchor === 'ground' ? { x: 0, y: 0, z: 0 } : onTop ? { x: +(par.size.w * .28).toFixed(3), y: 0, z: -(par.size.d * .2).toFixed(3) } : where.anchor === 'top' ? { x: 0, y: 0, z: 0 } : { x: 0, y: .12, z: 0 });
      run(partsCommand('add', d => { d.parts.push(createPart(id, module, { ...where, offset })); d.nextPartId = id + 1; }));
      selection = [id]; onChange('select'); return id;
    },
    /** Removes parts and everything hanging from them. */
    removeParts(ids = selection) {
      const gone = new Set(ids.flatMap(id => partSubtree(draft, id))); if (!gone.size) return 0;
      run(partsCommand('remove', d => { d.parts = d.parts.filter(p => !gone.has(p.id)); }));
      selection = []; onChange('select'); return gone.size;
    },
    /** Copies parts (with their children) beside the originals; selects the copies. */
    duplicate(ids = selection) {
      const roots = ids.filter(id => byId(id) && !ids.some(o => o !== id && partSubtree(draft, o).includes(id))); if (!roots.length) return [];
      const made = [];
      run(partsCommand('duplicate', d => {
        for (const rootId of roots) {
          const map = new Map();
          for (const pid of partSubtree(d, rootId)) {
            const src = d.parts.find(p => p.id === pid), id = d.nextPartId++, copy = clone(src); map.set(pid, id); copy.id = id;
            if (pid === rootId) { const step = Math.max(.08, src.size.w * .5); if (FACES.includes(copy.anchor)) copy.offset.x += step; else { copy.offset.x += step; copy.offset.z += src.anchor === 'ground' ? step * .5 : 0; } made.push(id); }
            else copy.parent = map.get(src.parent);
            d.parts.push(copy);
          }
        }
      }));
      selection = made; onChange('select'); return made;
    },
    /** Changes fields of one part: { offset?, size?, rotation?, color?, variant?, anchor?, parent? }. Numbers are clamped like a save. */
    updatePart(id, patch, merge = null) {
      const p = byId(id); if (!p) return false;
      const next = normalizeBlueprint({ ...draft, parts: draft.parts.map(q => q.id === id ? { ...q, ...patch, offset: { ...q.offset, ...patch.offset }, size: { ...q.size, ...patch.size } } : q) });
      const np = next?.parts.find(q => q.id === id); if (!np || next.parts.length !== draft.parts.length) return false; // the change would detach parts (bad parent)
      if (JSON.stringify(np) === JSON.stringify(p)) return false;
      run(partsCommand(patch.size ? 'resize' : patch.offset || patch.rotation !== undefined ? 'move' : 'change', d => { const i = d.parts.findIndex(q => q.id === id); d.parts[i] = np; }), merge && `${merge}:${id}`);
      return true;
    },
    /** Updates several parts with one undo step (multi-selection moves): patchOf(part) → patch. */
    updateMany(ids, patchOf, merge = null) {
      const list = ids.map(byId).filter(Boolean); if (!list.length) return false;
      const parts = draft.parts.map(q => { const pt = list.includes(q) && patchOf(q); return pt ? { ...q, ...pt, offset: { ...q.offset, ...pt.offset }, size: { ...q.size, ...pt.size } } : q; });
      const next = normalizeBlueprint({ ...draft, parts }); if (!next || next.parts.length !== draft.parts.length) return false;
      run(partsCommand('move', d => { d.parts = next.parts; }), merge && `${merge}:${ids.join(',')}`);
      return true;
    },
    /** A gizmo put a part at a lot-frame pose { x, y, z, ry } and/or scaled it (scale { w, h, d } factors). */
    transformPart(id, { pose, scale } = {}, merge = 'gizmo') {
      const p = byId(id); if (!p) return false; const patch = {};
      if (pose) Object.assign(patch, offsetForPose(draft, id, pose));
      if (scale) patch.size = { w: p.size.w * scale.w, h: p.size.h * scale.h, d: p.size.d * scale.d };
      return this.updatePart(id, patch, merge);
    },
    /** Hangs a part somewhere else (another parent or anchor); its offset starts fresh. */
    reattach(id, parent, anchor) {
      const p = byId(id); if (!p || (parent !== null && partSubtree(draft, id).includes(parent))) return false;
      if (!anchorsFor(p.module, parent).includes(anchor)) return false;
      return this.updatePart(id, { parent, anchor, offset: { x: 0, y: anchor === 'ground' || anchor === 'top' ? 0 : .12, z: 0 } });
    },
    setName(name, merge = 'name') { const n = String(name).slice(0, BLUEPRINT_LIMITS.nameLength); if (n === draft.name) return; run(partsCommand('rename', d => { d.name = n; }), merge); },
    /** Another base type (rules and lot size). Only for designs never saved: a saved one keeps its base type. */
    setBaseType(type) { if (original || !isBlueprintBase(type) || type === draft.baseType) return false; run(partsCommand('baseType', d => { d.baseType = type; })); return true; },
    setSeed(seed) { run(partsCommand('seed', d => { d.seed = seed >>> 0; })); },

    // ---- history
    undo() { const c = undo.pop(); if (!c) return false; c.undo(draft); redo.push(c); changed('edit'); onChange('history'); return true; },
    redo() { const c = redo.pop(); if (!c) return false; c.redo(draft); undo.push(c); changed('edit'); onChange('history'); return true; },
    /** Ends a gesture: the next edit starts a new undo step even with the same merge key. */
    endGesture() { const last = undo.at(-1); if (last) last.merge = null; },

    // ---- persistence of the draft
    /** The draft as it should be sent to SaveBlueprint. */
    toSave: () => clone(draft),
    /** Call after the game accepted the save: `saved` is the stored version (it becomes the new original). */
    markSaved(saved) { savedRev = rev; if (storage) storage.remove(DRAFT_KEY); if (saved) { draft.id = saved.id; draft.version = saved.version; original = clone(saved); } onChange('history'); },
    /** Throws the autosaved draft away (closing without saving, after confirmation). */
    discardDraft() { if (storage) storage.remove(DRAFT_KEY); },
  };
  return api;
}

/** A draft left behind by a crash or a closed tab, validated like a save; null when there is none or it is unreadable. */
export function recoverDraft(storage) {
  if (!storage) return null;
  let raw = null; try { raw = JSON.parse(storage.read(DRAFT_KEY) || 'null'); } catch (e) { raw = null; }
  if (!raw || raw.v !== 1) return null;
  const bp = normalizeBlueprint(raw.blueprint);
  return bp && bp.parts.length ? bp : null;
}
