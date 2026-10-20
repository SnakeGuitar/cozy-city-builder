// Menu layer: main menu, in-game pause menu, settings, credits and the overwrite confirmation.
// It renders whatever the navigation state says (application/navigation.js) and calls actions; it holds no
// navigation logic of its own. Fully keyboard-operable: real buttons, arrow keys move focus, Escape goes back.
import { $ } from './dom.js';
import { LANGS, getLanguage, t } from './i18n.js';
import { MASCOT } from './mascot/assets.js';
import { MAP_PRESETS, MAP_SIZES, DEFAULT_MAP_SIZE, BIOMES, MIXED_POOL } from '../../core/config/biomes.js';

/** Colours of a preset for its card (a mixed map shows a few of its biomes). */
const swatch = id => (id === 'mixed' ? MIXED_POOL.slice(0, 4).map(b => BIOMES[b].look.ground[0]) : BIOMES[id].look.ground);
const randomSeed = () => Math.floor(Math.random() * 1e9);

const btn = (id, label, extra = '', cls = '') => `<button type="button" class="menu-btn ${cls}" data-act="${id}" ${extra}>${label}</button>`;
const toggle = (id, label, on) => `<div class="menu-row"><span id="lbl-${id}">${label}</span><button type="button" class="menu-toggle ${on ? 'on' : ''}" data-act="${id}" role="switch" aria-checked="${on}" aria-labelledby="lbl-${id}">${t(on ? 'on' : 'off')}</button></div>`;
const langs = () => `<div class="menu-langs" role="group" aria-label="${t('language')}">${Object.entries(LANGS).map(([k, v]) => `<button type="button" data-lang="${k}" lang="${k}" class="${getLanguage() === k ? 'on' : ''}" aria-pressed="${getLanguage() === k}">${v}</button>`).join('')}</div>`;

export function createMenu({ settings, actions }) {
  const layer = $('menu');
  let lastKey = '', lastNav = null, lastInfo = {};
  // choices on the new-map screen (presentation state only; the core receives them when the game starts)
  const setup = { preset: 'plains', seed: randomSeed(), size: DEFAULT_MAP_SIZE };
  const rerender = () => { if (lastNav) menu.render(lastNav, lastInfo); };
  layer.addEventListener('input', e => { if (e.target.id === 'setup-seed') { const v = parseInt(e.target.value.replace(/\D/g, ''), 10); setup.seed = Number.isFinite(v) ? v % 4294967296 : 0; } });
  layer.addEventListener('click', e => {
    const pr = e.target.closest('[data-preset]'); if (pr) { setup.preset = pr.dataset.preset; rerender(); return; }
    const sz = e.target.closest('[data-size]'); if (sz) { setup.size = +sz.dataset.size; rerender(); return; }
    if (e.target.closest('#setup-dice')) { setup.seed = randomSeed(); rerender(); return; }
    if (e.target.closest('#setup-start')) { actions.startSetup({ preset: setup.preset, seed: setup.seed, size: setup.size }); return; }
    const l = e.target.closest('[data-lang]'); if (l) { actions.language(l.dataset.lang); return; }
    const b = e.target.closest('[data-act]'); if (b && !b.disabled) actions[b.dataset.act]?.();
  });
  layer.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...layer.querySelectorAll('button:not([disabled])')], i = items.indexOf(document.activeElement);
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]; if (next) { next.focus(); e.preventDefault(); }
  });

  function screenHtml(nav, info) {
    const s = nav.screen;
    if (s === 'main_menu') return `<div class="menu-main">
      <div class="menu-hero"><div class="menu-limoni">${MASCOT.portrait('wave')}</div><div class="menu-say"><b>${t(MASCOT.nameKey)}</b><p>${t('m_menu')}</p></div></div>
      <div class="menu-card" role="document"><h1 id="menu-title" class="menu-title">${t('town')}</h1><p class="menu-sub">${t('subtitle')}</p>
        <div class="menu-list">
          ${info.hasNormal ? btn('continue', `${t('menu_continue')}<small>${t('menu_continue_hint')}</small>`, 'data-autofocus', 'primary') : ''}
          ${btn('newGame', `${t('menu_new')}<small>${t('menu_new_hint')}</small>`, info.hasNormal ? '' : 'data-autofocus', info.hasNormal ? '' : 'primary')}
          ${btn('sandbox', `${t('menu_sandbox')}<small>${t(info.hasSandbox ? 'menu_sandbox_continue' : 'menu_sandbox_hint')}</small>`)}
          ${btn('settings', t('settings'))}${btn('credits', t('menu_credits'))}
        </div>${langs()}</div></div>`;
    if (s === 'paused') return `<div class="menu-card small" role="document"><h2 id="menu-title" class="menu-h">${t('menu_paused')}</h2><div class="menu-list">
      ${btn('resume', t('menu_resume'), 'data-autofocus', 'primary')}${btn('settings', t('settings'))}
      ${info.mode === 'sandbox' ? btn('restartSandbox', t('menu_sandbox_restart')) : ''}${btn('mainMenu', t('menu_main'))}</div></div>`;
    if (s === 'settings') return `<div class="menu-card small" role="document"><h2 id="menu-title" class="menu-h">${t('settings')}</h2>
      <div class="menu-sec">${t('language')}</div>${langs()}
      ${toggle('sound', t('set_sound'), !settings.muted)}${toggle('mascot', t('set_mascot'), settings.mascot)}${toggle('smooth', t('set_smooth'), settings.smoothCamera)}
      <p class="menu-note">${t('set_controls')}</p>
      <div class="menu-list">${btn('back', t('menu_back'), 'data-autofocus')}</div></div>`;
    if (s === 'setup') {
      const mode = nav.setup?.mode || 'normal';
      return `<div class="menu-card setup" role="document"><h2 id="menu-title" class="menu-h">${t(mode === 'sandbox' ? 'setup_title_sandbox' : 'setup_title')}</h2>
        <div class="menu-sec">${t('setup_biome')}</div>
        <div class="biome-grid" role="radiogroup" aria-label="${t('setup_biome')}">${MAP_PRESETS.map(id => `<button type="button" class="biome ${setup.preset === id ? 'on' : ''}" data-preset="${id}" role="radio" aria-checked="${setup.preset === id}" ${setup.preset === id ? 'data-autofocus' : ''}>
          <span class="sw">${swatch(id).map(c => `<i style="background:${c}"></i>`).join('')}</span><b>${t('biome_' + id)}</b><small>${t('biomed_' + id)}</small></button>`).join('')}</div>
        <div class="setup-row"><label class="menu-sec" for="setup-seed">${t('setup_seed')}</label><input id="setup-seed" inputmode="numeric" maxlength="10" value="${setup.seed}" aria-describedby="seed-help"><button type="button" class="menu-btn dice" id="setup-dice" aria-label="${t('setup_random')}" title="${t('setup_random')}">🎲</button></div>
        <p class="menu-note" id="seed-help">${t('setup_seed_help')}</p>
        <div class="setup-row"><span class="menu-sec">${t('setup_size')}</span><div class="menu-langs" role="radiogroup" aria-label="${t('setup_size')}">${MAP_SIZES.map(n => `<button type="button" data-size="${n}" class="${setup.size === n ? 'on' : ''}" role="radio" aria-checked="${setup.size === n}">${t('size_' + n)} · ${n}×${n}</button>`).join('')}</div></div>
        <div class="menu-list row">${btn('back', t('menu_back'))}${btn('', t('setup_start'), 'id="setup-start"', 'primary')}</div></div>`;
    }
    if (s === 'credits') return `<div class="menu-card small" role="document"><h2 id="menu-title" class="menu-h">${t('menu_credits')}</h2>
      <div class="menu-credits">${MASCOT.portrait('happy')}<p>${t('credits_text')}</p></div><div class="menu-list">${btn('back', t('menu_back'), 'data-autofocus')}</div></div>`;
    return '';
  }
  function confirmHtml(c) {
    return `<div class="menu-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text">
      <h2 id="confirm-title" class="menu-h">${t('confirm_title')}</h2><p id="confirm-text">${t(c.mode === 'sandbox' ? 'confirm_sandbox' : 'confirm_normal')}</p>
      <div class="menu-list row">${btn('confirmNo', t('confirm_no'), 'data-autofocus')}${btn('confirmYes', t('confirm_yes'), '', 'danger')}</div></div>`;
  }
  const menu = {
    /** info: { hasNormal, hasSandbox, mode } */
    render(nav, info) {
      lastNav = nav; lastInfo = info;
      const open = (nav.screen !== 'playing' && nav.screen !== 'editor') || !!nav.confirm; // the editor draws its own screen
      layer.hidden = !open; layer.dataset.screen = nav.screen;
      document.body.classList.toggle('in-menu', nav.screen === 'main_menu' || (nav.screen !== 'playing' && nav.back === 'main_menu') || nav.screen === 'credits');
      if (!open) { lastKey = ''; return; }
      const html = (nav.screen === 'playing' || nav.screen === 'editor' ? '' : screenHtml(nav, info)) + (nav.confirm ? confirmHtml(nav.confirm) : '');
      const key = html + getLanguage();
      // keep the seed field's caret when the screen redraws around it
      const typing = document.activeElement?.id === 'setup-seed';
      if (typing && key !== lastKey) { lastKey = key; return; }
      if (key !== lastKey) { lastKey = key; layer.innerHTML = html; }
      if (!layer.contains(document.activeElement)) (layer.querySelector(nav.confirm ? '.menu-dialog [data-autofocus]' : '[data-autofocus]') || layer.querySelector('button'))?.focus();
    },
  };
  return menu;
}
