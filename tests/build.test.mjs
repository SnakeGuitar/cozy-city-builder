// The artifact fragment drops the outer document tags; it must keep everything else (regression: it once ate <header>).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

test('build keeps every page element in both outputs', () => {
  execFileSync(process.execPath, [new URL('../scripts/build.mjs', import.meta.url).pathname], { stdio: 'pipe' });
  const src = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const frag = fs.readFileSync(new URL('../dist/villa-limon.html', import.meta.url), 'utf8');
  const full = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of [...src.matchAll(/ id="([^"]+)"/g)].map(m => m[1])) {
    assert.ok(frag.includes(` id="${id}"`), `fragment lost #${id}`); assert.ok(full.includes(` id="${id}"`), `index.html lost #${id}`);
  }
  assert.match(frag, /<header id="top">[\s\S]*<\/header>/);
  assert.doesNotMatch(frag, /<\/?(html|head|body)(\s[^>]*)?>/i);
  assert.doesNotMatch(frag, /src="\.\/platform/, 'the module is inlined');
});
