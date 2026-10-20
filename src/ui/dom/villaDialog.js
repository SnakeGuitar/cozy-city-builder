// The villa dialog: saves a framed arrangement as a villa, edits a saved villa's settings (name, fence, gate,
// seed variants) as a new version, saves a placed villa as it stands now, or deletes a villa. It shows what the
// villa contains, its size and price and a picture, and explains any problem. The core validates and stores.
import { CMD } from '../../core/commands/commands.js';
import { captureVilla, validateVilla, getVilla, villaContents, villaCost, villaUsers, groupsOf, groupAsVilla, FENCE_STYLES, GATE_SIDES, VILLA_LIMITS } from '../../core/domain/villa.js';
import { ico } from './dom.js';
import { t } from './i18n.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** `thumbOf.villa(state, villa)` pictures a villa; `onSaved(res)` after a save; `onClose()` when the dialog goes. */
export function createVillaDialog({ root, game, thumbOf, toast, onSaved = () => {}, onClose = () => {} }) {
  let draft = null, mode = null, groupId = null, skipped = null, confirmDelete = false, lastFocus = null;
  const state = () => game.getSnapshot().state;

  function render() {
    const st = state(), v = draft, check = validateVilla(st, v), c = villaContents(v), cost = villaCost(st, v);
    const types = Object.entries(c.byType).map(([k, n]) => `<li>${n} × ${esc(t('n_' + k))}</li>`).join('');
    const title = mode === 'capture' ? t('vd_title_new') : mode === 'group' ? t('vd_title_group') : t('vd_title_edit');
    root.innerHTML = `<div class="vd" role="document">
      <h3 id="vd-title">${ico('i-home')}${title}${v.id ? ` <small>${esc(v.id)} · v${v.version}</small>` : ''}</h3>
      <div class="vd-body">
        <figure class="vd-pic"><img alt="${t('vd_picture')}" src="${thumbOf ? thumbOf.villa(st, v) : ''}"><figcaption>${t('vd_size', { w: v.size.w, d: v.size.d })}</figcaption></figure>
        <div class="vd-form">
          <label class="ed-field">${t('vd_name')}<input id="vd-name" maxlength="${VILLA_LIMITS.nameLength}" value="${esc(v.name)}" autocomplete="off"></label>
          <div class="ed-grid">
            <label class="ed-field">${t('vd_fence')}<select id="vd-fence"><option value="">${t('fence_none')}</option>${FENCE_STYLES.map(f => `<option value="${f}" ${v.fence?.style === f ? 'selected' : ''}>${t('fence_' + f)}</option>`).join('')}</select></label>
            <label class="ed-field">${t('vd_gate')}<select id="vd-gate" ${v.fence ? '' : 'disabled'}>${GATE_SIDES.map(g => `<option value="${g}" ${v.fence?.gate === g ? 'selected' : ''}>${t('gate_' + g)}</option>`).join('')}</select></label>
          </div>
          <label class="vd-check"><input type="checkbox" id="vd-var" ${v.variants ? 'checked' : ''}> ${t('vd_variants')}<small>${t('vd_variantsHint')}</small></label>
          <p class="vd-sum">${ico('i-coin')}<b>${cost}</b> <small>${t('vd_costHint')}</small> · ${t('villaCount', { n: c.buildings, p: c.paths })}${c.custom ? ` · ${t('vd_custom', { n: c.custom })}` : ''}</p>
          ${types ? `<ul class="vd-list" aria-label="${t('vd_contents')}">${types}</ul>` : ''}
          ${skipped && (skipped.buildings || skipped.segments) ? `<p class="hint">⚠ ${t('vd_skipped', { n: skipped.buildings + skipped.segments })}</p>` : ''}
          <ul class="vd-issues" aria-live="polite">${check.issues.map(i => `<li class="error"><b>✕ ${t('ed_error')}</b> ${t('vis_' + i.code, { n: i.value, m: i.limit, i: i.itemId })}<br><small>${t('vfix_' + i.code)}</small></li>`).join('')}</ul>
        </div>
      </div>
      <div class="actions">
        ${mode === 'edit' ? `<button class="btn ${confirmDelete ? 'red' : 'warn'}" data-vd="delete">${confirmDelete ? t('vd_deleteSure') : t('vd_delete')}</button>` : ''}
        <button class="btn" data-vd="cancel">${t('cancel')}</button>
        <button class="btn up" data-vd="save" ${check.ok ? '' : `disabled aria-describedby="vd-title"`}>${t('vd_save')}</button>
      </div></div>`;
  }
  function open(next) {
    lastFocus = document.activeElement; ({ draft, mode, groupId = null, skipped = null } = next); confirmDelete = false;
    root.hidden = false; render(); root.querySelector('#vd-name').focus(); root.querySelector('#vd-name').select();
  }
  function close() { root.hidden = true; root.innerHTML = ''; draft = null; onClose(); lastFocus?.focus?.(); }
  function save() {
    const res = game.dispatch({ type: CMD.SaveVilla, villa: draft, asNew: mode === 'capture', ...(mode === 'group' ? { fromGroup: groupId } : {}) });
    if (!res.ok) { toast(`${t('ed_saveFailed')}: ${t(res.reason)}`); return; }
    toast(res.unchanged ? t('ed_unchanged') : `${ico('i-home')} ${t('vd_saved', { name: esc(draft.name), n: res.version })}`);
    onSaved(res); close();
  }
  function remove() {
    const users = villaUsers(state(), draft.id);
    if (users.length) { toast(t('vd_inUse', { n: users.length })); confirmDelete = false; render(); return; }
    if (!confirmDelete) { confirmDelete = true; render(); return; }
    const res = game.dispatch({ type: CMD.DeleteVilla, id: draft.id }); if (res.ok) { toast(t('vd_deleted')); close(); }
  }

  root.addEventListener('click', e => {
    const b = e.target.closest('[data-vd]'); if (!b || b.disabled) return;
    if (b.dataset.vd === 'save') save(); else if (b.dataset.vd === 'cancel') close(); else if (b.dataset.vd === 'delete') remove();
  });
  root.addEventListener('input', e => { if (e.target.id === 'vd-name') { draft = { ...draft, name: e.target.value.slice(0, VILLA_LIMITS.nameLength) }; const issues = root.querySelector('.vd-issues'), ok = validateVilla(state(), draft).ok; root.querySelector('[data-vd=save]').disabled = !ok; if (ok) issues.innerHTML = ''; } });
  root.addEventListener('change', e => {
    if (e.target.id === 'vd-name') { render(); return; }
    if (e.target.id === 'vd-fence') draft = { ...draft, fence: e.target.value ? { style: e.target.value, gate: draft.fence?.gate || 'front' } : null };
    if (e.target.id === 'vd-gate' && draft.fence) draft = { ...draft, fence: { ...draft.fence, gate: e.target.value } };
    if (e.target.id === 'vd-var') draft = { ...draft, variants: e.target.checked };
    render(); root.querySelector('#' + e.target.id)?.focus();
  });
  // keys typed here never reach the town (R, G, Delete …); Escape closes the dialog
  root.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } });

  return {
    get isOpen() { return !root.hidden; },
    /** A rectangle was framed in town: offer to save what it contains as a new villa. */
    capture(rect) { const r = captureVilla(state(), rect, { name: t('villaNewName'), seed: (state().rngSeed >>> 0) % 1000000 }); open({ draft: r.villa, mode: 'capture', skipped: r.skipped }); },
    /** Settings of a saved villa (saving makes a new version). */
    edit(id) { const v = getVilla(state(), { id }); if (v) open({ draft: JSON.parse(JSON.stringify(v)), mode: 'edit' }); },
    /** A placed villa as it stands now, to save as a new version of its villa (the group adopts it). */
    fromGroup(id) { const g = groupsOf(state())[id]; if (g) open({ draft: groupAsVilla(state(), g), mode: 'group', groupId: id }); },
    close,
  };
}
