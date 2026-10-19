// Web bootstrap: builds the game from the save (or a new one), the Three.js view, the DOM UI and the input,
// then runs the frame loop. This is the only module that knows about all layers.
import { createGame, newGameState } from '../../application/game.js';
import { mulberry32 } from '../../core/util/random.js';
import { createThreeView, renderThumbnails } from '../../rendering/three/index.js';
import { createInteraction } from '../../ui/interaction.js';
import { createDomUI, normalizePrefs } from '../../ui/dom/index.js';
import { setLanguage } from '../../ui/dom/i18n.js';
import { paintPaper } from '../../ui/dom/hud.js';
import { createLocalStorage } from './storage.js';
import { readSave, writeSave, clearSave } from './savegame.js';
import { createAudio } from './audio.js';
import { bindInput } from './input.js';

const DEFAULT_CAMERA = [.5, .5, Math.PI / 4, 1.3];
const storage = createLocalStorage();
const loaded = readSave(storage);
const prefs = normalizePrefs(loaded?.ui, (navigator.language || 'es').slice(0, 2));
setLanguage(prefs.lang);
const audio = createAudio(prefs.muted);

const stage = document.getElementById('stage');
const view = createThreeView(stage);
const thumbs = renderThumbnails();
paintPaper(mulberry32);
const game = createGame({ state: loaded?.state });
view.rebuild(game.getSnapshot().state, { animate: !loaded });
view.setCamera(prefs.cam || DEFAULT_CAMERA);

let saveTimer = null;
const save = () => writeSave(storage, game.getSnapshot().state, { ...prefs, cam: view.getCamera() });
const requestSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); };
function newGame() {
  clearSave(storage);
  Object.assign(prefs, normalizePrefs({ lang: prefs.lang, muted: prefs.muted, tips: prefs.tips }));
  game.replaceState(newGameState());
  view.setCamera(DEFAULT_CAMERA);
  save();
}

let ui = null;
const interaction = createInteraction({ game, view, onChange: kind => ui && ui.onInteraction(kind) });
ui = createDomUI({ game, view, interaction, prefs, audio, thumbs, onNewGame: newGame, requestSave });
const input = bindInput({ canvas: view.canvas, view, interaction, game, audio, onCameraMoved: () => { prefs.tut.moved = true; } });
game.drainEvents(); // the initial settle is already reflected by rebuild()
ui.applyLanguage(prefs.lang);
if (loaded) ui.welcome(loaded.from); else save();

function resize() {
  view.resize(innerWidth, innerHeight);
  const r = document.documentElement.style;
  r.setProperty('--topH', document.getElementById('top').offsetHeight + 'px');
  r.setProperty('--catH', document.getElementById('catalog').offsetHeight + 'px');
}
{ const ro = new ResizeObserver(resize); ro.observe(document.getElementById('catalog')); ro.observe(document.getElementById('top')); }
addEventListener('resize', resize); resize();
addEventListener('pagehide', save); addEventListener('beforeunload', save);
document.addEventListener('pointerdown', () => audio.init(), { once: true });

// ---------------------------------------------------------------- frame loop (the clock adapter)
let last = performance.now(), clock = 0, autosave = 0, chirp = 6;
function frame(now) {
  const rdt = Math.min(.05, (now - last) / 1000); last = now; clock += rdt;
  const { px, pz } = input.panDirection(); if (px || pz) { view.panKeys(px, pz, rdt); prefs.tut.moved = true; }
  game.step(rdt);
  const events = game.drainEvents(), snap = game.getSnapshot();
  view.applyEvents(events, snap.state);
  ui.onEvents(events);
  const sdt = snap.state.clock.paused ? 0 : rdt * snap.state.clock.speed;
  const light = view.frame(rdt, sdt, clock, snap.state, snap.derived);
  interaction.frame(rdt);
  ui.frame(rdt, light);
  if ((autosave += rdt) > 5) { autosave = 0; save(); }
  if ((chirp -= rdt) < 0) { chirp = 7 + Math.random() * 10; if (view.night < .4) audio.chirp(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// small debugging handle (read-only use from the console and the browser checks)
window.__villa = { game, view, interaction, prefs, save, newGame };
