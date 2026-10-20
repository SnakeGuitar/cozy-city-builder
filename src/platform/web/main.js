// Web bootstrap: wires the app (navigation + game + save slots), the Three.js view, the camera controller,
// the DOM UI, the menu and the input, then runs the frame loop. The only module that knows every layer.
import { createApp, SLOTS } from '../../application/app.js';
import { simulationRunning, worldVisible } from '../../application/navigation.js';
import { CMD } from '../../core/commands/commands.js';
import { mulberry32 } from '../../core/util/random.js';
import { createCameraController } from '../../presentation/camera/controller.js';
import { createThreeView, renderThumbnails } from '../../rendering/three/index.js';
import { createInteraction } from '../../ui/interaction.js';
import { createDomUI, normalizeSettings, normalizeSlotUi } from '../../ui/dom/index.js';
import { createMenu } from '../../ui/dom/menu.js';
import { setLanguage } from '../../ui/dom/i18n.js';
import { paintPaper } from '../../ui/dom/hud.js';
import { createLocalStorage } from './storage.js';
import { readSettings, writeSettings } from './settings.js';
import { createAudio } from './audio.js';
import { bindInput } from './input.js';

const storage = createLocalStorage();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const settings = normalizeSettings(readSettings(storage, SLOTS.normal), (navigator.language || 'es').slice(0, 2), reducedMotion);
setLanguage(settings.lang);
const saveSettings = () => writeSettings(storage, settings);
const audio = createAudio(settings.muted);

const view = createThreeView(document.getElementById('stage'));
const thumbs = renderThumbnails();
paintPaper(mulberry32);

const slot = normalizeSlotUi({});
let app = null;
const camera = createCameraController({ smooth: settings.smoothCamera, onMoved: () => {
  const s = app && app.game.getSnapshot().state;
  if (s && s.tutorial.step === 'explore' && simulationRunning(app.nav)) app.game.dispatch({ type: CMD.TutorialSignal, signal: 'camera_moved' });
} });
app = createApp({ storage, getSlotUi: () => ({ ...slot, camera: camera.serialize() }) });
const game = app.game;
let saveTimer = null;
const requestSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { app.save(); saveSettings(); }, 400); };

let ui = null;
const interaction = createInteraction({ game, view, onChange: kind => ui && ui.onInteraction(kind), placement: () => slot.place });
ui = createDomUI({ app, view, interaction, camera, settings, slot, audio, thumbs, requestSave });
const playing = () => simulationRunning(app.nav);
const menu = createMenu({ settings, actions: {
  continue: () => app.continueGame(), newGame: () => app.newGame('normal'), sandbox: () => app.openSandbox(),
  settings: () => app.navigate({ type: 'open_settings' }), credits: () => app.navigate({ type: 'open_credits' }),
  back: () => app.navigate({ type: 'back' }), resume: () => app.navigate({ type: 'resume' }), mainMenu: () => app.toMainMenu(),
  restartSandbox: () => app.navigate({ type: 'ask', confirm: { id: 'overwrite', mode: 'sandbox' } }),
  confirmYes: () => app.confirm(true), confirmNo: () => app.confirm(false),
  language: l => { ui.applyLanguage(l); saveSettings(); renderMenu(); },
  sound: () => { audio.init(); settings.muted = !settings.muted; audio.setMuted(settings.muted); saveSettings(); renderMenu(); },
  mascot: () => { settings.mascot = !settings.mascot; ui.mascot.refresh(); saveSettings(); renderMenu(); },
  smooth: () => { settings.smoothCamera = !settings.smoothCamera; camera.smooth = settings.smoothCamera; saveSettings(); renderMenu(); },
} });
function renderMenu() { menu.render(app.nav, { hasNormal: app.hasSave('normal'), hasSandbox: app.hasSave('sandbox'), mode: app.mode }); }
document.getElementById('b-menu').onclick = () => app.navigate({ type: 'pause' });
document.getElementById('b-set').onclick = () => app.navigate({ type: 'open_settings' });
const input = bindInput({ canvas: view.canvas, interaction, camera, game, audio, isPlaying: playing, onTogglePlacement: () => ui.togglePlacement(),
  onEscape: () => { if (app.nav.screen === 'playing') app.navigate({ type: 'pause' }); else if (app.nav.screen !== 'main_menu' || app.nav.confirm) app.navigate({ type: 'back' }); } });

ui.applyLanguage(settings.lang);
renderMenu();

function resize() {
  view.resize(innerWidth, innerHeight);
  const r = document.documentElement.style;
  r.setProperty('--topH', document.getElementById('top').offsetHeight + 'px');
  r.setProperty('--catH', document.getElementById('catalog').offsetHeight + 'px');
}
{ const ro = new ResizeObserver(resize); ro.observe(document.getElementById('catalog')); ro.observe(document.getElementById('top')); }
addEventListener('resize', resize); resize();
addEventListener('pagehide', () => { if (app.nav.screen !== 'main_menu') app.save(); saveSettings(); });
document.addEventListener('pointerdown', () => audio.init(), { once: true });

// ---------------------------------------------------------------- frame loop (the clock adapter)
let last = performance.now(), clock = 0, autosave = 0, chirp = 6;
function frame(now) {
  const rdt = Math.min(.05, (now - last) / 1000); last = now; clock += rdt;
  if (playing()) { const { px, pz } = input.panDirection(); if (px || pz) camera.panKeys(px, pz, rdt); }
  app.frame(rdt);                                   // the world only moves on the 'playing' screen
  const events = app.drainEvents(), snap = game.getSnapshot();
  for (const e of events) {
    if (e.type === 'session_started') { ui.setSlot(normalizeSlotUi(e.ui)); camera.restore(e.ui.camera ?? e.ui.cam); }
    else if (e.type === 'nav_changed') { renderMenu(); if (e.nav.screen === 'main_menu') { interaction.setTool({ kind: 'select' }); interaction.select(0); } }
    else if (e.type === 'save_rejected' || (e.type === 'save_loaded' && e.warnings.length)) console.warn('save:', e);
  }
  view.applyEvents(events, snap.state);
  ui.onEvents(events);
  if (worldVisible(app.nav)) {
    const sdt = playing() && !snap.state.clock.paused ? rdt * snap.state.clock.speed : 0;
    const light = view.frame(rdt, sdt, clock, snap.state, snap.derived, camera.update(rdt));
    interaction.frame(rdt);
    ui.frame(rdt, light);
    if (playing() && (autosave += rdt) > 5) { autosave = 0; app.save(); }
    if (playing() && (chirp -= rdt) < 0) { chirp = 7 + Math.random() * 10; if (view.night < .4) audio.chirp(); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// small debugging handle (read-only use from the console and the browser checks)
window.__villa = { app, game, view, camera, interaction, settings, ui };
