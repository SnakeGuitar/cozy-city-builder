# Villas: reusable compositions

A villa is a saved arrangement — homes and custom buildings, patios, gardens, trees and decoration, private paths,
an optional fence with a gate — that can be built again anywhere in one go, and then moved, turned, updated,
duplicated, ungrouped or demolished as a unit.

## How players make one

1. Build the arrangement in town (any mode; the sandbox is handy).
2. *My designs → New villa from town*, then drag a rectangle over it. The tooltip counts what is inside.
3. The dialog shows a picture, the size, the contents, the approximate price and any problem. Choose a name, a
   fence (none, white pickets, hedge, iron railing, low stone wall), the gate side and whether copies use seed
   variants (each copy gets different colours and details) or repeat exactly. Save.
4. The villa appears in *My designs*. Click it, aim (R turns it; grid mode moves in half units), click to build.
   On touch, tap to move the preview and confirm with ✓.

Selecting any building of a placed villa shows the villa's actions: *Move villa*, *Turn villa*, *Duplicate*,
*Save as a new version* (the villa as it stands now, after editing it in town), *Update to vN* (when the villa has a
newer version), *Ungroup* and *Demolish villa* (both ask with a second press).

"Later editing" therefore happens where the player sees the result: edit a placed villa in town, then save it as a
new version; older copies keep their version until updated. The ✎ button on a villa card edits its settings (name,
fence, gate, variants), which also makes a new version, or deletes it.

## Data (core/domain/villa.js)

| Piece | Shape |
|---|---|
| Definition (immutable per version) | `{ schema, id: 'vl1', version, name, size: { w, d }, seed, variants, fence: null \| { style, gate }, items, nextItemId }` |
| Building item | `{ id, kind: 'building', type, blueprint?: { id, version }, position: { x, z }, rotation, seed }` — local to the villa's centre, +z its front |
| Path item | `{ id, kind: 'path', style, shape: 'polyline' \| 'curve', points }` — built through the street planner, so it joins streets it touches |
| Library | `state.villas = { [id]: { id, name, latest, versions } }` |
| Placed villa (group) | `state.groups = { [id]: { id: 'g1', villa: { id, version }, position, rotation, seed, members, segments, fence } }`; each member building has `group` |

`captureVilla` turns a rectangle of the town into a definition (buildings whose footprint is fully inside, road
segments fully inside; never the café). `groupAsVilla` does the same for a placed group as it stands.
`validateVilla` checks names, emptiness, the 60-item limit, items outside the rectangle, overlapping buildings and
custom designs whose version no longer exists; every issue names the item.

## Commands (all atomic)

Villa and group commands run every step on a private copy of the buildings, roads and groups (`scratchOf`) and put
it back only when all of them succeeded (`commitScratch`): a villa is built completely or not at all, a move happens
completely or not at all.

| Command | Effect |
|---|---|
| `SaveVilla { villa, asNew?, fromGroup? }` | Stores a definition or its next version. `fromGroup` makes that group adopt the new version (nothing is rebuilt). |
| `DeleteVilla { id }` | Refused (`inUse`) while a placed group uses it. |
| `PlaceVilla { villa, position, rotation, seed? }` | Builds every item, charging what each would cost built by hand (the aggregate cost). Rejections name the item (`itemId`). Fences may not cut a street (`fenceRoad`) or another building (`fenceBlocked`). |
| `MoveGroup { id, position, rotation }` | Moves/turns the whole villa. Buildings keep their ids, tiers and memory; private paths are rebuilt at the new place without paying again. |
| `UpdateGroup { id, version }` | Rebuilds the villa from another version at the same place (refund of the old, price of the new). |
| `DemolishGroup { id }` | Removes it all, refunding half of what was paid. |
| `Ungroup { id }` | Members become ordinary buildings; the fence goes with the group. |

`dryRun(state, cmd)` runs `PlaceVilla`, `MoveGroup` or `UpdateGroup` on a shadow of the state and reports
`{ ok, reason, cost, itemId }` — the placement preview uses it (memoised per pose and state revision), so the price
and any problem shown before clicking are exactly what the click will do.

Safety for references: a blueprint used by a villa cannot be deleted; a villa used by a placed group cannot be
deleted; demolishing a member removes it from its group (an empty group dissolves). Street undo history is cleared
after a group command, because older street snapshots would no longer match the rebuilt private paths.

## Saves

Save v10 adds `game.villas`, `game.nextVillaId`, `game.groups` and `game.nextGroupId` (v9 → v10 gives older towns
none). Villa versions are migrated, normalised and validated against the loaded blueprint library; groups are checked
against the loaded buildings and roads. A group whose villa is missing is dropped and its buildings stay as ordinary
buildings.

## Rendering

`rendering/three/villaView.js` draws every placed villa's fence (baked per group and cached until its style or runs
change, then merged per material; only group events touch it)
and a whole-villa preview (models, path ribbons, fence) used for the placement ghost, the move ghost and catalogue
pictures.

## Known limits

- A villa's size is its captured rectangle (2–14 units a side), up to 60 items.
- Private paths are tracked by road segment id; editing them by hand (splitting with a crossing street) detaches the
  changed pieces from the group.
- Group operations are not part of the street undo/redo history.
