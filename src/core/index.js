// Public surface of the rules. Nothing in core/ may import an engine, the DOM or browser APIs.
export * from './config/index.js';
export * from './domain/state.js';
export * from './domain/geometry.js';
export * from './domain/space.js';
export * from './domain/snap.js';
export * from './domain/roadQuery.js';
export * from './domain/roads.js';
export * from './domain/roadPlan.js';
export * from './domain/terrain.js';
export * from './simulation/index.js';
export * from './goals/goals.js';
export * from './commands/commands.js';
export * from './tutorial/tutorial.js';
export * from './mascot/advisor.js';
export * from './persistence/save.js';
export * from './util/random.js';
export { clamp } from './util/math.js';
