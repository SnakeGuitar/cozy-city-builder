// Player commands. Every rule about what the player may do (unlocks, money, space, the café) lives here.
// executeCommand mutates only the state it is given and returns { ok, reason?, events }.
import { DEFS, ECON, LANDMARK, isRoadType } from '../config/catalog.js';
import { SPEEDS } from '../config/world.js';
import { rulesFor } from '../config/rules.js';
import { autoFace, canPlace, insertBuilding, occupy, release, removeBuilding } from '../domain/grid.js';
import { unlockedTypes } from '../goals/goals.js';
import { nextRandom } from '../util/random.js';

export const CMD = Object.freeze({ Place: 'PlaceBuilding', Move: 'MoveBuilding', Rotate: 'RotateBuilding', Demolish: 'DemolishBuilding', SetSpeed: 'SetSpeed', TogglePause: 'TogglePause', TutorialSignal: 'TutorialSignal' });
/** Commands that change the map (the application recomputes the town after them). */
export const STRUCTURAL = new Set([CMD.Place, CMD.Move, CMD.Rotate, CMD.Demolish]);

const reject = (cmd, reason) => ({ ok: false, reason, events: [{ type: 'command_rejected', command: cmd.type, reason }] });
const coinsEvent = (state, delta) => ({ type: 'coins_changed', coins: state.coins, delta });
export const refundOf = type => Math.floor(DEFS[type].cost * ECON.refundRate);
/** What a building costs / returns under the state's rules (sandbox: nothing). */
export const costFor = (state, type) => rulesFor(state).buildCostsEnabled ? DEFS[type].cost : 0;
export const refundFor = (state, type) => rulesFor(state).refundsEnabled ? refundOf(type) : 0;
export const canAfford = (state, type) => rulesFor(state).unlimitedMoney || state.coins >= costFor(state, type);

function chooseRotation(state, type, x, y, cmd, fallback) {
  if (isRoadType(type)) return 0;
  const r = Number.isInteger(cmd.r) ? ((cmd.r % 4) + 4) % 4 : fallback;
  return cmd.autoFace === false ? r : autoFace(state, type, x, y, r);
}
/** The seed the next placement will get (lets a preview show the right visual variant). Pure. */
export const peekSeed = state => Math.floor(nextRandom(state.rngSeed).value * 1e6);
function drawSeed(state) { const r = nextRandom(state.rngSeed); state.rngSeed = r.seed; return Math.floor(r.value * 1e6); }

const handlers = {
  [CMD.Place](state, cmd) {
    const { buildingType: type, x, y } = cmd, d = DEFS[type];
    if (!d) return reject(cmd, 'unknown');
    if (!unlockedTypes(state).has(type)) return reject(cmd, 'locked');
    if (d.unique && Object.values(state.buildings).some(b => b.type === type)) return reject(cmd, 'unique');
    const why = canPlace(state, type, x, y); if (why) return reject(cmd, why);
    if (!canAfford(state, type)) return reject(cmd, 'notEnough');
    const r = chooseRotation(state, type, x, y, cmd, 0);
    const seed = Number.isInteger(cmd.seed) && cmd.seed >= 0 ? cmd.seed : drawSeed(state);
    const cost = costFor(state, type);
    state.coins -= cost;
    const b = insertBuilding(state, type, x, y, r, seed);
    const events = [{ type: 'building_placed', id: b.id, buildingType: type, x, y, r, seed }];
    if (cost) events.push(coinsEvent(state, -cost));
    return { ok: true, id: b.id, events };
  },
  [CMD.Move](state, cmd) {
    const b = state.buildings[cmd.id]; if (!b) return reject(cmd, 'missing');
    const why = canPlace(state, b.type, cmd.x, cmd.y, b.id); if (why) return reject(cmd, why);
    const from = { x: b.x, y: b.y, r: b.r };
    release(state, b); b.x = cmd.x; b.y = cmd.y; b.r = chooseRotation(state, b.type, cmd.x, cmd.y, cmd, b.r); occupy(state, b);
    return { ok: true, id: b.id, events: [{ type: 'building_moved', id: b.id, buildingType: b.type, from, x: b.x, y: b.y, r: b.r }] };
  },
  [CMD.Rotate](state, cmd) {
    const b = state.buildings[cmd.id]; if (!b) return reject(cmd, 'missing');
    b.r = (b.r + 1) % 4;
    return { ok: true, id: b.id, events: [{ type: 'building_rotated', id: b.id, r: b.r }] };
  },
  [CMD.Demolish](state, cmd) {
    const b = state.buildings[cmd.id]; if (!b) return reject(cmd, 'missing');
    if (b.type === LANDMARK) return reject(cmd, 'cafeHeart');
    const refund = refundFor(state, b.type);
    state.coins += refund; removeBuilding(state, b);
    const events = [{ type: 'building_removed', id: b.id, buildingType: b.type, x: b.x, y: b.y, refund }];
    if (refund) events.push(coinsEvent(state, refund));
    return { ok: true, id: b.id, events };
  },
  [CMD.SetSpeed](state, cmd) {
    if (!SPEEDS.includes(cmd.speed)) return reject(cmd, 'badSpeed');
    state.clock.speed = cmd.speed; state.clock.paused = false;
    return { ok: true, events: [{ type: 'clock_changed', speed: cmd.speed, paused: false }] };
  },
  /** A front end reports something the rules cannot see (e.g. 'camera_moved'); the tutorial may advance. */
  [CMD.TutorialSignal](state, cmd) {
    if (typeof cmd.signal !== 'string' || !/^[a-z_]{1,32}$/.test(cmd.signal)) return reject(cmd, 'badSignal');
    if (!state.tutorial.signals.includes(cmd.signal)) state.tutorial.signals.push(cmd.signal);
    return { ok: true, events: [] };
  },
  [CMD.TogglePause](state) {
    state.clock.paused = !state.clock.paused;
    return { ok: true, events: [{ type: 'clock_changed', speed: state.clock.speed, paused: state.clock.paused }] };
  },
};

export function executeCommand(state, cmd) {
  const h = cmd && handlers[cmd.type];
  return h ? h(state, cmd) : reject(cmd || {}, 'unknownCommand');
}
