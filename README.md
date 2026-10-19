# Villa Limón

A cozy city builder: place homes from four architectural traditions, connect them to Café Limón,
run services, shops and light industry, and follow residential, commercial and industrial demand.
It runs in the browser with Three.js, and needs no install to play.

## Requirements

- Node.js 20 or newer (tests and build). Playing in development needs only a static server.
- An internet connection in the browser: Three.js 0.160.0 loads from jsDelivr through an import map.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:8766/>. It serves `src/index.html`, which loads `src/` as native ES modules,
so there is no build step while you work. (ES modules do not load from `file://`; use a server for development.)

To just play, open the built `index.html` in the repository root, directly or from any static host.

## Test

```bash
npm test
```

Runs Node's built-in test runner over `tests/`. The tests import only `src/core` and `src/application`
(plus the string table), so they need no browser, no WebGL and no extra packages.

## Build

```bash
npm run build
```

Bundles everything with esbuild and writes two self-contained pages:
`index.html` (repository root: open it directly or host it anywhere) and `dist/villa-limon.html`
(the same without the outer `<html>/<head>/<body>` tags, for hosts that wrap pages, such as the claude.ai artifact).

`npm run check` runs the tests and the build.

## Source and generated files

| Path | What it is |
| --- | --- |
| `src/index.html` | **Source.** Page markup, styles, icons and the import map. Edit this one. |
| `src/` | **Source.** All game code as ES modules (see the layout below). |
| `index.html` (root) | **Generated** by `npm run build`, self-contained. Never edit; rebuild instead. |
| `dist/` | **Generated** by `npm run build`. Never edit; it is git-ignored. |
| `tests/fixtures/characterization.golden.json` | **Generated** once by `tools/gen-golden.mjs` from the pre-refactor rules. |

## Layout

```
src/
  core/          game rules — plain data and pure functions, no engine or browser APIs
    config/      catalogue (DEFS), economy constants, goals, world size, new-game layout
    domain/      state shape, buildings, grid, footprints, placement rules
    simulation/  roads, effects, housing, jobs, utilities, services, wellbeing, commerce, industry, finance, demand
    goals/       goal metrics, rewards, unlocks
    commands/    PlaceBuilding, MoveBuilding, RotateBuilding, DemolishBuilding, SetSpeed, TogglePause
    persistence/ save documents, validation, migrations v1 → v2 → v3
  application/   createGame(): dispatch, step, getSnapshot, drainEvents, serialize
  rendering/three/ scene, camera, models, building views (Map<id, Object3D>), roads, ambient life, overlays
  ui/            interaction (tools and selection) and dom/ (panels, catalogue, HUD, strings in 5 languages)
  platform/web/  localStorage, Web Audio, input, frame loop and bootstrap (main.js)
tests/           node:test suites and fixtures
docs/            architecture.md, godot-migration.md
```

## Adding a building

1. Add an entry to `DEFS` in `src/core/config/catalog.js` (the key is a permanent id).
2. Add a model function with the same key in `src/rendering/three/models/` (`town.js`, `houses.js` or `city.js`).
3. Add `n_<id>` and `d_<id>` to every language in `src/ui/dom/i18n.js`.
4. Optionally unlock it from a goal in `src/core/config/goals.js`, or list it in `BASE_UNLOCK`.

`npm test` fails with a message naming the missing piece if one of these is forgotten.
The rules pick the building up from its `kind` and numbers; no simulation code changes are needed
unless the building introduces a new kind of rule. See `docs/architecture.md`.

## Saves

The game saves to `localStorage` under `villa-limon` every 5 seconds, after changes and when the page closes.
Saves are versioned JSON (`v: 3`); older Villa Limón (v2) and Strawberry Borough (v1) saves migrate on load.
