# Architecture

Villa Limón is split so that the rules of the game never depend on how it is drawn or played.

```
platform/web ──► ui ──► application ──► core
      │           │          ▲
      └──► rendering/three ──┘ (reads core config and helpers; never writes state)
```

Arrows point at what a layer may import. `tests/boundaries.test.mjs` enforces this:
`core/` and `application/` must not mention Three.js, `window`, `document`, `localStorage`,
`performance`, `requestAnimationFrame`, timers, `navigator` or `Math.random`, and may only use relative imports.

## core/ — the rules

Plain data and functions. Everything here could be ported line by line to another language.

| Module | Responsibility |
| --- | --- |
| `config/catalog.js` | `DEFS` (building types, costs, jobs, capacities, effects), kinds, categories, utility use, economy constants, base unlocks. |
| `config/goals.js` | Goals as data: `{ id, reward, unlock, metric, target }`. |
| `config/world.js` | Grid size, day length, tick length, speeds, the new-game layout. |
| `domain/state.js` | The state shape and building records. |
| `domain/grid.js` | Tiles, footprints, `canPlace`, occupy/release, `rectDist`, adjacency, `autoFace`. |
| `simulation/*` | One small system per concern (below). |
| `goals/goals.js` | Goal metrics, progress, rewards, unlocked types. |
| `commands/commands.js` | Player commands and every validation they need. |
| `persistence/save.js` | Save documents, migrations, validation. |
| `util/random.js` | Deterministic random numbers (`nextRandom`, `mulberry32`, `hashString`). |

### State

One JSON-friendly object:

```js
{
  coins, population, employed, demand: { r, c, i },
  clock: { time, day, speed, paused },
  goalsDone: ['g1'], nextId, rngSeed,
  buildings: { [id]: { id, type, x, y, r, seed, well, open } },
  grid: number[]            // tile → building id, always derived from buildings
}
```

- **Persistent**: everything above is saved, except `clock.paused` and `grid` (rebuilt on load).
- **Simulation memory**: `well` and `open` on a building are lagged values the next tick depends on
  (homes are filled in order of last tick's wellbeing; a shop that closed keeps its jobs closed until the next tick).
- **Derived**: everything the UI shows (occupancy, staffing, coverage, income, demand targets and reasons)
  lives in the derived snapshot and is never stored.
- **Presentation**: tool, selection, camera, language, tutorial progress and "new" badges belong to the front end
  and are saved in the save's separate `ui` section.

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
game.dispatch({ type: 'PlaceBuilding', buildingType: 'fr_trad', x: 8, y: 14, r: 0, autoFace: true })
game.dispatch({ type: 'MoveBuilding', id, x, y, r, autoFace })
game.dispatch({ type: 'RotateBuilding', id })
game.dispatch({ type: 'DemolishBuilding', id })
game.dispatch({ type: 'SetSpeed', speed: 2 })
game.dispatch({ type: 'TogglePause' })
```

A command returns `{ ok, reason?, events }`. Rejections (`outside`, `blocked`, `notEnough`, `locked`, `unique`,
`cafeHeart`, `missing`, `badSpeed`, …) cost nothing and also emit `command_rejected`.

Events are plain objects, drained with `game.drainEvents()`:
`building_placed`, `building_moved`, `building_rotated`, `building_removed`, `coins_changed`,
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

- `rendering/three/` — procedural watercolour textures and models (`art.js`, `models/`), scene and light cycle,
  building views keyed by id, merged road mesh, walkers/smoke/petals, overlays and ghost previews, thumbnails.
  Visual randomness stays here.
- `ui/interaction.js` — tools (explore, build, move, demolish), selection and previews. It only *requests*
  changes through commands. Moving is a preview until the drop; the building keeps working meanwhile.
- `ui/dom/` — HUD, catalogue with tradition/era filters, selection panel, city panel, goals, hints, settings,
  world labels and the five string tables.
- `platform/web/` — adapters: `storage.js` (localStorage), `savegame.js`, `audio.js` (Web Audio, starts after a
  user gesture), `input.js` (mouse, touch, wheel, keys) and `main.js` (bootstrap and the `requestAnimationFrame` loop).

## Saves

`{ v: 3, game: { …core state… }, ui: { lang, muted, tips, tut, tab, filt, newT, cam } }`.
`core/persistence/save.js` migrates step by step (`1 → 2 → 3`) and then validates every field:
unknown types, non-integer or out-of-map coordinates, overlapping footprints, bad rotations, duplicate ids,
non-finite numbers and a second café are dropped or normalised with a warning; a missing café is restored.
The `ui` section is opaque to the core and normalised by `ui/dom/index.js`.

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

## Known limits and debt

- The simulation is aggregated: no individual residents, commutes or pipes.
- Fire stations count residents rather than buildings.
- `rendering/three` and `ui/dom` are tested in the browser by hand, not automatically.
- `src/index.html` still carries all styles inline; they could move to a stylesheet if it grows.
- Three.js comes from a CDN import map; an offline build would need it vendored or bundled.
