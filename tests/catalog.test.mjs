// Adding a building type touches three places; this test names the one you forgot.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFS, CATS, KINDS, GOALS } from '../src/core/index.js';
import { STR } from '../src/ui/dom/i18n.js';

const modelSrc = ['town', 'houses', 'city'].map(f => fs.readFileSync(new URL(`../src/rendering/three/models/${f}.js`, import.meta.url), 'utf8')).join('\n');

test('every catalogue entry is well formed', () => {
  for (const [id, d] of Object.entries(DEFS)) {
    assert.match(id, /^[a-z_]+$/, id); assert.ok(CATS.includes(d.cat), `${id} category`); assert.ok(KINDS.includes(d.kind), `${id} kind`);
    assert.ok([1, 2].includes(d.s), `${id} size`); assert.ok(d.cost >= 0, `${id} cost`);
    if (d.kind === 'house') assert.ok(d.cap > 0 && d.fam && d.era, id);
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
    if (id !== 'road') assert.match(modelSrc, new RegExp(`^\\s+${id}\\(k`, 'm'), `no model for ${id} in rendering/three/models`);
    for (const lang of Object.keys(STR)) for (const p of ['n_', 'd_']) assert.ok(STR[lang][p + id], `${lang} missing ${p}${id}`);
  }
  for (const lang of Object.keys(STR)) for (const g of GOALS) assert.ok(STR[lang][g.id], `${lang} missing goal ${g.id}`);
});

test('the five languages define the same keys', () => {
  const keys = l => Object.keys(STR[l]).sort();
  for (const l of Object.keys(STR)) assert.deepEqual(keys(l), keys('es'), `${l} differs from es`);
});
