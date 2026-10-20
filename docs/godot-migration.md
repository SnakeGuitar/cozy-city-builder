# Moving Villa Limón to Godot (plan, not done)

This document describes how the current code base would move to Godot 4. Nothing here has been implemented.
The refactor made it possible: the rules live in `src/core` and `src/application` with no engine, browser or
DOM dependencies, and every front-end concern sits behind a small adapter.

## 1. Port almost directly (GDScript or C#)

These modules are plain data and functions. Port them one by one and run the same scenarios against them.

| Web module | Godot target | Notes |
| --- | --- | --- |
| `core/config/catalog.js`, `goals.js`, `world.js` | `Resource` files (`.tres`) or one `catalog.json` loaded at start | Keep the type ids (`fr_trad`, `cafe`, …) exactly. |
| `core/domain/state.js` | A `GameState` class or `Dictionary` | Same fields as `serializeGame()`. |
| `core/domain/grid.js` | Static functions on a `Grid` script | `PackedInt32Array` for the tile grid. |
| `core/simulation/*.js` | One script per system, same names | Each takes inputs and returns a `Dictionary`; keep them pure. |
| `core/goals/goals.js` | `Goals` script | Metrics are a name → `Callable` table. |
| `core/commands/commands.js` | `Commands` script | Same command names and rejection reasons. |
| `core/persistence/save.js` | `SaveFormat` script | Same JSON; keep the migration chain. |
| `core/util/random.js` | Port `nextRandom` exactly (32-bit integer math with masks) | Same seed → same building seeds. |
| `core/config/rules.js` | `GameRules` resources (`normal.tres`, `sandbox.tres`) | Keep the six flags; ask `rules_for(state)` in the same four places. |
| `core/tutorial/tutorial.js` | `Tutorial` script; steps as an array of dictionaries with `Callable` checks | Same step ids and message ids. |
| `core/mascot/advisor.js` | `Advisor` script | Same cooldowns in simulated seconds. |
| `application/game.js` | An autoload singleton `Game` (Node) | Owns the state, the event queue and the clock accumulator. |
| `application/navigation.js` | `Navigation` script, or a small state chart | Same screens; only `playing` runs `_process` ticks. |
| `application/app.js` | Autoload `Session` | Two slots: `user://villa-limon.json`, `user://villa-limon-sandbox.json`. |
| `presentation/camera/model.js` | `CameraState` resource + pure functions | Same limits; drive a `Camera3D` from the visual state. |
| `presentation/input/gestures.js` | Logic inside the input handler | Godot gives `InputEventMagnifyGesture`/`InputEventPanGesture`; keep the "multi-touch never builds" rule. |

How to check the port:

- Export `tests/fixtures/scenario.mjs` to JSON and replay it in a Godot test (GUT or a headless script).
- Compare every checkpoint with `tests/fixtures/characterization.golden.json`. JavaScript numbers are
  64-bit floats; use `float` (64-bit in GDScript) and the same operation order to match within 1e-9.
- Port the unit tests in `tests/` the same way; they are short and use only the public core API.

Watch for: `Math.round` (JS rounds .5 up; use `floor(x + 0.5)`), integer division, and `Array.sort` stability
(JS sort is stable; Godot's `sort_custom` is not guaranteed stable, so add the id as a tie-breaker, which most comparators here already do).

## 2. Replace the web adapters

| Web adapter | Godot replacement |
| --- | --- |
| `platform/web/storage.js` + `savegame.js` | `FileAccess` in `user://villa-limon.json` (same JSON document). |
| `platform/web/audio.js` (Web Audio synth) | `AudioStreamPlayer` nodes with short samples, or `AudioStreamGenerator` for the same synth. |
| `platform/web/input.js` | `_unhandled_input` plus Input Map actions (`pan`, `zoom`, `rotate_view`, `rotate_building`, `cancel`, `pause`, `speed_1..3`, `demolish`). |
| `platform/web/main.js` frame loop | `_process(delta)` on the `Game` autoload: `game.step(min(delta, 0.05))`. |
| `ui/dom/*` | `Control` scenes: HUD, catalogue (`ItemList`/`GridContainer`), selection panel, city panel, goals, hints, settings. |
| `ui/dom/i18n.js` | `TranslationServer` with a `.csv` or `.po` per language, same keys (including Limoni's `m_*` lines). |
| `ui/dom/menu.js` | A `MainMenu` scene (Continue, New game, Sandbox, Settings, Credits) with focus neighbours for keyboard/gamepad. |
| `ui/dom/mascot/*` | A `Limoni` scene: `AnimatedSprite2D`/`AnimationPlayer` with one animation per mood (`wave`, `happy`, `point`, `think`, `cheer`, `alert`) and a speech `RichTextLabel`. Replace `assets.js` by this scene; keep `nameKey` and moods. |
| `rendering/three/cameraRig.js` | `Camera3D` with `projection = PROJECTION_ORTHOGONAL` for iso and `PROJECTION_PERSPECTIVE` for 3D; tween `fov` and distance for the dolly-zoom switch. |
| `ui/interaction.js` | A `ToolController` node: same states and the same calls to `Game.dispatch`. |

## 3. Commands and events → calls and signals

- Commands stay calls: `Game.dispatch({ "type": "PlaceBuilding", "buildingType": "fr_trad", "x": 8, "y": 14, "r": 0, "autoFace": true })`
  returns `{ ok, reason, events }`, exactly as in JavaScript.
- Events become signals. After each `dispatch` and `step`, drain the queue and emit one signal per event:

| Event | Signal | Typical listeners |
| --- | --- | --- |
| `building_placed` | `building_placed(id, type, x, y, r, seed)` | World (spawn scene), audio |
| `building_moved` / `building_rotated` | `building_moved(id, …)` / `building_rotated(id, r)` | World |
| `building_removed` | `building_removed(id, type, x, y, refund)` | World, HUD floater, audio |
| `coins_changed`, `population_changed` | same names | HUD |
| `income_earned` | `income_earned(id, amount)` | Floating labels |
| `goal_completed`, `types_unlocked` | same names | Goals panel, catalogue, audio, confetti |
| `clock_changed`, `day_changed`, `tick` | same names | HUD, light cycle |
| `command_rejected` | `command_rejected(command, reason)` | Tooltip, toasts |
| `mascot_message_requested` | `mascot_message(message_id, mood, params, sticky)` | Limoni scene |
| `tutorial_step_completed` | `tutorial_step_completed(step_id)` | Save, analytics |
| `nav_changed`, `session_started` (app) | `screen_changed(screen)`, `session_started(mode, reason)` | Menus, camera restore |
| `state_replaced` | `state_replaced()` | World rebuild |

Keep the payloads as plain values; never pass nodes through the rules.

## 4. Building ids → scenes and resources

- A `BuildingCatalog` resource maps each type id to a `PackedScene`, e.g. `fr_trad → res://buildings/fr_trad.tscn`,
  plus its thumbnail texture. The rules never see it.
- Visual variants: keep `variantOf(type, seed) = seed % VARIANTS[type]` and give each scene a `variant` export
  (colour sets, props). The seed is in the save, so a town looks the same after loading.
- The world view keeps `Dictionary[int, Node3D]` from building id to instance, exactly like
  `rendering/three/buildings.js` keeps `Map<id, Object3D>`.
- Tile ↔ world: `world = Vector3(x - 12 + s/2, 0, y - 12 + s/2)`; rotation `r` is `r × 90°` around Y; the
  model's front faces +Z.

## 5. Saves

The JSON document (`{ v: 4, mode, game, ui }`) needs no change; keep normal and sandbox in separate files. Port `migrateSave` and `normalizeGame` and keep
the version chain; add `4: …` the first time the format changes. Two options for players coming from the web:

1. Import: a menu entry that reads a pasted or uploaded JSON save and runs the same migrations.
2. Fresh start: if browser saves are not worth carrying over.

The `ui` section (language, camera, tutorial flags) can map onto Godot `ConfigFile` settings or stay in the save.

## 6. What has to be rebuilt in Godot

These parts are Three.js-specific and are rebuilt, not ported:

- **Models** (`rendering/three/models/*.js`): procedural code that assembles boxes, prisms, lathes and spheres.
  Either re-model them in Blender from screenshots, or port the kit (`Kit` in `art.js`) to a `@tool` script that
  builds `MeshInstance3D`s with `SurfaceTool`, then bake each to a `.tscn`. Variants become exported properties.
- **Watercolour textures** (`art.js`, canvas 2D): paint them as image files, or generate them once with a
  script and save as `.png`.
- **Ink outlines**: `EdgesGeometry` lines become an inverted-hull outline material or a screen-space outline shader.
- **Materials**: matte Lambert → `StandardMaterial3D` with roughness 1, no specular; window glow via emission
  driven by the day cycle.
- **Light cycle** (`scene.js` `applyDayLight`): the same keyframes on a `DirectionalLight3D` and `WorldEnvironment`,
  with the paper tint as a `CanvasLayer` `ColorRect` in multiply mode.
- **Paper ground and grain**: a textured plane with alpha fade and a full-screen grain overlay.
- **Ambient life** (`ambient.js`): walkers as `MultiMeshInstance3D` following the café road network from the
  derived snapshot (`roads.mainRoads`), smoke and dust with `GPUParticles3D`, petals as a particle system.
- **Overlays**: grid, occupied tiles, footprint, range, relation arcs (`ImmediateMesh` or `Path3D`).
- **Picking**: raycast from the `Camera3D` (orthographic, isometric) to the ground plane and to building colliders.
- **Thumbnails**: a `SubViewport` render per type, or pre-rendered images.

## 7. Newer systems and their Godot counterparts

| Here | In Godot |
| --- | --- |
| Free placement: `position` + `rotation`, OBB collisions in `domain/geometry.js`, spatial hash | Port as-is (plain math). Use `Area3D`/shape queries only for picking, never as the rule. |
| Road graph (`state.roads`: nodes, segments, control points; Catmull-Rom curves) | Keep the graph as data. Draw each chain as a `Path3D` whose `Curve3D` gets the sampled points, and extrude the profile with `CSGPolygon3D` (path mode) for prototypes or an `ArrayMesh` built with `SurfaceTool` per spatial chunk for the shipping version — the same keyed pieces as `presentation/roadLayout.js` `roadPieces`, so edits rebuild only changed chunks. |
| Street planner (`planTrace`), undo/redo snapshots | Port as-is; `RestoreRoads` maps to replacing the graph resource and emitting a signal. |
| Terrain (`map.terrain`: height grid, cell strings) | A `MeshInstance3D` built from the height grid (or a `HeightMapShape3D` for collisions); flora as `MultiMeshInstance3D` per kind; water as one plane with a shader. The generator stays in the core, so maps are identical. |
| Tiers (`DEFS[type].tiers`, `modelIdOf`) | One `PackedScene` per model id (`bakery_t2.tscn`); the tier number is an exported property. |
| Chunk batching of buildings and roads | `MultiMeshInstance3D` for repeated models, or merged `ArrayMesh` per chunk and material, rebuilt when a chunk's member set changes. |
| Blueprints (`domain/blueprint.js`) | Keep the JSON. A `BlueprintBuilder` script instantiates one `Node3D` per part (module scene + size via `scale` or a parametric mesh) at `resolveParts` poses, then bakes the result into a cached `PackedScene` or `ArrayMesh` per `id@version`. |
| Building editor | A separate scene with its own `Camera3D` and `SubViewport`; Godot has no runtime transform gizmo, so port `TransformControls` behaviour as a small gizmo scene (three arrows, a ring, three handles) driving `offsetForPose`; the editor model (`application/blueprintEditor.js`) ports as-is, its autosave goes through `FileAccess` in `user://`. |
| Villas and groups (`domain/villa.js`) | Data stays as is; a placed group is a `Node3D` parent of its building nodes (also tagged with `add_to_group(group_id)`), fences as one merged mesh per group. Atomic commands keep their scratch-copy approach (`state.duplicate(true)`). |
| Events | Signals with the same names (`villa_placed`, `group_moved`, `blueprint_saved` …). |
| Performance overlay (`presentation/perf.js`) | Feed the same summary from `Performance.get_monitor` and `Time.get_ticks_usec`. |

## Suggested order

1. Port `core/` and `application/` and pass the characterization and unit tests headless.
2. Build a grey-box world view: one coloured box per building id, roads as tiles, orthographic camera.
3. Wire HUD, catalogue and tools to `Game.dispatch` and the signals; play a full session.
4. Replace grey boxes with real scenes and the watercolour look, then ambient life, light cycle and audio.
