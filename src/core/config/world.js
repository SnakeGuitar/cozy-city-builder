// World and clock constants plus the layout of a new game. Pure data.
export const GRID_SIZE = 24;
export const DAY_LENGTH = 300;   // simulated seconds per day
export const TICK_SECONDS = 1;   // the simulation advances in fixed 1-second steps
export const SPEEDS = Object.freeze([1, 2, 3]);

export const NEW_GAME = Object.freeze({ coins: 600, population: 4, employed: 2, demand: { r: 30, c: 0, i: 10 }, time: .3, day: 1, speed: 1, rngSeed: 0x5eed1e });

// [type, x, y, rotation, seed] in creation order, so new games always get the same ids
export const START_LAYOUT = Object.freeze((() => {
  const l = [];
  for (let x = 6; x <= 17; x++) l.push(['road', x, 13, 0, x]);
  l.push(['cafe', 10, 11, 0, 1], ['fr_trad', 8, 12, 0, 0], ['mx_cont', 13, 12, 0, 0], ['lamp', 12, 12, 0, 1], ['flowerbed', 9, 12, 0, 0]);
  for (const [x, y, v] of [[7, 11, 0], [14, 11, 2], [9, 10, 1], [13, 10, 0], [6, 14, 0], [16, 14, 2], [7, 12, 2], [15, 12, 0], [12, 9, 1]]) l.push(['tree', x, y, 0, v]);
  l.push(['bench', 11, 14, 2, 1]);
  return l;
})());
