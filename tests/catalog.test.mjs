// Adding a building type touches three places; this test names the one you forgot.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFS, CATS, KINDS, GOALS, FAMS, BASE_UNLOCK, isRoadType } from '../src/core/index.js';
import { STR } from '../src/ui/dom/i18n.js';

const modelDir = new URL('../src/rendering/three/models/', import.meta.url);
const modelSrc = fs.readdirSync(modelDir).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(new URL(f, modelDir), 'utf8')).join('\n');
const roadSrc = fs.readFileSync(new URL('../src/rendering/three/roadMesh.js', import.meta.url), 'utf8');

test('every catalogue entry is well formed', () => {
  for (const [id, d] of Object.entries(DEFS)) {
    assert.match(id, /^[a-z_]+$/, id); assert.ok(CATS.includes(d.cat), `${id} category`); assert.ok(KINDS.includes(d.kind), `${id} kind`);
    assert.ok([1, 2].includes(d.s), `${id} size`); assert.ok(d.cost >= 0, `${id} cost`);
    if (d.kind === 'house') assert.ok(d.cap > 0 && FAMS.includes(d.fam) && d.era, id);
    if (d.kind === 'road') assert.ok(d.road && d.road.width > 0 && d.road.width <= 2 && typeof d.road.look === 'string', `${id} street style`);
    if (d.kind === 'shop') assert.ok(d.jobs && d.cust && d.goods, id);
    if (d.kind === 'industry') assert.ok(d.jobs && d.out, id);
    if (d.kind === 'service') assert.ok(d.svc && d.cap && d.r && d.upkeep, id);
    if (d.kind === 'utility') assert.ok(d.util && d.cap && d.upkeep, id);
    for (const f of d.fx || []) { assert.ok(['well', 'inc'].includes(f.k) && f.r > 0 && f.max > 0, `${id} fx`); for (const tt of f.t || []) assert.ok(DEFS[tt], `${id} fx target ${tt}`); }
  }
  for (const g of GOALS) for (const u of g.unlock) assert.ok(DEFS[u], `${g.id} unlocks unknown ${u}`);
});

test('every building type has a model and names in all five languages', () => {
  for (const id of Object.keys(DEFS)) {
    if (isRoadType(id)) assert.match(roadSrc, new RegExp(`^\\s+${DEFS[id].road.look}:`, 'm'), `no road look ${DEFS[id].road.look} for ${id} in rendering/three/roadMesh.js`);
    else assert.match(modelSrc, new RegExp(`^\\s+${id}\\(k`, 'm'), `no model for ${id} in rendering/three/models`);
    for (const lang of Object.keys(STR)) for (const p of ['n_', 'd_']) assert.ok(STR[lang][p + id], `${lang} missing ${p}${id}`);
  }
  for (const lang of Object.keys(STR)) for (const g of GOALS) assert.ok(STR[lang][g.id], `${lang} missing goal ${g.id}`);
});

test('the five languages define the same keys', () => {
  const keys = l => Object.keys(STR[l]).sort();
  for (const l of Object.keys(STR)) assert.deepEqual(keys(l), keys('es'), `${l} differs from es`);
});

test('every type can be obtained: in the base set or unlocked by exactly one goal', () => {
  for (const id of Object.keys(DEFS)) {
    const n = GOALS.filter(g => g.unlock.includes(id)).length + (BASE_UNLOCK.includes(id) ? 1 : 0);
    assert.equal(n, 1, `${id} is unlocked ${n} times`);
  }
});

test('the expanded catalogue: street styles, homes, shops and industry', () => {
  const by = kind => Object.keys(DEFS).filter(k => DEFS[k].kind === kind);
  assert.ok(by('road').length >= 8, 'classic street + 7 styles');
  for (const id of ['road_dirt', 'road_cobble', 'road_narrow', 'road_japanese', 'road_asphalt', 'road_avenue', 'road_alley']) assert.ok(isRoadType(id), id);
  for (const id of ['cottage', 'row_house', 'walkup', 'apartments', 'courtyard']) assert.equal(DEFS[id].kind, 'house', id);
  for (const id of ['restaurant', 'tea_house', 'bookshop', 'corner_store', 'covered_market', 'craft_shop']) assert.equal(DEFS[id].kind, 'shop', id);
  for (const id of ['textile', 'sawmill', 'pottery', 'warehouse', 'food_plant', 'studio']) assert.equal(DEFS[id].kind, 'industry', id);
  // balance: denser homes cost more per resident slot only moderately; bigger workplaces give more jobs
  const perCap = id => DEFS[id].cost / DEFS[id].cap;
  for (const id of ['cottage', 'row_house', 'walkup', 'apartments', 'courtyard']) assert.ok(perCap(id) >= 15 && perCap(id) <= 30, `${id} cost per resident ${perCap(id)}`);
  for (const id of by('shop').concat(by('industry'))) if (id !== 'cafe') assert.ok(DEFS[id].cost / DEFS[id].jobs >= 20 && DEFS[id].cost / DEFS[id].jobs <= 70, `${id} cost per job`);
});
