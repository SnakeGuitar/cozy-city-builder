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

test('the development page loads its entry module from the server root', () => {
  const src = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const marker = src.match(/<!-- build:main -->[\s\S]*?<script type="module" src="([^"]+)"/);
  assert.ok(marker, 'development module entry is missing');
  const entry = new URL(marker[1], new URL('../', import.meta.url));
  assert.ok(fs.existsSync(entry), `development module does not exist: ${marker[1]}`);
});

test('the development page\'s import map resolves from the server root (npm install provides three)', () => {
  const page = fs.readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const map = JSON.parse(page.match(/<script type="importmap">(.*?)<\/script>/s)[1]).imports;
  for (const [name, target] of Object.entries(map)) assert.ok(fs.existsSync(new URL(target, new URL('../', import.meta.url))), `import map: ${name} → ${target} does not exist (run npm install)`);
});
