# Legacy reference (do not import)

Frozen copies of the pre-refactor rules (`catalog.js`, `sim.js`) exactly as they shipped in Villa Limón v2,
when the game was built by concatenating scripts. They are **not** part of the game or the build.

They exist only so `node tools/gen-golden.mjs` can regenerate `tests/fixtures/characterization.golden.json`,
the recording that `tests/characterization.test.mjs` compares the refactored core against.
The generator applies one documented fix before recording (see docs/architecture.md, "Behaviour changes").
