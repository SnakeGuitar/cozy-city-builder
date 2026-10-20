// Architecture guard: the rules must stay portable (no engine, no browser APIs) and use explicit imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../src/', import.meta.url).pathname;
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);
const FORBIDDEN = /\b(THREE|three|window|document|localStorage|sessionStorage|performance|requestAnimationFrame|AudioContext|navigator|setTimeout|setInterval|Math\.random)\b/;
const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, '""');

for (const layer of ['core', 'application', 'presentation']) test(`${layer}/ has no engine or browser dependencies`, () => {
  for (const f of files(path.join(root, layer))) {
    const src = strip(fs.readFileSync(f, 'utf8'));
    const m = src.match(FORBIDDEN); assert.equal(m, null, `${path.relative(root, f)} uses ${m && m[0]}`);
    for (const imp of fs.readFileSync(f, 'utf8').matchAll(/from '([^']+)'/g)) assert.ok(imp[1].startsWith('.'), `${f} imports ${imp[1]}`);
    if (layer === 'core') for (const imp of fs.readFileSync(f, 'utf8').matchAll(/from '([^']+)'/g)) assert.ok(!/application|rendering|ui|platform/.test(imp[1]), `${f} reaches outward: ${imp[1]}`);
  }
});

test('every source module declares its dependencies with import (no concatenation globals)', () => {
  for (const f of files(root)) {
    const src = fs.readFileSync(f, 'utf8');
    if (/\bTHREE\./.test(src)) assert.match(src, /import \* as THREE from 'three'/, `${path.relative(root, f)} uses THREE without importing it`);
  }
});

test('layers only depend inward: rendering and ui never reach platform; rendering never reaches ui', () => {
  const rules = { rendering: /\/(ui|platform|application)\//, ui: /\/platform\//, application: /\/(ui|platform|rendering|presentation)\//, presentation: /\/(ui|platform|rendering|application)\// };
  for (const [layer, bad] of Object.entries(rules)) for (const f of files(path.join(root, layer)))
    for (const imp of fs.readFileSync(f, 'utf8').matchAll(/from '([^']+)'/g)) assert.ok(!bad.test(imp[1]), `${path.relative(root, f)} imports ${imp[1]}`);
});
