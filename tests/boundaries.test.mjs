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

// Native ES modules refuse to link when a named import does not exist; the bundler may silently drop unused ones.
// Check every relative named import in src/ against what the target module exports (following export * chains).
test('every named import exists in the module it comes from', () => {
  const cache = new Map();
  function exportsOf(file) {
    if (cache.has(file)) return cache.get(file);
    const names = new Set(); cache.set(file, names);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    for (const m of src.matchAll(/export\s*\{([^}]*)\}(?:\s*from\s*'([^']+)')?/g)) for (const part of m[1].split(',')) { const p = part.trim().split(/\s+as\s+/); if (p[0]) names.add((p[1] || p[0]).trim()); }
    for (const m of src.matchAll(/export\s*\*\s*from\s*'([^']+)'/g)) for (const n of exportsOf(path.resolve(path.dirname(file), m[1]))) names.add(n);
    return names;
  }
  for (const f of files(root)) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'(\.[^']+)'/g)) {
      const target = path.resolve(path.dirname(f), m[2]), have = exportsOf(target);
      for (const part of m[1].split(',')) { const name = part.trim().split(/\s+as\s+/)[0]; if (name) assert.ok(have.has(name), `${path.relative(root, f)} imports ${name} from ${m[2]}, which does not export it`); }
    }
  }
});

// The browser refuses a whole module graph over one syntax error (for example a name declared twice in a scope),
// and rendering modules never load under Node: parse every source file here.
test('every source module parses', async () => {
  const { execFileSync } = await import('node:child_process');
  for (const f of files(root)) {
    try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
    catch (e) { assert.fail(`${path.relative(root, f)} does not parse:\n${String(e.stderr).split('\n').slice(0, 5).join('\n')}`); }
  }
});
