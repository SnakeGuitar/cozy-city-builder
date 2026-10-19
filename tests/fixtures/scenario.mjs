// A representative play-through used by the characterization test. Positions are tiles, r = rotation 0-3.
// start = the layout of a new game, in creation order (ids 1..n follow this order).
const start = [];
for (let x = 6; x <= 17; x++) start.push(['road', x, 13, 0, x]);
start.push(['cafe', 10, 11, 0, 1], ['fr_trad', 8, 12, 0, 0], ['mx_cont', 13, 12, 0, 0], ['lamp', 12, 12, 0, 1], ['flowerbed', 9, 12, 0, 0]);
for (const [x, y, v] of [[7, 11, 0], [14, 11, 2], [9, 10, 1], [13, 10, 0], [6, 14, 0], [16, 14, 2], [7, 12, 2], [15, 12, 0], [12, 9, 1]]) start.push(['tree', x, y, 0, v]);
start.push(['bench', 11, 14, 2, 1]);

const southRoads = [['road', 17, 14, 0, 200], ['road', 17, 15, 0, 201]];
for (let x = 4; x <= 20; x++) southRoads.push(['road', x, 16, 0, 300 + x]);

export const SCENARIO = {
  initial: { coins: 3000, P: 4, E: 2, dem: { r: 30, c: 0, i: 10 }, done: [], nextId: 1 },
  start,
  steps: [
    { check: 'start' },
    { tick: 60, check: 'after 60s' },
    { place: [['jp_cont', 12, 14, 0, 11], ['us_trad', 14, 14, 0, 12], ['bakery', 8, 14, 0, 13]], check: 'first homes placed (no tick yet)' },
    { tick: 120, check: 'after bakery' },
    { place: [['workshop', 9, 14, 0, 14]], tick: 90, check: 'after workshop' },
    { place: southRoads },
    { place: [['mx_trad', 6, 17, 0, 21], ['us_cont', 8, 17, 0, 22], ['jp_trad', 10, 17, 0, 23], ['garden', 12, 17, 0, 24], ['fr_trad', 14, 17, 0, 25], ['fr_cont', 15, 17, 0, 26]], check: 'south street placed' },
    { tick: 120, check: 'south street grows' },
    { place: [['school', 18, 17, 0, 31], ['clinic', 18, 15, 0, 32]], tick: 200, check: 'with school and clinic' },
    { demolish: [[8, 14]], check: 'bakery demolished (no tick yet)' },
    { tick: 60, check: 'after demolition' },
    { place: [['power', 20, 17, 0, 41]], tick: 100, check: 'with substation' },
  ],
};
