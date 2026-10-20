// Menu layer: main menu, in-game pause menu, settings, credits and the overwrite confirmation.
// It renders whatever the navigation state says (application/navigation.js) and calls actions; it holds no
// navigation logic of its own. Fully keyboard-operable: real buttons, arrow keys move focus, Escape goes back.
import { $ } from './dom.js';
import { LANGS, getLanguage, t } from './i18n.js';
import { MASCOT } from './mascot/assets.js';

const btn = (id, label, extra = '', cls = '') => `<button type="button" class="menu-btn ${cls}" data-act="${id}" ${extra}>${label}</button>`;
const toggle = (id, label, on) => `<div class="menu-row"><span id="lbl-${id}">${label}</span><button type="button" class="menu-toggle ${on ? 'on' : ''}" data-act="${id}" role="switch" aria-checked="${on}" aria-labelledby="lbl-${id}">${t(on ? 'on' : 'off')}</button></div>`;
const langs = () => `<div class="menu-langs" role="group" aria-label="${t('language')}">${Object.entries(LANGS).map(([k, v]) => `<button type="button" data-lang="${k}" lang="${k}" class="${getLanguage() === k ? 'on' : ''}" aria-pressed="${getLanguage() === k}">${v}</button>`).join('')}</div>`;

export function createMenu({ settings, actions }) {
  const layer = $('menu');
  let lastKey = '';
  layer.addEventListener('click', e => {
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
    if (s === 'credits') return `<div class="menu-card small" role="document"><h2 id="menu-title" class="menu-h">${t('menu_credits')}</h2>
      <div class="menu-credits">${MASCOT.portrait('happy')}<p>${t('credits_text')}</p></div><div class="menu-list">${btn('back', t('menu_back'), 'data-autofocus')}</div></div>`;
    return '';
  }
  function confirmHtml(c) {
    return `<div class="menu-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text">
      <h2 id="confirm-title" class="menu-h">${t('confirm_title')}</h2><p id="confirm-text">${t(c.mode === 'sandbox' ? 'confirm_sandbox' : 'confirm_normal')}</p>
      <div class="menu-list row">${btn('confirmNo', t('confirm_no'), 'data-autofocus')}${btn('confirmYes', t('confirm_yes'), '', 'danger')}</div></div>`;
  }
  return {
    /** info: { hasNormal, hasSandbox, mode } */
    render(nav, info) {
      const open = nav.screen !== 'playing' || !!nav.confirm;
      layer.hidden = !open; layer.dataset.screen = nav.screen;
      document.body.classList.toggle('in-menu', nav.screen === 'main_menu' || (nav.screen !== 'playing' && nav.back === 'main_menu') || nav.screen === 'credits');
      if (!open) { lastKey = ''; return; }
      const html = (nav.screen === 'playing' ? '' : screenHtml(nav, info)) + (nav.confirm ? confirmHtml(nav.confirm) : '');
      const key = html + getLanguage();
      if (key !== lastKey) { lastKey = key; layer.innerHTML = html; }
      if (!layer.contains(document.activeElement)) (layer.querySelector(nav.confirm ? '.menu-dialog [data-autofocus]' : '[data-autofocus]') || layer.querySelector('button'))?.focus();
    },
  };
}
