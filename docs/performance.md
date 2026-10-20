# Performance

How Villa Limón stays responsive on big towns, how to measure it, and the numbers measured so far.

## Measuring

- **Simulation and saves (Node):** `node tools/bench.mjs` builds the benchmark town (application/benchmark.js —
  real commands only: a street grid in four styles, ~400 homes, shops, industry and services at mixed tiers and
  rotations) on three maps and times the map generation, the town, a snapshot, a tick, save and load.
- **Rendering (browser):** press **F3** for the overlay: fps, frame-time p50/p95/max, named sections (`sim`,
  `render`, `events`, `rebuild.*`), draw calls, triangles, live geometries and textures. The debug handle
  `window.__villa.bench()` fills the current sandbox game with the same benchmark town;
  `__villa.view.buildingStats()` and `__villa.view.roadStats()` show what the last update rebuilt.
- `presentation/perf.js` is engine-neutral (a rolling window plus named sections), so a Godot port can feed the
  same summary from its own timers.

## What keeps edits cheap

| Area | Technique |
|---|---|
| Derived data | `state.rev` (structural revision, never saved) keys a per-state cache of the road network and effects; ticks that change nothing structural reuse it (tests/determinism.test.mjs proves cached = recomputed). |
| Effects | Lots are precomputed once per revision and bucketed in a 4-unit grid; candidates keep their original order so results are bit-identical. |
| Buildings | Settled buildings are baked to world space once (`view.baked`) and merged per 8×8 chunk and material. An edit marks one chunk dirty; chunks re-merge within a 6 ms per-frame budget. Animated buildings stay separate until they settle. |
| Roads | The layout is cut into pieces keyed by everything that decides their look (presentation/roadLayout.js `roadPieces`). Pieces are baked once per key and merged per 8-unit chunk; an edit bakes only new pieces and re-merges only chunks whose set of pieces changed. Unused pieces are disposed. |
| View events | presentation/viewUpdates.js turns an event batch into one plan: a full rebuild absorbs the batch's other structural events (no duplicate views), otherwise only add/remove/replace/upgrade ops. |
| Vegetation | InstancedMesh per flora kind; water is one plane. |
| Resources | Only geometry a view created is disposed (`userData.owned`); shared prototypes (models, roadside props, marker shapes) are marked `shared` and never disposed by their users. |

## Measurements

Benchmark town on a 40×40 plains map (399 buildings, 71 road segments), Chromium in the app's preview pane:

| Measure | Before | After |
|---|---|---|
| Snapshot (simulation derive) | 6.85 ms | 0.75–0.97 ms |
| Effects | 5.4 ms | 1.0 ms |
| Building the town (Node) | 1.5 s | 0.57–0.63 s |
| Draw calls | 14,918 | 2,396 |
| Triangles | 2.1 M | 1.36 M |
| Render CPU per frame | ~150 ms | ~33 ms (throttled background pane) |
| Road edit: `rebuild.roads` | 70–98 ms | avg 3.0 ms, max 5.6 ms (1–2 pieces baked, 1–2 chunks merged) |
| Road edit: whole event handling | ~120 ms | 4–10 ms |
| Scenery refresh after an edit | 3–6 ms | 3–7 ms (unchanged) |

An incremental road update was checked against a cold rebuild after demolitions, undo and a new road: the merged
geometry per material is identical (vertex counts and content hashes).

## Known bottlenecks

- ~210 distinct materials remain after chunk merging; consolidating them (vertex colours, a texture atlas) would cut
  draw calls further.
- The scenery refresh (terrain props hidden under new roads and buildings) still walks the whole map: 3–7 ms.
- Window glow meshes are not batched yet (hidden by day).
