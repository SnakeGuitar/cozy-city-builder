// The DOM front end: wires panels and buttons to the app and reacts to core events.
// Reads snapshots and rules, sends commands through the interaction controller or game.dispatch; never edits state.
import { CATS, DEFS, FAMS, ERAS, isRoadType } from '../../core/config/catalog.js';
import { GOALS } from '../../core/config/goals.js';
import { CMD } from '../../core/commands/commands.js';
import { $, ico, bump } from './dom.js';
import { STR, setLanguage, t } from './i18n.js';
import { toast } from './toasts.js';
import { createWorldLabels } from './worldLabels.js';
import { renderHud, renderLight } from './hud.js';
import { renderCityPanel } from './cityPanel.js';
import { renderGoals } from './goalsView.js';
import { renderCatalog, affordKey } from './catalog.js';
import { renderSelectionPanel, relationLinks } from './selectionPanel.js';
import { createMascot } from './mascot/mascot.js';
import { createPlaceBar } from './placeBar.js';
import { normalizePlacement } from '../interaction.js';

/** Global player settings (saved apart from any game). Untrusted input is normalised here. */
export function normalizeSettings(raw = {}, fallbackLang = 'es', reducedMotion = false) {
  return {
    lang: STR[raw.lang] ? raw.lang : (STR[fallbackLang] ? fallbackLang : 'es'),
    muted: !!raw.muted,
    mascot: raw.mascot !== undefined ? raw.mascot !== false : raw.tips !== false,     // v3 called it "tips"
    smoothCamera: typeof raw.smoothCamera === 'boolean' ? raw.smoothCamera : !reducedMotion,
  };
}
/** Per-game UI data (saved in that game's slot): catalogue tab and filters, "new" badges. The camera is saved next to it. */
export function normalizeSlotUi(ui = {}) {
  return {
    tab: CATS.includes(ui.tab) ? ui.tab : 'homes',
    filt: { fam: [...FAMS, 'all'].includes(ui.filt?.fam) ? ui.filt.fam : 'all', era: [...ERAS, 'all'].includes(ui.filt?.era) ? ui.filt.era : 'all' },
    newT: Array.isArray(ui.newT) ? ui.newT.filter(k => DEFS[k]) : [],
    place: normalizePlacement(ui.place),
  };
}

export function createDomUI({ app, view, interaction, camera, settings, slot, audio, thumbs, requestSave }) {
  const game = app.game;
  const labels = createWorldLabels(view);
  const mascot = createMascot(settings);
  const justDone = new Map(), income = new Map();
  const placeBar = createPlaceBar({ interaction, prefs: () => slot.place, onChange: () => requestSave() });
  let tickCount = 0, lastAfford = '';
  const snap = () => game.getSnapshot();
  const rules = () => game.rules();
  const activeType = () => ['build', 'move'].includes(interaction.tool.kind) ? interaction.tool.type : null;

  // ---------------------------------------------------------------- render helpers
  const hud = () => renderHud(snap(), settings, rules());
  const catalog = () => renderCatalog(snap(), slot, game.unlocked(), thumbs, activeType());
  const goals = () => renderGoals(snap(), justDone, performance.now(), rules().goalsEnabled);
  const panel = () => renderSelectionPanel(snap(), interaction.selected, interaction.confirmDemo, {
    close: () => interaction.select(0), move: () => interaction.startMove(interaction.selected), rotate: () => interaction.rotate(), demolish: () => interaction.demolishSelected(),
    upgrade: open => { audio.click(); interaction.toggleUpgrade(open); }, confirmUpgrade: () => interaction.confirmUpgrade() }, interaction.upgradeOpen);
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
    hud(); catalog(); goals(); panel(); renderCityPanel(s);
    labels.badges(s.state, s.derived); relations(); toolButtons(); mascot.refresh();
  }
  function applyLanguage(l) {
    settings.lang = setLanguage(l); document.documentElement.lang = settings.lang;
    document.querySelectorAll('[data-i]').forEach(el => el.textContent = t(el.dataset.i));
    document.querySelectorAll('[data-t]').forEach(el => { el.title = t(el.dataset.t); el.setAttribute('aria-label', el.title); });
    renderAll();
  }

  // ---------------------------------------------------------------- buttons
  $('tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (!b) return; slot.tab = b.dataset.cat; audio.click(); catalog(); requestSave(); });
  $('filters').addEventListener('click', e => { const b = e.target.closest('.fchip'); if (!b) return; if (b.dataset.fam) slot.filt.fam = b.dataset.fam; if (b.dataset.era) slot.filt.era = b.dataset.era; audio.click(); catalog(); requestSave(); });
  $('items').addEventListener('click', e => {
    const it = e.target.closest('.item'); if (!it) return; audio.init(); const k = it.dataset.type;
    if (!game.unlocked().has(k)) { const g = GOALS.find(g => g.unlock.includes(k)); toast(`${ico('i-lock')} ${t('locked')} · ${t('goals')}: ${g ? t(g.id) : ''}`); return; }
    if (DEFS[k].unique) { const b = Object.values(snap().state.buildings).find(b => b.type === k); if (b) { const c = view.centerOf(b); camera.focus(c.x, c.z); interaction.setTool({ kind: 'select' }); interaction.select(b.id); return; } }
    if (slot.newT.includes(k)) { slot.newT = slot.newT.filter(x => x !== k); requestSave(); }
    interaction.buildType(k); audio.click();
  });
  $('t-select').onclick = () => interaction.setTool({ kind: 'select' });
  $('t-demolish').onclick = () => { interaction.select(0); interaction.setTool({ kind: interaction.tool.kind === 'demolish' ? 'select' : 'demolish' }); };
  $('b-pause').onclick = () => game.dispatch({ type: CMD.TogglePause });
  for (const n of [1, 2, 3]) $('b-s' + n).onclick = () => game.dispatch({ type: CMD.SetSpeed, speed: n });
  $('b-rl').onclick = () => camera.rotateStep(-1); $('b-rr').onclick = () => camera.rotateStep(1);
  $('b-view').onclick = () => camera.toggleMode(); $('b-camreset').onclick = () => camera.reset();
  $('b-snd').onclick = () => { audio.init(); settings.muted = !settings.muted; audio.setMuted(settings.muted); hud(); requestSave(); };
  $('b-city').onclick = () => { const el = $('city'); el.hidden = !el.hidden; renderCityPanel(snap()); };

  // ---------------------------------------------------------------- reacting to core events
  function onEvents(events) {
    if (!events.length) return;
    const { state } = snap(); let structural = false, tickHappened = false;
    for (const e of events) switch (e.type) {
      case 'building_placed': structural = true; isRoadType(e.buildingType) ? audio.tick() : audio.place(); if (slot.newT.includes(e.buildingType)) slot.newT = slot.newT.filter(x => x !== e.buildingType); break;
      case 'building_removed': structural = true; audio.remove(); if (e.refund) labels.floater(view.topOf({ type: e.buildingType, position: e.position }, -.45), `${t('refunded', { n: e.refund })} ${ico('i-coin', '')}`, '', 1.4); income.delete(e.id); break;
      case 'building_moved': structural = true; audio.place(); break;
      case 'building_rotated': structural = true; audio.click(); break;
      case 'building_upgraded': { structural = true; audio.upgrade(); const b = state.buildings[e.id]; if (b) labels.floater(view.topOf(b, .3), `${'★'.repeat(e.toTier)} ${t('tierN', { n: e.toTier, m: DEFS[e.buildingType].tiers.length })}`, 'well', 2.2); toast(`${ico('i-up')} ${t('upgraded', { b: t('n_' + e.buildingType), n: e.toTier })}`); break; }
      case 'clock_changed': case 'day_changed': hud(); break;
      case 'income_earned': { const p = income.get(e.id) || { amount: 0, ticks: 3 + Math.random() * 4 }; p.amount += e.amount; income.set(e.id, p); break; }
      case 'population_changed': if (e.delta > 0) { const homes = Object.values(snap().derived.byId).filter(b => b.kind === 'house' && b.occ > 0); if (homes.length) labels.floater(view.topOf(state.buildings[homes[Math.floor(Math.random() * homes.length)].id]), `+1 ${ico('i-pop', '')}`, 'well', 1.4); bump('c-pop'); } break;
      case 'goal_completed': justDone.set(e.goalId, performance.now()); toast(`${ico('i-leaf')} ${t('goalDone')}: ${t(e.goalId)}${e.reward ? ` · +${e.reward} ${ico('i-coin')}` : ''}`); audio.unlock();
        if (e.goalId === 'g7') setTimeout(() => toast(`<b>${t('town')}</b> ${t('celebrate')}`, 'big', 6000), 1200); requestSave(); break;
      case 'types_unlocked': slot.newT.push(...e.types.filter(x => !slot.newT.includes(x))); slot.tab = DEFS[e.types[0]].cat; catalog(); break;
      case 'mascot_message_requested': mascot.show(e); break;
      case 'tutorial_step_completed': requestSave(); break;
      case 'command_rejected': if (e.reason === 'cafeHeart') toast(t('cafeHeart')); else if (e.reason === 'notEnough') $('tip').animate([{ opacity: .4 }, { opacity: 1 }], { duration: 250 }); break;
      case 'state_replaced': income.clear(); justDone.clear(); mascot.clear(); interaction.select(0); interaction.setTool({ kind: 'select' }); $('city').hidden = true; renderAll(); break;
      case 'tick': tickHappened = true; break;
    }
    if (tickHappened) {
      tickCount++;
      for (const [id, p] of income) if ((p.ticks -= 1) <= 0) { p.ticks = 5 + Math.random() * 3; const b = state.buildings[id]; if (b && p.amount >= 1) { labels.floater(view.topOf(b, .2), `+${Math.round(p.amount)} ${ico('i-coin', '')}`); bump('c-coins'); audio.coin(); } p.amount = 0; }
      const s = snap(); hud(); panel(); renderCityPanel(s);
      if (interaction.selected && tickCount % 4 === 0) relations();
      if (tickCount % 3 === 0) labels.badges(s.state, s.derived);
    }
    if (structural) { const s = snap(); hud(); panel(); renderCityPanel(s); goals(); labels.badges(s.state, s.derived); relations(); catalog(); requestSave(); }
  }
  setInterval(goals, 1500);
  let slow = 0;

  return {
    renderAll, applyLanguage, onEvents, toast, mascot,
    /** The per-slot UI object was replaced (another game was opened). */
    setSlot(next) { Object.keys(slot).forEach(k => delete slot[k]); Object.assign(slot, next); catalog(); placeBar.render(); },
    /** G: switch grid ⇄ free placement. */
    togglePlacement() { slot.place.mode = slot.place.mode === 'free' ? 'grid' : 'free'; interaction.placementChanged(); placeBar.render(); requestSave(); },
    /** Interaction changed tool or selection. */
    onInteraction(kind) { if (kind === 'tool') { catalog(); toolButtons(); placeBar.render(); } if (kind === 'selection') { panel(); relations(); if (interaction.selected) audio.click(); } },
    frame(dt, light) {
      labels.update(dt); renderLight(light);
      if ((slow += dt) > 5) { slow = 0; const k = affordKey(snap(), slot); if (k !== lastAfford) { lastAfford = k; catalog(); } }
    },
  };
}
