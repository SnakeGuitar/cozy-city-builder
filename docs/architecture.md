# Architecture

Villa Limón is split so that the rules of the game never depend on how it is drawn or played.

```
platform/web ──► ui ──► application ──► core
      │           │                        ▲
      ├──► rendering/three ──► presentation ┘   (rendering reads core and presentation; never writes state)
      └──────────────────────► presentation      (camera model, gesture interpreter: no engine, no DOM)
```

Arrows point at what a layer may import. `tests/boundaries.test.mjs` enforces this:
`core/` and `application/` must not mention Three.js, `window`, `document`, `localStorage`,
`performance`, `requestAnimationFrame`, timers, `navigator` or `Math.random`, and may only use relative imports.
`presentation/` follows the same rule and may import only `core/`.

## core/ — the rules

Plain data and functions. Everything here could be ported line by line to another language.

| Module | Responsibility |
| --- | --- |
| `config/catalog.js` | `DEFS` (building types and street styles, costs, jobs, capacities, effects, tier tables), kinds, categories, economy constants, base unlocks; `tierStats`, `investedIn`. |
| `config/tiers.js` | Upgrade ladders (three tiers per upgradable kind) built into `DEFS[type].tiers`. |
| `config/biomes.js` | Biomes, map presets and sizes, generator version, slope and grade limits. |
| `config/modules.js` | Module library for custom buildings (sizes, anchors, prices, complexity) and blueprint limits. |
| `config/goals.js`, `world.js`, `rules.js` | Goals as data; tick/day lengths and the new-game layout; `GameRules` per mode. |
| `domain/state.js` | The state shape, building records, `statsOf`, `bumpRev`. |
| `domain/geometry.js` | Oriented boxes (OBB), separating-axis overlap, angles and quarter turns. |
| `domain/space.js` | Footprints, map bounds, the spatial hash, `canPlace`, `autoFace`, grid quantisation (`tileToPose`). |
| `domain/snap.js` | Free-placement snaps: grid steps, road edges, neighbouring buildings, angle steps. |
| `domain/roads.js`, `roadQuery.js`, `roadPlan.js` | The road graph (nodes, segments with control points), curves, queries, and the street planner (`planTrace`: straight, L and curved traces, snapping, splits, crossings, slope, collisions, price). |
| `domain/terrain.js` | Seeded terrain: heights, water, rocks, biomes and decoration; `heightAt`, `terrainBlocker`. |
| `domain/blueprint.js` | Parametric, versioned custom-building designs (see `docs/blueprints.md`). |
| `domain/villa.js` | Reusable, versioned compositions and placed groups (see `docs/villas.md`). |
| `simulation/*` | One small system per concern (below); `derive.js` caches structure per revision. |
| `goals/goals.js` | Goal metrics, progress, rewards, unlocked types. |
| `commands/commands.js` | Player commands and every validation they need; atomic multi-step operations; `dryRun`. |
| `persistence/save.js` | Save documents, migrations v1 → v10, validation of every field. |
| `util/random.js` | Deterministic random numbers (`nextRandom`, `mulberry32`, `hashString`). |

### State

One JSON-friendly object:

```js
{
  mode, coins, population, employed, demand: { r, c, i },
  clock: { time, day, speed, paused }, goalsDone, nextId, rngSeed, tutorial,
  buildings: { [id]: { id, type, tier, position: { x, z }, rotation, seed, well, open, blueprint?, group? } },
  roads: { nodes, segments, nextNodeId, nextSegmentId },        // the road graph
  map: { size, seed, generatorVersion, biomePreset, terrain },   // terrain stored with the game
  blueprints, nextBlueprintId, villas, nextVillaId, groups, nextGroupId,
  spatial, rev                                                   // derived: spatial hash, structural revision
}
```

- **Persistent**: everything above is saved, except `clock.paused`, `spatial` and `rev`.
- **Simulation memory**: `well` and `open` on a building are lagged values the next tick depends on
  (homes are filled in order of last tick's wellbeing; a shop that closed keeps its jobs closed until the next tick).
- **Derived**: everything the UI shows (occupancy, staffing, coverage, income, demand targets and reasons)
  lives in the derived snapshot and is never stored. `rev` grows on every structural change, so caches of the road
  network and effects (`simulation/derive.js`) know when they are stale.
- **Presentation**: tool, selection, camera, placement preferences, catalogue tab and "new" badges belong to the
  front end and are saved in the save's separate `ui` section.

A building record never holds engine objects. The renderer keeps its own `Map<BuildingId, view>`.

### The simulation contract

```js
computeDerived(state, { mode: 'snapshot' | 'tick' }) // pure: returns a new derived object, never mutates
applyTick(state, derived)                           // commits one simulated second, returns events
commitMemory(state, derived)                        // after a command: commits only lagged memory
```

`computeDerived` runs the systems in order, each with explicit inputs and outputs:

1. `roads` — road tiles that reach the café; which buildings touch them (`connected`).
2. `effects` — neighbourhood bonuses (radius, stacking limit `max`).
3. `housing` — residents fill connected homes, best wellbeing first.
4. `employment` — jobs, workforce, staffing. In `tick` mode employment moves one step (+1 / −1.5).
5. `utilities` — town-wide water, power and waste: supply vs. use.
6. `services` — coverage radius **and** capacity; nearest homes first; saturated services turn homes away.
7. `wellbeing` — base, connection, effects, services, utility shortages.
8. `commerce` — purchasing power shared across shops; excess shops stand vacant.
9. `industry` — production, local sales, exports.
10. `finance` — income per building, taxes, upkeep, net per minute.
11. `demand` — R·C·I as sums of named, bounded terms; the two largest terms are the reasons shown.

`applyTick` then eases demand 8 % toward its target, moves population toward capacity
(never more than about 0.4 residents per tick), pays the net income and stores the memory fields.
Tests prove that computing a snapshot leaves the state byte-for-byte unchanged.

### Commands and events

```js
game.dispatch({ type: 'PlaceBuilding', buildingType: 'fr_trad', position: { x, z }, rotation, autoFace: true })
game.dispatch({ type: 'PlaceBuilding', buildingType: 'fr_trad', x: 8, y: 14, r: 0 })      // grid form, still accepted
game.dispatch({ type: 'PlaceBuilding', blueprint: { id: 'bp1' }, position, rotation })      // a custom building
game.dispatch({ type: 'MoveBuilding', id, position, rotation })    // also RotateBuilding { id, by }, DemolishBuilding { id }
game.dispatch({ type: 'UpgradeBuilding', id })                     // one tier up
game.dispatch({ type: 'BuildRoad', points, style, shape: 'polyline' | 'curve' })  // atomic street trace
game.dispatch({ type: 'DemolishRoad', segmentId })                 // also EditRoad, RestoreRoads (undo/redo)
game.dispatch({ type: 'SaveBlueprint', blueprint })                // also DeleteBlueprint, RemodelBuilding
game.dispatch({ type: 'PlaceVilla', villa: { id }, position, rotation })  // also SaveVilla, DeleteVilla, MoveGroup,
                                                                   // UpdateGroup, DemolishGroup, Ungroup
game.dispatch({ type: 'SetSpeed', speed: 2 })                      // also TogglePause, TutorialSignal
```

A command returns `{ ok, reason?, events }`. Rejections (`outside`, `blocked`, `notEnough`, `locked`, `unique`,
`cafeHeart`, `missing`, `badSpeed`, …) cost nothing and also emit `command_rejected`.

Events are plain objects, drained with `game.drainEvents()`:
`building_placed`, `building_moved`, `building_rotated`, `building_removed`, `building_upgraded`, `building_remodeled`,
`road_built`, `road_removed`, `road_edited`, `roads_replaced`, `road_history`, `blueprint_saved`, `blueprint_deleted`,
`villa_saved`, `villa_deleted`, `villa_placed`, `group_moved`, `group_updated`, `group_removed`, `group_ungrouped`, `coins_changed`,
`population_changed`, `income_earned`, `goal_completed`, `types_unlocked`, `clock_changed`, `day_changed`,
`tick`, `command_rejected`, `state_replaced`.
The renderer, the DOM UI and the audio react to them; none of them carries engine objects or callbacks.

## application/ — the game controller

`createGame({ state })` is the only door into the rules:

| Method | Does |
| --- | --- |
| `dispatch(cmd)` | Runs a command; structural commands re-settle the town (memory + goals). |
| `step(realSeconds)` | Advances the clock by `realSeconds × speed` and runs whole 1-second ticks. Frame-rate independent. |
| `tick()` | Exactly one simulated second (tests and tools). |
| `getSnapshot()` | `{ state, derived }`, read-only. |
| `drainEvents()` | Returns and clears the event queue. |
| `serialize()` | The `game` part of a save. |
| `unlocked()` | Types the player may build. |
| `replaceState(state)` | New game or load; emits `state_replaced`. |

## Front end (web)

- `rendering/three/` — procedural watercolour textures and models (`art.js`, `models/`, tier dressing), scene and
  light cycle, terrain mesh and instanced flora, building views keyed by id and merged per chunk, the road network
  drawn from keyed pieces merged per chunk, texture arrays shared by plain materials so a chunk draws a few meshes
  whatever its colours (`texArrays.js`), custom-building models (`blueprintModel.js`), villa fences and previews
  (`villaView.js`), the building editor's preview (`editorView.js`), walkers/smoke/petals, overlays, thumbnails.
  Visual randomness stays here. `presentation/viewUpdates.js` turns each event batch into a plan of view updates.
- `ui/interaction.js` — tools (explore, build, move, demolish, street drawing and editing, villa framing, placing
  and moving), grid and free placement, selection and previews. It only *requests*
  changes through commands. Moving is a preview until the drop; the building keeps working meanwhile.
- `ui/dom/` — HUD, catalogue with tradition/era filters and "My designs", selection panel (tiers, designs, villas),
  placement bar, street panel, city panel, goals, settings, the building editor (`editor.js`), the villa dialog
  (`villaDialog.js`), world labels and the five string tables.
- `platform/web/` — adapters: `storage.js` (localStorage), `savegame.js`, `audio.js` (Web Audio, starts after a
  user gesture), `input.js` (mouse, touch, wheel, keys) and `main.js` (bootstrap and the `requestAnimationFrame` loop).

## Saves

`{ v: 10, mode, game: { …core state… }, ui: { camera, tab, filt, newT, place } }`. `core/persistence/save.js`
migrates step by step and then validates every field; its header lists what each version added:

| Version | Added |
| --- | --- |
| v4 | explicit mode, tutorial progress |
| v5 | building tiers |
| v6 | continuous positions and rotations (grid cells converted exactly) |
| v7 | the road graph (road cells became nodes and segments) |
| v8 | the map: size, seed, generator version, biome preset and stored terrain |
| v9 | the blueprint library and custom-building references |
| v10 | villas and placed groups |

Unknown types, non-finite numbers, overlapping footprints, duplicate ids, damaged terrain, broken road graphs,
invalid designs and villas, and dangling references are dropped or normalised with a warning; a building whose
design or villa is gone keeps standing as an ordinary building. Fixtures from older versions
(`tests/fixtures/save-v4.json`, the v1–v3 tests) must load with the same buildings. The `ui` section is opaque to the
core and normalised by `ui/dom/index.js`.

## Buildings: free placement and tiers

Buildings stand at a continuous `position` with any `rotation`; collisions use oriented footprints (separating-axis
test) through a spatial hash. The grid mode is a quantisation of the same thing (`tileToPose` / `snapToGrid`), so both
modes share one rule set; distances between lots reproduce the old tile metric exactly. Free placement offers grid
steps, road-edge and neighbour snaps and configurable angle steps. Upgradable kinds have three tiers
(`config/tiers.js`): `UpgradeBuilding` keeps the id, position and memory and changes only the tier, whose numbers
come from `tierStats`; the renderer shows a different model per tier.

## Roads: graph, planner and street tool

Roads are nodes and segments with control points (curves are centripetal Catmull-Rom). `planTrace` plans a whole
stroke — straight, L or curve — on a copy of the graph: it snaps ends to nodes and segments, splits segments where it
joins them, adds junctions at crossings, rejects collisions with buildings, water, rocks and steep grades, and prices
the result. `BuildRoad` adopts the plan as one operation (one price, one undo step). `DemolishRoad` refunds half of
what that piece cost; `EditRoad` moves control points. The game keeps an undo/redo stack of road operations as
graph snapshots (`RestoreRoads`). Connectivity walks the graph from the café; a building is connected when its
footprint is within reach of a main-network piece. The grid street tool still builds cells (nodes linked to their
four neighbours), so old towns migrate unchanged.

## Terrain and biomes

`createMap({ preset, seed, size })` generates heights (fBm noise with a slope-relaxation pass and a flat café
plateau), water by target cover, clustered rocks and biome cells; the result is stored in the save, so a map never
changes when the generator does (`generatorVersion`). The classic preset is the old flat meadow. Placement and roads
ask `terrainBlocker` and the maximum road grade.

## Performance

See `docs/performance.md`: structural caches per revision, chunk batching of buildings and roads, incremental road
pieces, view update plans, ownership-based disposal, the F3 overlay and the benchmark towns.

## Game rules and modes

`core/config/rules.js` defines one `GameRules` record per mode:

| Rule | normal | sandbox |
| --- | --- | --- |
| `unlimitedMoney` (no shortfall, money never changes on ticks, services never "broke") | no | yes |
| `allBuildingsUnlocked` | no | yes |
| `goalsEnabled` | yes | no |
| `tutorialEnabled` | yes | no |
| `buildCostsEnabled` | yes | no |
| `refundsEnabled` | yes | no |

The state carries `mode`; the core asks `rulesFor(state)` in exactly four places: commands (`costFor`, `refundFor`,
`canAfford`, unlocks), goals (`completeGoals`, `unlockedTypes`), the tick (money) and the derived snapshot (`broke`).
The front end reads the same flags through `game.rules()` (∞ coins, "Free" prices, hidden goals, the Sandbox chip).
The rest of the simulation (residents, jobs, commerce, services, utilities, wellbeing) is identical in both modes.

## New games, the café and the tutorial

`createNewGameState(mode)` returns an empty map: no café, roads, homes or decoration. The café is unique and free.
Before it exists there is no main road network, so nothing is connected; visitors' purchasing power (6) only
exists once the café does, and every demand explains `dm_no_cafe`.

`core/tutorial/tutorial.js` lists the steps as data (`explore → place_cafe → first_road → first_home → connect_home`),
each with a pure `done(state, derived)` check, a message id and a mood. `advanceTutorial` moves through satisfied
steps and emits `tutorial_step_completed` and `mascot_message_requested`. The rules cannot see the camera, so the
front end sends `TutorialSignal { signal: 'camera_moved' }`. Progress is saved in `state.tutorial`.
New starter goals `g0` (place the café) and `g0b` (connect a first home) pay 50 each; v3 and older saves get them
marked done on migration so established towns are not paid twice.

## Mascot (Limoni)

| Concern | Where |
| --- | --- |
| When to speak and what (ids, moods) | `core/tutorial/tutorial.js`, `core/mascot/advisor.js`, goal events in `core/goals/goals.js`, session lines in `application/game.js` |
| Rate limiting (simulated seconds, deterministic) | `adviseNow` (45 s between tips, 180 s before repeating one); "no road" reminder after a placement at most every 15 s |
| Words | `m_*` keys in `ui/dom/i18n.js` (5 languages); params are ids (`goalId`, `types`, `buildingType`) translated by the UI |
| Look | `ui/dom/mascot/assets.js`: `MASCOT = { id, nameKey, moods, portrait(mood) }`, original layered SVG |
| Bubble, timing, hiding | `ui/dom/mascot/mascot.js`: tutorial lines are sticky; tips and celebrations show 7 s and give way to the sticky line |
| Animations | CSS in `src/index.html` (`limoni-hop`, `limoni-wave`, `limoni-float`), off under reduced motion |

Events are plain: `{ type: 'mascot_message_requested', messageId, mood, params, reason, sticky? }`.

## Navigation and save slots

`application/navigation.js` is a pure reducer over `main_menu · playing · paused · settings · credits · setup · editor` plus an optional
confirmation dialog. `simulationRunning(nav)` is the one check the frame loop makes; `worldVisible(nav)` decides
whether the 3D town is drawn. No other module asks which menu is open.

`application/app.js` (`createApp({ storage, getSlotUi })`) owns one game controller and two slots:
`villa-limon` (normal, plus the legacy `strawberry-borough-v1` key) and `villa-limon-sandbox`. `continueGame`,
`newGame(mode)` (asks before overwriting), `openSandbox`, `confirm`, `toMainMenu` (saves first), `frame(dt)` (steps the
game only while playing) and `drainEvents`. Switching games swaps the state with `replaceState`; the page never reloads.
A save of one mode found in the other's slot is rejected (`expectMode`), never converted.

## Camera

| Piece | Responsibility |
| --- | --- |
| `presentation/camera/model.js` | Serializable state `{ target: { x, z }, yaw, pitch, zoom, mode: 'iso' \| 'persp', distance }`, limits (pitch 0.2–1.4 rad, zoom 0.55–3.2, target within the map + 2 tiles), pure operations (pan, orbit, zoom, tilt, 15° steps, reset, toggle), serialization and `interpolate`. |
| `presentation/camera/controller.js` | Desired state (what the player asked for) and visual state (what is drawn, eased; snaps when smoothing is off). |
| `presentation/input/gestures.js` | Pointer events → intents (`pan`, `orbit`, `pinch`, `twist`, `paint`, `click`, `cancel`). Multi-touch and drags never click or paint; touch painting waits 140 ms. |
| `rendering/three/cameraRig.js` | Applies a visual state to an orthographic camera (iso) or a perspective camera; the switch is a dolly zoom (field of view 3°→35° while the camera moves in), so the target keeps its size. Rays, ground hits and projection for picking. |
| `platform/web/input.js` | DOM events → gesture intents → controller, interaction, commands. |

The camera is saved in each slot's `ui.camera`; v1–v3 `[x, z, yaw, zoom]` arrays are still understood.
Tests check that a screen point projected from a tile ray-casts back to that tile, in orthographic, perspective and
mid-transition views, for several angles, and that placing through that tile puts the building there.

## The v3 → v4 step

Migration `3 → 4`: mode `normal`, tutorial done, `g0`/`g0b` done. Language, sound and the old "tips" flag move to the
global settings key the first time the new version runs. Repair policy: saves up to v3 always had a café, so one
missing is restored; a v4 game without a café is a legitimate new town and is never touched.

## Characterization test

`tests/characterization.test.mjs` replays a scripted session (placing homes, shops, workshop, a street,
school and clinic, a demolition, a substation; 760 simulated seconds) and compares 11 checkpoints with
`tests/fixtures/characterization.golden.json`, recorded from the pre-refactor rules by
`tools/gen-golden.mjs` (using `tools/legacy-reference/`). Every number matches to 1e-9.

## Behaviour changes

Each change is deliberate and covered by tests.

1. **Service coverage of an empty home.** Before, a home that lost its residents (or its road) kept the
   service coverage it had in an earlier tick, which raised its wellbeing and its priority for new residents.
   It now has no coverage. The golden recording applies the same one-line fix to the legacy rules, so the
   characterization test isolates the refactor from this fix.
2. **Moving.** Before, a building being dragged was removed from the simulation (its homes and jobs vanished
   until the drop). Now `MoveBuilding` is atomic; the drag is only a preview, and the building may overlap its own tiles.
3. **Locked buildings** are rejected by the core, not only hidden by the catalogue.
4. **Building seeds** come from a deterministic RNG stored in the state instead of `Math.random`.
   The catalogue preview uses `peekSeed` so it shows the variant you will get.
5. **Iteration order** is ascending id everywhere. Before it was insertion order, which changed after moves and loads.
6. **Snapshot after a command.** Vacant shops and goods demand use the shops open *now* rather than the flags
   from the previous tick; after the next tick both agree. Employment is capped at the new job count immediately,
   as before.
7. **Saves** keep `well` and `open`, so a reloaded game continues exactly where it stopped.
8. **Panels** redraw only when their content changes, so clicks on their buttons are no longer lost when a tick lands mid-click.
9. **New games start empty** and new starter goals `g0`/`g0b` pay 50 coins each (older saves skip them).
10. **Before the café exists** there are no café visitors in purchasing power, and an empty town's wellbeing term is 0;
    both only matter when there is no café or no home, which never happened before, so the recorded behaviour is unchanged.
11. **The tutorial hints** of v2/v3 (`h_*`) are replaced by Limoni's tutorial and advice; "tips" became "Show Limoni".

## Known limits and debt

- The simulation is aggregated: no individual residents, commutes or pipes.
- Fire stations count residents rather than buildings.
- `rendering/three` (except the camera rig) and `ui/dom` are tested in the browser by hand, not automatically;
  their engine-neutral parts (road pieces, view update plans, the editor model) have unit tests.
- Custom buildings use their base type's square footprint; villas are captured rectangles (see the two docs).
- The twist gesture is applied directly as yaw; there is no two-finger tilt gesture on touch screens.
- `src/index.html` still carries all styles inline; they could move to a stylesheet if it grows.
- Three.js is bundled into the single-file build; the development page loads it from `node_modules` by import map.
