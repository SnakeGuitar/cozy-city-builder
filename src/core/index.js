// Public surface of the rules. Nothing in core/ may import an engine, the DOM or browser APIs.
export * from './config/index.js';
export * from './domain/state.js';
export * from './domain/grid.js';
export * from './simulation/index.js';
export * from './goals/goals.js';
export * from './commands/commands.js';
export * from './persistence/save.js';
export * from './util/random.js';
export { clamp } from './util/math.js';
