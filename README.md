# Villa Limón

A cozy city builder: place homes from four architectural traditions, connect them to Café Limón,
run services, shops and light industry, and follow residential, commercial and industrial demand.
It runs in the browser with Three.js, and needs no install to play.

The game opens on a main menu (continue, new game, sandbox, settings, language, credits). A new game starts
on an empty map: Limoni, the town's fox mascot, guides you to place the free café, a path and your first home.
Sandbox mode has everything unlocked and nothing costs; it is saved apart from the normal game.

## Controls

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Pan | Drag, or WASD / arrow keys | One finger (when no road or demolish tool is active) |
| Orbit 360° | Right-drag, middle-drag or Alt + drag; Q / E turn 15° | Two-finger twist |
| Zoom | Wheel | Pinch |
| Tilt | Shift + wheel (also changes with orbit drags) | — |
| Isometric ⇄ 3D perspective | V or the cube button | Cube button |
| Reset camera | C or the target button | Target button |
| Build / place | Pick in the catalogue, click the map; R turns the building | Tap |
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
    config/      catalogue (DEFS), economy constants, goals, world size, new-game layout
    domain/      state shape, buildings, grid, footprints, placement rules
    simulation/  roads, effects, housing, jobs, utilities, services, wellbeing, commerce, industry, finance, demand
    goals/       goal metrics, rewards, unlocks
    config/rules.js GameRules for 'normal' and 'sandbox' (costs, money, unlocks, goals, tutorial)
    commands/    PlaceBuilding, MoveBuilding, RotateBuilding, DemolishBuilding, SetSpeed, TogglePause, TutorialSignal
    tutorial/    first-steps tutorial (which line the mascot should say)
    mascot/      advice rules and their rate limits
    persistence/ save documents, validation, migrations v1 → v2 → v3 → v4
  application/   createGame() (game controller), navigation (menu states), createApp() (slots, sessions)
  presentation/  engine-neutral camera model/controller and touch/mouse gesture interpreter
  rendering/three/ scene, camera, models, building views (Map<id, Object3D>), roads, ambient life, overlays
  ui/            interaction (tools and selection) and dom/ (menu, Limoni, panels, catalogue, HUD, strings in 5 languages)
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

Two independent slots in `localStorage`: `villa-limon` (normal game) and `villa-limon-sandbox`. The active game
saves every 5 seconds, after changes, when you return to the main menu and when the page closes. Each save records
its mode and its camera. Global settings (language, sound, mascot, camera smoothing) live in `villa-limon-settings`.
Saves are versioned JSON (`v: 4`); v3, v2 and Strawberry Borough (v1) saves migrate on load without losing buildings.
