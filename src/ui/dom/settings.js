// Settings popover: language, tutorial tips, sound, start over (two-step).
import { $ } from './dom.js';
import { LANGS, getLanguage, t } from './i18n.js';

export function renderSettings(prefs, resetArmed, actions) {
  const el = $('settings'); if (el.hidden) return;
  el.innerHTML = `<button class="close" id="s-close" aria-label="${t('close')}">×</button><h3>${t('settings')}</h3>
    <div class="kind">${t('language')}</div><div class="langs">${Object.entries(LANGS).map(([k, v]) => `<button data-l="${k}" class="${getLanguage() === k ? 'on' : ''}" lang="${k}">${v}</button>`).join('')}</div>
    <div class="row"><span>${t('tips')}</span><button class="btn" style="flex:none;width:70px" id="s-tips">${t(prefs.tips ? 'on' : 'off')}</button></div>
    <div class="row"><span>${t('soundOff')}</span><button class="btn" style="flex:none;width:70px" id="s-snd">${t(prefs.muted ? 'on' : 'off')}</button></div>
    <div class="actions"><button class="btn ${resetArmed ? 'red' : 'warn'}" id="s-reset">${t(resetArmed ? 'resetConfirm' : 'reset')}</button></div>`;
  el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => actions.language(b.dataset.l));
  $('s-close').onclick = actions.close; $('s-tips').onclick = actions.tips; $('s-snd').onclick = actions.sound; $('s-reset').onclick = actions.reset;
}
