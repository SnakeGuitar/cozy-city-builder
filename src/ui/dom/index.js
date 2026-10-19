// The DOM front end: wires panels and buttons to the game and reacts to core events.
// Reads snapshots, sends commands through the interaction controller or game.dispatch; never edits state.
import { CATS, DEFS, FAMS, ERAS } from '../../core/config/catalog.js';
import { GOALS } from '../../core/config/goals.js';
import { CMD } from '../../core/commands/commands.js';
import { $, ico, bump } from './dom.js';
import { LANGS, STR, setLanguage, t } from './i18n.js';
import { toast } from './toasts.js';
import { createWorldLabels } from './worldLabels.js';
import { renderHud, renderLight } from './hud.js';
import { renderCityPanel } from './cityPanel.js';
import { renderGoals } from './goalsView.js';
import { renderCatalog, affordKey } from './catalog.js';
import { renderSelectionPanel, relationLinks } from './selectionPanel.js';
import { renderSettings } from './settings.js';
import { renderHint } from './hints.js';

/** UI preferences live in the save's `ui` section. Untrusted input is normalised here. */
export function normalizePrefs(ui = {}, fallbackLang = 'es') {
  const tut = ui.tut && typeof ui.tut === 'object' ? ui.tut : {};
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    lang: STR[ui.lang] ? ui.lang : (STR[fallbackLang] ? fallbackLang : 'es'),
    muted: !!ui.muted, tips: ui.tips !== false,
    tut: { moved: !!tut.moved, age: num(tut.age, 0), free: num(tut.free, 0), city: !!tut.city },
    tab: CATS.includes(ui.tab) ? ui.tab : 'homes',
    filt: { fam: [...FAMS, 'all'].includes(ui.filt?.fam) ? ui.filt.fam : 'all', era: [...ERAS, 'all'].includes(ui.filt?.era) ? ui.filt.era : 'all' },
    newT: Array.isArray(ui.newT) ? ui.newT.filter(k => DEFS[k]) : [],
    cam: Array.isArray(ui.cam) && ui.cam.length === 4 && ui.cam.every(Number.isFinite) ? ui.cam : null,
  };
}

export function createDomUI({ game, view, interaction, prefs, audio, thumbs, onNewGame, requestSave }) {
  const labels = createWorldLabels(view);
  const justDone = new Map(), income = new Map();
  let resetArmed = false, tickCount = 0, lastAfford = '', slowTimer = 0;
  const snap = () => game.getSnapshot();
  const activeType = () => ['build', 'move'].includes(interaction.tool.kind) ? interaction.tool.type : null;

  // ---------------------------------------------------------------- render helpers
  const catalog = () => renderCatalog(snap(), prefs, game.unlocked(), thumbs, activeType());
  const settings = () => renderSettings(prefs, resetArmed, settingsActions);
  const panel = () => renderSelectionPanel(snap(), interaction.selected, interaction.confirmDemo, {
    close: () => interaction.select(0), move: () => interaction.startMove(interaction.selected), rotate: () => interaction.rotate(), demolish: () => interaction.demolishSelected() });
  function relations() {
    const s = snap(), id = interaction.selected, links = relationLinks(s, id);
    const anchor = b => view.topOf(b, DEFS[b.type].s > 1 ? -.2 : -.35);
    view.overlays.relations(links.map(([a, b, kind]) => ({ from: anchor(s.state.buildings[a]), to: anchor(s.state.buildings[b]), kind })));
    const perTarget = new Map();
    labels.chips(links.map(([, , kind, html, on]) => { const n = perTarget.get(on) || 0; perTarget.set(on, n + 1); const p = anchor(s.state.buildings[on]); p.y += .35 + n * .32; return { pos: p, html, kind }; }));
  }
  function toolButtons() { $('t-select').classList.toggle('on', interaction.tool.kind === 'select'); $('t-demolish').classList.toggle('on', interaction.tool.kind === 'demolish'); }
  function renderAll() {
    const s = snap();
    renderHud(s, prefs); catalog(); renderGoals(s, justDone, performance.now()); panel(); renderCityPanel(s); renderHint(s, prefs, true); settings();
    labels.badges(s.state, s.derived); relations(); toolButtons();
  }
  function applyLanguage(l) {
    prefs.lang = setLanguage(l); document.documentElement.lang = prefs.lang;
    document.querySelectorAll('[data-i]').forEach(el => el.textContent = t(el.dataset.i));
    document.querySelectorAll('[data-t]').forEach(el => { el.title = t(el.dataset.t); el.setAttribute('aria-label', el.title); });
    renderAll();
  }

  // ---------------------------------------------------------------- buttons
  const settingsActions = {
    language: l => { applyLanguage(l); requestSave(); }, close: () => { $('settings').hidden = true; resetArmed = false; },
    tips: () => { prefs.tips = !prefs.tips; prefs.tut.free = 0; renderHint(snap(), prefs, true); settings(); requestSave(); },
    sound: () => { audio.init(); prefs.muted = !prefs.muted; audio.setMuted(prefs.muted); renderHud(snap(), prefs); settings(); requestSave(); },
    reset: () => { if (!resetArmed) { resetArmed = true; settings(); return; } resetArmed = false; $('settings').hidden = true; onNewGame(); },
  };
  $('tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (!b) return; prefs.tab = b.dataset.cat; audio.click(); catalog(); requestSave(); });
  $('filters').addEventListener('click', e => { const b = e.target.closest('.fchip'); if (!b) return; if (b.dataset.fam) prefs.filt.fam = b.dataset.fam; if (b.dataset.era) prefs.filt.era = b.dataset.era; audio.click(); catalog(); requestSave(); });
  $('items').addEventListener('click', e => {
    const it = e.target.closest('.item'); if (!it) return; audio.init(); const k = it.dataset.type;
    if (!game.unlocked().has(k)) { const g = GOALS.find(g => g.unlock.includes(k)); toast(`${ico('i-lock')} ${t('locked')} · ${t('goals')}: ${g ? t(g.id) : ''}`); return; }
    if (DEFS[k].unique) { const b = Object.values(snap().state.buildings).find(b => b.type === k); if (b) { view.focusBuilding(b); interaction.setTool({ kind: 'select' }); interaction.select(b.id); return; } }
    if (prefs.newT.includes(k)) { prefs.newT = prefs.newT.filter(x => x !== k); requestSave(); }
    interaction.buildType(k); audio.click();
  });
  $('t-select').onclick = () => interaction.setTool({ kind: 'select' });
  $('t-demolish').onclick = () => { interaction.select(0); interaction.setTool({ kind: interaction.tool.kind === 'demolish' ? 'select' : 'demolish' }); };
  $('b-pause').onclick = () => game.dispatch({ type: CMD.TogglePause });
  for (const n of [1, 2, 3]) $('b-s' + n).onclick = () => game.dispatch({ type: CMD.SetSpeed, speed: n });
  $('b-rl').onclick = () => { view.rotate(-1); prefs.tut.moved = true; }; $('b-rr').onclick = () => { view.rotate(1); prefs.tut.moved = true; };
  $('b-snd').onclick = settingsActions.sound;
  $('b-set').onclick = () => { $('settings').hidden = !$('settings').hidden; settings(); };
  $('b-city').onclick = () => { const el = $('city'); el.hidden = !el.hidden; if (!el.hidden) { $('settings').hidden = true; prefs.tut.city = true; renderHint(snap(), prefs); } renderCityPanel(snap()); };
  $('hint-x').onclick = () => { prefs.tips = false; renderHint(snap(), prefs); requestSave(); };

  // ---------------------------------------------------------------- reacting to core events
  function onEvents(events) {
    if (!events.length) return;
    const { state } = snap(); let structural = false, tickHappened = false;
    for (const e of events) switch (e.type) {
      case 'building_placed': structural = true; e.buildingType === 'road' ? audio.tick() : audio.place(); if (prefs.newT.includes(e.buildingType)) prefs.newT = prefs.newT.filter(x => x !== e.buildingType); break;
      case 'building_removed': structural = true; audio.remove(); labels.floater(view.topOf({ type: e.buildingType, x: e.x, y: e.y }, -.45), `${t('refunded', { n: e.refund })} ${ico('i-coin', '')}`, '', 1.4); income.delete(e.id); break;
      case 'building_moved': structural = true; audio.place(); break;
      case 'building_rotated': structural = true; audio.click(); break;
      case 'clock_changed': case 'day_changed': renderHud(snap(), prefs); break;
      case 'income_earned': { const p = income.get(e.id) || { amount: 0, ticks: 3 + Math.random() * 4 }; p.amount += e.amount; income.set(e.id, p); break; }
      case 'population_changed': if (e.delta > 0) { const homes = Object.values(snap().derived.byId).filter(b => b.kind === 'house' && b.occ > 0); if (homes.length) labels.floater(view.topOf(state.buildings[homes[Math.floor(Math.random() * homes.length)].id]), `+1 ${ico('i-pop', '')}`, 'well', 1.4); bump('c-pop'); } break;
      case 'goal_completed': justDone.set(e.goalId, performance.now()); toast(`${ico('i-leaf')} ${t('goalDone')}: ${t(e.goalId)} · +${e.reward} ${ico('i-coin')}`); audio.unlock();
        if (e.goalId === 'g7') setTimeout(() => toast(`<b>${t('town')}</b> ${t('celebrate')}`, 'big', 6000), 1200); requestSave(); break;
      case 'types_unlocked': prefs.newT.push(...e.types.filter(x => !prefs.newT.includes(x))); prefs.tab = DEFS[e.types[0]].cat;
        setTimeout(() => toast(`${ico('i-blossom')} ${t('unlockedX', { x: e.types.map(u => t('n_' + u)).join(', ') })}`, '', 4500), 700); catalog(); break;
      case 'command_rejected': if (e.reason === 'cafeHeart') toast(t('cafeHeart')); else if (e.reason === 'notEnough') $('tip').animate([{ opacity: .4 }, { opacity: 1 }], { duration: 250 }); break;
      case 'state_replaced': income.clear(); justDone.clear(); interaction.select(0); interaction.setTool({ kind: 'select' }); renderAll(); break;
      case 'tick': tickHappened = true; break;
    }
    if (tickHappened) {
      tickCount++;
      for (const [id, p] of income) if ((p.ticks -= 1) <= 0) { p.ticks = 5 + Math.random() * 3; const b = state.buildings[id]; if (b && p.amount >= 1) { labels.floater(view.topOf(b, .2), `+${Math.round(p.amount)} ${ico('i-coin', '')}`); bump('c-coins'); audio.coin(); } p.amount = 0; }
      const s = snap(); renderHud(s, prefs); panel(); renderCityPanel(s);
      if (interaction.selected && tickCount % 4 === 0) relations();
      if (tickCount % 3 === 0) labels.badges(s.state, s.derived);
    }
    if (structural) { const s = snap(); renderHud(s, prefs); panel(); renderCityPanel(s); renderGoals(s, justDone, performance.now()); renderHint(s, prefs); labels.badges(s.state, s.derived); relations(); requestSave(); }
  }
  setInterval(() => renderGoals(snap(), justDone, performance.now()), 1500);

  return {
    renderAll, applyLanguage, onEvents, toast,
    /** Interaction changed tool or selection. */
    onInteraction(kind) { if (kind === 'tool') { catalog(); toolButtons(); } if (kind === 'selection') { panel(); relations(); if (interaction.selected) audio.click(); } },
    frame(dt, light) {
      labels.update(dt); renderLight(light);
      prefs.tut.age += dt; if (snap().state.goalsDone.includes('g3')) prefs.tut.free += dt;
      if ((slowTimer += dt) > 5) { slowTimer = 0; renderHint(snap(), prefs); const k = affordKey(snap(), prefs); if (k !== lastAfford) { lastAfford = k; catalog(); } }
    },
    welcome(migratedFrom) {
      toast(`${t('welcome')} <b style="font-family:var(--f-script);font-weight:400;font-size:22px;color:var(--leaf-deep)">${t('town')}</b>`);
      if (migratedFrom && migratedFrom < 2) setTimeout(() => toast(t('migrated')), 1500);
    },
  };
}
export { LANGS };
