// World and clock constants plus the layout of a new game. Pure data.
export const GRID_SIZE = 24;
export const DAY_LENGTH = 300;   // simulated seconds per day
export const TICK_SECONDS = 1;   // the simulation advances in fixed 1-second steps
export const SPEEDS = Object.freeze([1, 2, 3]);

// A new game starts with an empty map: no café, roads, homes or decoration. The player places the café first.
export const NEW_GAME = Object.freeze({ coins: 600, population: 0, employed: 0, demand: { r: 30, c: 0, i: 10 }, time: .3, day: 1, speed: 1, rngSeed: 0x5eed1e });
