# Custom buildings: blueprints and the building editor

Players design their own buildings from modules (walls, roofs, doors, windows, awnings, balconies, signs, garden
pieces…), save them as versioned blueprints and build them in town like any catalogue entry.

## Data model (core)

| Piece | Where | What |
|---|---|---|
| Module library | `core/config/modules.js` | Pure data: category, search tags, default/min/max size, allowed anchors, price, complexity weight, `entrance`, `roof`, colour, variants. Module ids are persisted. |
| Blueprint | `core/domain/blueprint.js` | `{ schema, id, version, name, baseType, seed, parts, nextPartId }`. A part is `{ id, module, parent, anchor, offset, rotation, size, color, variant }`. |
| Library in the game | `state.blueprints` | `{ [id]: { id, name, latest, versions: { [n]: blueprint } } }`. Versions are immutable once saved. |
| Custom building | `state.buildings[id].blueprint` | `{ id, version }` — the exact version it was built from. |

**Parametric attachments.** A part hangs on an anchor: `ground` (the lot), `top` (on its parent) or one of its
parent's faces (`front`, `right`, `back`, `left`). Offsets are expressed in the anchor's frame, so when a wall is
moved, turned or resized, everything hanging from it follows: a window stays on its face, a roof stays on top.
`resolveParts` computes every part's pose from these parameters; `offsetForPose` is its exact inverse (what a gizmo
produces). Nothing is ever baked into the blueprint: renderers draw it from the parameters (non-destructive).

**Rules.** A custom building borrows everything that matters to the simulation from its *base type* (a catalogue
entry): kind, footprint, jobs, capacity, tiers, effects. The design adds its parts' price on top of the base price
(`blueprintCost`). Demolition refunds half of everything paid, design included. Placement turns the building so its
*entrance* faces the street (not necessarily the local front).

**Validation at the boundary** (`validateBlueprint`). Errors block saving and building; warnings do not. Every issue
names the part and has a message and a "how to fix" text in the UI.

| Code | Level | Meaning |
|---|---|---|
| `empty`, `name`, `baseType` | error | nothing to build / no name / not a valid base type |
| `tooManyParts`, `tooComplex`, `tooDeep` | error | limits: 80 parts, 260 complexity points, 6 levels of nesting |
| `anchor` | error | the module cannot hang there (a roof on the ground, a window on top…) |
| `outsideLot` | error | the part leaves the base type's square footprint |
| `tooTall` | error | above 3.2 units |
| `noEntrance` | error | homes, shops, industry and services need a door, shopfront or gate |
| `overhang` | warning | a face part sticks out of its face |
| `noRoof` | warning | a building kind without a roof part |

`normalizeBlueprint` sanitises untrusted data (saves, drafts): unknown modules, broken or circular parent chains
are dropped, numbers clamped to the module's limits, colours checked. `migrateBlueprint` runs per-blueprint schema
migrations (schema 1 is the first; a newer schema is refused, never guessed).

## Commands

| Command | Effect |
|---|---|
| `SaveBlueprint { blueprint, asNew? }` | Validates, then stores a new entry (`bp1`, `bp2`…) or the next version of an existing one (same base type required). An unchanged design is not saved again. Rejections carry the validation `issues`. |
| `DeleteBlueprint { id }` | Refused with `inUse` (and the users) while any building or villa references any version. |
| `PlaceBuilding { blueprint: { id, version? }, … }` | Builds a custom building from a version (latest by default). |
| `RemodelBuilding { id, version }` | Switches a custom building to another version of its design; a dearer one costs the difference, a cheaper one refunds half of it. Same footprint and rules. |

## Saves

Save v9 adds `game.blueprints` (a list of entries, versions in order) and `game.nextBlueprintId`; each custom
building stores `blueprint: { id, version }`. The v8 → v9 migration gives older towns an empty library. On load, each
version is migrated, normalised and validated; a damaged version is dropped with a warning and its buildings keep
standing as their base type (the reference is removed), so a damaged library never breaks a town.

## The editor

Three layers, as everywhere else:

- `application/blueprintEditor.js` — the model: a draft, a selection and an undo/redo stack of reversible commands.
  One gizmo drag or one typed number is one undo step (merge keys per gesture). Every change autosaves the draft
  through the storage port; `recoverDraft` brings it back after a crash or a closed tab (validated like a save).
- `rendering/three/editorView.js` — the preview with its own renderer, camera (orbit) and light: the lot with its
  footprint outline (dashed red when something is outside), the entrance arrow, the street-side strip, solid outlines
  for the selection and dashed outlines for problems, move / turn / resize gizmos (`TransformControls`) with
  configurable snapping, day/night, side-by-side comparison with the saved version and thumbnails. Parts are rebuilt
  only when their look changes (`partSignature`); otherwise they are just moved.
- `ui/dom/editor.js` — the screen: searchable, filterable module library; part tree; inspector (parent, anchor,
  position, turn, size, colour, look); checks with explanations and "show" buttons; confirmations for discarding
  changes and deleting a design; keyboard shortcuts.

The editor is a navigation screen (`'editor'`): the town is paused and not drawn while it is open.

### Keyboard

| Keys | Action |
|---|---|
| Click / Shift+click | select / add to the selection (preview or part tree) |
| M · T · S | move · turn · resize gizmo |
| Arrows (Alt+↑↓, PgUp/PgDn: up/down) · Shift | nudge the selection by the snap step · finer |
| `[` `]` | turn the selection by the angle snap |
| Ctrl+D · Del | duplicate · remove (with children) |
| Ctrl+Z · Ctrl+Y / Ctrl+Shift+Z | undo · redo |
| Ctrl+A | select every part |
| Esc | close a dialog, or close the editor (asks first when there are unsaved changes) |

## Rendering in town

`rendering/three/blueprintModel.js` draws each module with the same modelling kit as the catalogue buildings, bakes a
saved version once (merged per material) and caches it by `id@version`; every building of that version shares it.
Thumbnails for the catalogue's "My designs" tab come from a small on-demand renderer that is released when idle.

## Known limits

- The footprint is the base type's square: a design cannot be bigger or smaller than its base type's lot.
- Upgrading a custom building raises its rules' tier; its look stays the design's.
- Designs live in each game's save; there is no cross-game export yet.
