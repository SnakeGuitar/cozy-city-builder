# Villa Limón

A cozy city builder: place homes from four architectural traditions, connect them to Café Limón,
run services, shops and light industry, and follow residential, commercial and industrial demand.
It runs in the browser with Three.js, and needs no install to play.

The game opens on a main menu (continue, new game, sandbox, settings, language, credits). A new game starts
on an empty map: Limoni, the town's fox mascot, guides you to place the free café, a path and your first home.
Sandbox mode has everything unlocked and nothing costs; it is saved apart from the normal game.

What you can do:

- **Build** homes, shops, industry and services from a catalogue of styles; upgrade them through **three tiers**.
- **Place on a grid or freely**: free mode accepts any position and angle, with snaps to grid steps, road edges and
  neighbours (G switches modes).
- **Draw streets** in seven styles as straight lines, L shapes or curves, with a full preview of the price, slope,
  collisions and whether it reaches the café; edit curves afterwards, demolish piece by piece, undo and redo.
- **Start on generated maps**: biomes (plains, forest, coast, autumn, snow, desert, mixed …) from a seed and a size.
- **Design your own buildings** in the editor: walls, roofs, doors, windows, awnings, balconies, signs and garden
  pieces, with gizmos, snapping, undo/redo, checks that explain how to fix problems and versioned designs.
- **Reuse villas**: frame an arrangement of homes, gardens and paths, save it, and build, move, turn, update or
  demolish copies as one piece.

## Controls

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Pan | Drag, or WASD / arrow keys | One finger (when no road or demolish tool is active) |
| Orbit 360° | Right-drag, middle-drag or Alt + drag; Q / E turn 15° | Two-finger twist |
| Zoom | Wheel | Pinch |
| Tilt | Shift + wheel (also changes with orbit drags) | — |
| Isometric ⇄ 3D perspective | V or the cube button | Cube button |
| Reset camera | C or the target button | Target button |
| Build / place | Pick in the catalogue, click the map; R / Shift+R turn, Ctrl + wheel turns in free mode, G grid ⇄ free | Tap, then ✓ in free mode |
| Place without a pointer | WASD / arrows aim the preview at the middle of the view, Enter places | — |
| Streets (free mode) | Drag a straight line, an L (F flips the corner) or a curve; Ctrl+Z / Ctrl+Y undo and redo | Drag, then ✓ |
| Villas | *My designs → New villa from town*, drag a rectangle; place copies from *My designs* | Same |
| Building editor | *My designs → New design* or ✎ on a design; keys listed in the editor and in `docs/blueprints.md` | Tap to select, drag gizmos |
| Performance overlay | F3 | — |
| Paths, demolition | Click and drag | Hold a finger briefly, then drag |
| Cancel / menu | Right-click or Escape (Escape again opens the pause menu) | Menu button |
| Pause, speed | Space, 1, 2, 3 | Top bar |

Menus work with Tab / arrow keys / Enter and Escape to go back. "Smooth camera" can be turned off in the settings
(it starts off when the system asks for reduced motion).

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

Runs Node's built-in test runner over `tests/`. They need no browser or WebGL: the rules, the app and the camera
run headless, and the camera-picking tests use the `three` dev dependency without rendering.

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
    config/      catalogue (DEFS) and tiers, biomes, module library, economy, goals, world, rules per mode
    domain/      state, geometry (OBB), space (placement, spatial hash), snaps, road graph and planner,
                 terrain, blueprints, villas
    simulation/  roads, effects, housing, jobs, utilities, services, wellbeing, commerce, industry, finance, demand
    goals/       goal metrics, rewards, unlocks
    commands/    every player command, atomic group operations, dry runs
    tutorial/    first-steps tutorial (which line the mascot should say)
    mascot/      advice rules and their rate limits
    persistence/ save documents, validation, migrations v1 → v10
  application/   createGame() (game controller, street undo/redo), navigation, createApp() (slots), the building
                 editor model, the benchmark town
  presentation/  engine-neutral camera, gestures, road layout pieces, walkers, view update plans, perf statistics
  rendering/three/ scene, terrain, models, building/road chunks, custom buildings, villas, editor preview, overlays
  ui/            interaction (tools and selection) and dom/ (menu, Limoni, panels, catalogue, editor, villa dialog,
                 HUD, strings in 5 languages)
  platform/web/  localStorage, Web Audio, input, frame loop and bootstrap (main.js)
tests/           node:test suites and fixtures
tools/           bench.mjs (simulation benchmark), fixture generators
docs/            architecture.md, blueprints.md, villas.md, performance.md, godot-migration.md
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

Two independent slots in `localStorage`: `villa-limon` (normal game) and `villa-limon-sandbox`. The active game
saves every 5 seconds, after changes, when you return to the main menu and when the page closes. Each save records
its mode and its camera. Global settings (language, sound, mascot, camera smoothing) live in `villa-limon-settings`.
Saves are versioned JSON (`v: 10`); every older version, back to Strawberry Borough (v1), migrates on load without
losing buildings (see the table in `docs/architecture.md`). Drafts of the building editor are autosaved under
`villa-limon-blueprint-draft` and offered back after a crash.
