// The application: navigation + one game controller + two save slots (normal and sandbox).
// Engine- and browser-neutral: storage is a small port ({ read, write, remove }); the front end provides the
// per-slot UI data to save (camera, catalogue tab …) through `getSlotUi`.
import { createGame, newGameState } from './game.js';
import { createNavigation, navigate, simulationRunning } from './navigation.js';
import { createSaveDocument, loadSave } from '../core/persistence/save.js';

export const SLOTS = Object.freeze({ normal: 'villa-limon', sandbox: 'villa-limon-sandbox' });
export const LEGACY_SLOTS = Object.freeze({ normal: ['strawberry-borough-v1'], sandbox: [] });

export function createApp({ storage, getSlotUi = () => ({}) }) {
  let nav = createNavigation(), mode = null, slotUi = {};
  const game = createGame({ state: newGameState('normal') }); game.drainEvents();
  const queue = [];
  const setNav = action => { const next = navigate(nav, action); if (next !== nav) { nav = next; queue.push({ type: 'nav_changed', nav }); } };

  /** The save in a slot, or null if absent or unreadable. A slot never yields the other mode. */
  function readSlot(m) {
    for (const key of [SLOTS[m], ...LEGACY_SLOTS[m]]) {
      const raw = storage.read(key); if (!raw) continue;
      try { return { ...loadSave(JSON.parse(raw), { expectMode: m }), key }; } catch (e) { queue.push({ type: 'save_rejected', mode: m, key, message: e.message }); }
    }
    return null;
  }
  function begin(m, state, reason, ui = {}) {
    mode = m; slotUi = ui; game.replaceState(state, reason);
    queue.push({ type: 'session_started', mode: m, reason, ui });
    if (reason === 'new') save();
    setNav({ type: 'start' });
  }
  function save() { if (!mode) return false; return storage.write(SLOTS[mode], JSON.stringify(createSaveDocument(game.getSnapshot().state, { ...slotUi, ...getSlotUi() }))); }

  const app = {
    game,
    get nav() { return nav; }, get mode() { return mode; },
    hasSave: m => readSlot(m) !== null,
    /** Continue the last normal game. */
    continueGame() { const s = readSlot('normal'); if (!s) return false; begin('normal', s.state, 'load', s.ui); queue.push({ type: 'save_loaded', mode: 'normal', from: s.from, warnings: s.warnings }); return true; },
    /** New empty game; asks first if it would overwrite a save of that mode (unless confirmed). */
    newGame(m = 'normal', { confirmed = false } = {}) {
      if (!confirmed && app.hasSave(m)) { setNav({ type: 'ask', confirm: { id: 'overwrite', mode: m } }); return false; }
      begin(m, newGameState(m), 'new'); return true;
    },
    /** Sandbox: open the sandbox save, or start an empty one. */
    openSandbox() { const s = readSlot('sandbox'); if (s) { begin('sandbox', s.state, 'load', s.ui); return true; } return app.newGame('sandbox'); },
    /** Answer the open confirmation dialog. */
    confirm(yes) { const c = nav.confirm; setNav({ type: 'cancel_confirm' }); if (yes && c?.id === 'overwrite') return app.newGame(c.mode, { confirmed: true }); return false; },
    /** Save the session and go back to the main menu (no reload). */
    toMainMenu() { save(); setNav({ type: 'to_main_menu' }); },
    save,
    navigate: setNav,
    /** Advance real time; the world only moves while playing. Returns the number of ticks run. */
    frame(realSeconds) { return simulationRunning(nav) ? game.step(realSeconds) : 0; },
    /** App events (navigation, sessions, saves) followed by game events. */
    drainEvents() { const a = queue.splice(0, queue.length); return a.concat(game.drainEvents()); },
  };
  return app;
}
