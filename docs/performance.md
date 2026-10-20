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
| Materials | rendering/three/texArrays.js: every plain matte material (a painted canvas map, or a flat colour stored as a solid layer) becomes a layer of one texture array per texture size (64², 128², 256², 64×128, 128×64); merged geometry carries its layer per vertex (`texLayer`). Chunks of buildings and roads and the villa fences draw one mesh per array instead of one per colour, whatever the palette or the number of custom designs. Same pixels, mipmaps, wrapping and anisotropy, so a chunk looks exactly like its separate meshes. Glass, lamps, awning valances and shadow blobs keep their own materials. |
| Roads | The layout is cut into pieces keyed by everything that decides their look (presentation/roadLayout.js `roadPieces`). Pieces are baked once per key and merged per 8-unit chunk; an edit bakes only new pieces and re-merges only chunks whose set of pieces changed. Unused pieces are disposed. |
| View events | presentation/viewUpdates.js turns an event batch into one plan: a full rebuild absorbs the batch's other structural events (no duplicate views), otherwise only add/remove/replace/upgrade ops. |
| Villa fences | Each placed group's fence is baked once (merged per material, keyed by its style and runs in world space); a group event rebakes only the groups that changed, then concatenates the cached fences into one mesh per material. `__villa.view.villaStats()` shows how many were rebaked. |
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

### Big town with custom buildings and villas

`node tools/bench.mjs` (the last line builds the same 40×40 plains town with three saved designs and a hedged villa):

| Town | Buildings | Custom | Villas | Build | Snapshot | Tick | Save | Load |
|---|---|---|---|---|---|---|---|---|
| plains | 399 | 0 | 0 | 597 ms | 0.75 ms | 0.74 ms | 0.4 ms (89 KB) | 5 ms |
| plains + designs | 352 | 15 | 17 (68 buildings) | 468 ms | 0.72 ms | 0.77 ms | 0.8–1.1 ms (88 KB) | 4–5 ms |

In the browser (`__villa.bench({ designs: true })`, game paused, animations settled, preview pane at 980×866; draw calls
vary with the smoke puffs and walkers on screen). The texture arrays were checked by rendering the same town with them
off and on and comparing the frames pixel by pixel: the only differences are smoke puffs, swaying trees and a few
coplanar-edge pixels (1.5–1.7 % of pixels differ by more than 2/255; two renders of the unchanged build differ by
1.1–2.0 %). Triangles drawn rise a little near the camera (663 K → 768 K at zoom 1.3): a merged mesh spans its whole
chunk, so frustum culling skips less.

| Measure | Value |
|---|---|
| Draw calls · triangles (whole town in view, zoom 0.55) | 3,074 · 1.16 M before texture arrays; 2,480–2,740 · 1.07–1.12 M on the same build with arrays off → **550–650 · 1.08 M** |
| Draw calls (default zoom 1.3, centred) | 750–910 → **230–270** |
| Distinct materials in building chunks | ~220 → 9 (five texture arrays, glass, lamps, valances, shadow blobs) |
| Texture-array layers | 76 (64²), 49 (128²), 59 (256²), 20 (64×128), 9 (128×64); the arrays grow by doubling and keep a CPU copy (~25 MB) for regrowth |
| Moving and turning a villa (4 buildings and its hedge) | ~9.5 ms for the whole event batch (fences 1.1 ms avg, max 1.5 ms — was 5–10 ms; roads 1 ms) |
| Demolishing a custom building | 4.7 ms |
| Road edit | ~1–3 ms (incremental pieces) |
| Placement previews of villas | one dry run per pose change (memoised), never per frame |

## Known bottlenecks

- Per chunk, glass and lamps still draw separately (their glow follows the time of day), as do the outlines, the
  awning valances (cut-out) and the shadow blobs: ~10 draws per chunk. Folding glass and lamps into the arrays with a
  per-vertex glow weight would save two more per chunk.
- Swaying tree crowns in building models (~170) and smoke puffs are drawn one by one.
- The scenery refresh (terrain props hidden under new roads and buildings) still walks the whole map: 3–7 ms.
- Window glow meshes are not batched yet (hidden by day).
