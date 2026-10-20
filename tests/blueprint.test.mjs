// Blueprints: parametric designs for custom buildings (core/domain/blueprint.js), their commands and saves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlueprint, createPart, normalizeBlueprint, validateBlueprint, resolveParts, entranceOf, blueprintCost, blueprintExtraCost, blueprintBaseTypes,
  migrateBlueprint, BLUEPRINT_SCHEMA, BLUEPRINT_LIMITS, MODULES, searchModules, getBlueprint, blueprintUsers, createSaveDocument, loadSave, migrateSave, SAVE_VERSION,
  DEFS, FACE_ANGLE, cosSin, refundFor } from '../src/core/index.js';
import { makeState, createGame, centre, CMD, ALL_GOALS } from './helpers.mjs';

const codes = bp => validateBlueprint(bp).issues.map(i => i.code);
const named = (baseType, name = 'Casa Test') => createBlueprint({ name, baseType });
const game = (over = {}) => createGame({ state: makeState(centre(), { coins: 5000, goalsDone: ALL_GOALS, ...over }) });
const save = (g, bp, extra = {}) => g.dispatch({ type: CMD.SaveBlueprint, blueprint: bp, ...extra });

test('every base type starts from a valid design', () => {
  const types = blueprintBaseTypes();
  assert.ok(types.length > 30 && !types.includes('cafe') && !types.some(t => DEFS[t].kind === 'road'));
  for (const t of types) assert.deepEqual(validateBlueprint(named(t)).issues.filter(i => i.level === 'error'), [], t);
  assert.deepEqual(named('bakery'), named('bakery'), 'deterministic');
});

test('parts follow their parent: a window stays on its face when the wall is resized or turned', () => {
  const bp = named('fr_trad'), body = bp.parts.find(p => p.module === 'body'), win = bp.parts.find(p => p.module === 'window_sash');
  const before = resolveParts(bp).get(win.id);
  assert.ok(Math.abs(before.z - (body.size.d / 2 + win.size.d / 2)) < 1e-9, 'on the front face');
  body.size.d = .9; body.size.w = .6;
  const after = resolveParts(bp).get(win.id);
  assert.ok(Math.abs(after.z - (.45 + win.size.d / 2)) < 1e-9, 'moved out with the deeper wall');
  assert.equal(after.x, before.x, 'kept its place along the face');
  body.rotation = Math.PI / 2;
  const turned = resolveParts(bp).get(win.id), [c, s] = cosSin(Math.PI / 2);
  assert.ok(Math.abs(turned.x - (before.x * c + (.45 + win.size.d / 2) * s)) < 1e-9 && Math.abs(turned.ry - Math.PI / 2) < 1e-9, 'turned with the wall');
  const roof = resolveParts(bp).get(bp.parts.find(p => p.module === 'roof_gable').id);
  assert.equal(roof.y, body.size.h, 'the roof sits on top of the wall');
});

test('normalising untrusted blueprints: unknown modules, broken parents and cycles go; numbers are clamped', () => {
  const warnings = [];
  const raw = { schema: 1, name: '  Taller  ', baseType: 'workshop', parts: [
    { id: 1, module: 'body', anchor: 'ground', size: { w: 99, h: -1, d: .5 }, color: 'red' },
    { id: 2, module: 'teleporter', anchor: 'ground' },
    { id: 3, module: 'door', parent: 1, anchor: 'front', offset: { x: 'a', y: .02 } },
    { id: 4, module: 'window_sash', parent: 9, anchor: 'front' },
    { id: 5, module: 'chimney', parent: 6, anchor: 'top' }, { id: 6, module: 'chimney', parent: 5, anchor: 'top' },
    { id: 3, module: 'sign', parent: 1, anchor: 'front' },
  ] };
  const bp = normalizeBlueprint(raw, w => warnings.push(w));
  assert.deepEqual(bp.parts.map(p => p.id), [1, 3]);
  assert.equal(bp.name, 'Taller');
  assert.deepEqual(bp.parts[0].size, { w: MODULES.body.max.w, h: MODULES.body.min.h, d: .5 });
  assert.equal(bp.parts[0].color, MODULES.body.color);
  assert.equal(bp.parts[1].offset.x, 0);
  assert.ok(warnings.length >= 4);
  assert.equal(normalizeBlueprint('nope'), null);
  assert.throws(() => migrateBlueprint({ schema: BLUEPRINT_SCHEMA + 1, parts: [] }), /newer/);
  assert.equal(normalizeBlueprint({ schema: 99, parts: [] }, () => {}), null, 'a future schema is refused, not guessed');
});

test('validation explains what is wrong and where', () => {
  const ok = named('cottage');
  assert.ok(validateBlueprint(ok).ok);
  const noName = { ...ok, name: ' ' }; assert.ok(codes(noName).includes('name'));
  const bp = named('cottage'), body = bp.parts.find(p => p.module === 'body');
  body.offset.x = .4; assert.ok(validateBlueprint(bp).issues.some(i => i.code === 'outsideLot' && i.partId === body.id), 'sticks out of the 1 × 1 lot');
  body.offset.x = 0; body.size.h = 2.4; bp.parts.push(createPart(bp.nextPartId++, 'chimney', { parent: body.id, anchor: 'top', size: { w: .1, h: 1.2, d: .1 } }));
  assert.ok(codes(bp).includes('tooTall'));
  const noDoor = named('bakery'); noDoor.parts = noDoor.parts.filter(p => !MODULES[p.module].entrance);
  assert.ok(codes(noDoor).includes('noEntrance') && !validateBlueprint(noDoor).ok);
  const garden = named('garden'); assert.ok(validateBlueprint(garden).ok, 'green spaces need no door');
  const noRoof = named('cottage'); noRoof.parts = noRoof.parts.filter(p => !MODULES[p.module].roof);
  assert.deepEqual(validateBlueprint(noRoof).issues.map(i => [i.level, i.code]), [['warning', 'noRoof']], 'a warning, not an error');
  const wide = named('cottage'); wide.parts.find(p => p.module === 'door').offset.x = .5;
  assert.ok(validateBlueprint(wide).issues.some(i => i.code === 'overhang' && i.level === 'warning'));
  const many = named('apartments'), b0 = many.parts[0];
  for (let i = 0; i < BLUEPRINT_LIMITS.parts; i++) many.parts.push(createPart(many.nextPartId++, 'sign', { parent: b0.id, anchor: 'back', offset: { y: .1 } }));
  assert.ok(codes(many).includes('tooManyParts'));
  const heavy = named('apartments');
  for (let i = 0; i < 45; i++) heavy.parts.push(createPart(heavy.nextPartId++, 'body', { parent: heavy.parts[0].id, anchor: 'top', size: { w: .2, h: .15, d: .2 } }));
  assert.ok(codes(heavy).includes('tooComplex'));
  const wrong = named('cottage'); wrong.parts.push(createPart(wrong.nextPartId++, 'roof_flat', { anchor: 'ground' }));
  assert.ok(codes(wrong).includes('anchor'), 'a roof cannot stand on the ground');
  assert.deepEqual(validateBlueprint({ ...named('cottage'), parts: [] }).issues.map(i => i.code), ['empty']);
});

test('price: the base type plus each part, scaled by size; the library search finds modules by words', () => {
  const bp = named('cottage'), extra = blueprintExtraCost(bp);
  assert.equal(blueprintCost(bp), DEFS.cottage.cost + extra);
  const door = bp.parts.find(p => p.module === 'door'); door.size.w *= 2; door.size.h *= 2;
  assert.ok(blueprintExtraCost(bp) > extra, 'a bigger door costs more');
  assert.deepEqual(searchModules('entrance'), ['door', 'shopfront', 'gate']);
  assert.deepEqual(searchModules('', 'roof'), ['roof_gable', 'roof_hip', 'roof_flat', 'roof_shed']);
  assert.deepEqual(searchModules('glass round'), ['window_round']);
});

test('saving designs: new entries, immutable versions, unchanged saves, invalid designs with their issues', () => {
  const g = game();
  const r1 = save(g, named('bakery', 'Panadería')); assert.ok(r1.ok); assert.equal(r1.id, 'bp1'); assert.equal(r1.version, 1);
  const st = () => g.getSnapshot().state;
  const v1 = getBlueprint(st(), { id: 'bp1' });
  assert.equal(save(g, v1).unchanged, true, 'saving the same design again keeps version 1');
  const v2 = JSON.parse(JSON.stringify(v1)); v2.parts.find(p => p.module === 'body').size.h = .7;
  const r2 = save(g, v2); assert.equal(r2.version, 2); assert.equal(getBlueprint(st(), { id: 'bp1' }).version, 2);
  assert.equal(getBlueprint(st(), { id: 'bp1', version: 1 }).parts.find(p => p.module === 'body').size.h, .5, 'version 1 never changes');
  assert.equal(save(g, { ...v2, baseType: 'jam' }).reason, 'baseTypeChanged');
  assert.equal(save(g, { ...v2, baseType: 'jam' }, { asNew: true }).id, 'bp2', 'save as new');
  const bad = save(g, { ...named('bakery'), parts: [] });
  assert.equal(bad.reason, 'invalidBlueprint'); assert.deepEqual(bad.issues.map(i => i.code), ['empty']);
});

test('custom buildings: built from an exact version, priced, refunded, remodelled and protected from deletion', () => {
  const g = game(), st = () => g.getSnapshot().state;
  const bp = named('cottage', 'Casita'); save(g, bp);
  const v1 = getBlueprint(st(), { id: 'bp1' }), price = DEFS.cottage.cost + blueprintExtraCost(v1);
  const c0 = st().coins, placed = g.dispatch({ type: CMD.Place, blueprint: { id: 'bp1' }, x: 8, y: 14, r: 0, autoFace: false });
  assert.ok(placed.ok, placed.reason);
  const b = st().buildings[placed.id];
  assert.equal(b.type, 'cottage'); assert.deepEqual(b.blueprint, { id: 'bp1', version: 1 }); assert.equal(st().coins, c0 - price);
  assert.equal(refundFor(st(), b), Math.floor(price * .5), 'half of everything paid');
  assert.equal(g.dispatch({ type: CMD.DeleteBlueprint, id: 'bp1' }).reason, 'inUse');
  assert.deepEqual(blueprintUsers(st(), 'bp1').buildings, [b.id]);
  // a dearer version 2: remodelling costs the difference
  const v2 = JSON.parse(JSON.stringify(v1)); v2.parts.push(createPart(v2.nextPartId++, 'chimney', { parent: v2.parts[0].id, anchor: 'top', offset: { x: .2 } }));
  save(g, v2); const extra = blueprintExtraCost(getBlueprint(st(), { id: 'bp1', version: 2 })) - blueprintExtraCost(v1);
  const c1 = st().coins; assert.ok(g.dispatch({ type: CMD.Remodel, id: b.id, version: 2 }).ok);
  assert.equal(st().coins, c1 - extra); assert.deepEqual(st().buildings[b.id].blueprint, { id: 'bp1', version: 2 });
  assert.equal(g.dispatch({ type: CMD.Remodel, id: b.id, version: 2 }).reason, 'sameVersion');
  assert.equal(g.dispatch({ type: CMD.Remodel, id: b.id, version: 7 }).reason, 'missingBlueprint');
  assert.equal(g.dispatch({ type: CMD.Place, blueprint: { id: 'bp9' }, x: 4, y: 14 }).reason, 'missingBlueprint');
  assert.ok(g.dispatch({ type: CMD.Demolish, id: b.id }).ok);
  assert.ok(g.dispatch({ type: CMD.DeleteBlueprint, id: 'bp1' }).ok, 'free to delete once unused');
  assert.equal(getBlueprint(st(), { id: 'bp1' }), null);
});

test('a custom building turns its entrance to the street', () => {
  const g = game(), st = () => g.getSnapshot().state, bp = named('cottage', 'Lateral');
  const door = bp.parts.find(p => p.module === 'door'); door.anchor = 'right';
  bp.parts = bp.parts.filter(p => p.module !== 'window_sash');
  save(g, bp); const e = entranceOf(getBlueprint(st(), { id: 'bp1' })); assert.equal(e.side, 'right');
  const r = g.dispatch({ type: CMD.Place, blueprint: { id: 'bp1' }, x: 14, y: 12, r: 0 }); assert.ok(r.ok, r.reason); // the street runs along y = 13, below
  const a = st().buildings[r.id].rotation + FACE_ANGLE.right, [c, s] = cosSin(a);
  assert.ok(Math.abs(s) < 1e-9 && Math.abs(c - 1) < 1e-9, 'the door looks toward +z, where the street is');
});

test('saves keep the library and every reference; old saves get an empty library; damage falls back safely', () => {
  const g = game(), st = () => g.getSnapshot().state;
  save(g, named('bakery', 'Horno')); const placed = g.dispatch({ type: CMD.Place, blueprint: { id: 'bp1' }, x: 8, y: 14, r: 0, autoFace: false });
  const doc = JSON.parse(JSON.stringify(createSaveDocument(st())));
  assert.equal(doc.v, SAVE_VERSION); assert.ok(SAVE_VERSION >= 9);
  const back = loadSave(doc);
  assert.deepEqual(back.warnings, []);
  assert.deepEqual(back.state.blueprints, st().blueprints);
  assert.deepEqual(back.state.buildings[placed.id].blueprint, { id: 'bp1', version: 1 });
  assert.equal(back.state.nextBlueprintId, 2);
  assert.deepEqual(createSaveDocument(back.state), createSaveDocument(st()), 'round trip is stable');
  // a v8 document (before blueprints)
  const v8 = { ...doc, v: 8, game: { ...doc.game } }; delete v8.game.blueprints; delete v8.game.nextBlueprintId;
  v8.game.buildings = v8.game.buildings.map(({ blueprint, ...b }) => b);
  const m = migrateSave(v8); assert.deepEqual(m.doc.game.blueprints, []); assert.equal(m.from, 8);
  assert.deepEqual(loadSave(v8).state.blueprints, {});
  // a damaged library: the broken version is dropped, its building keeps standing as a plain bakery
  const broken = JSON.parse(JSON.stringify(doc)); broken.game.blueprints[0].versions[0].parts = [];
  const r = loadSave(broken);
  assert.ok(r.state.buildings[placed.id], 'the building is kept'); assert.equal(r.state.buildings[placed.id].blueprint, undefined);
  assert.ok(r.warnings.some(w => /invalid design/.test(w)) && r.warnings.some(w => /drawn as a bakery/.test(w)));
});
