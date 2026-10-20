// The building editor screen: module library, part tree, inspector, checks and the 3D preview, over a paused town.
// The editor model (application/blueprintEditor.js) owns the draft and its history; the preview
// (rendering/three/editorView.js) draws it. This module only turns clicks, keys and fields into model operations
// and shows the model's state. The game sees nothing until "Save design" sends a SaveBlueprint command.
import { DEFS } from '../../core/config/catalog.js';
import { MODULES, MODULE_CATS, FACES, searchModules, BLUEPRINT_LIMITS } from '../../core/config/modules.js';
import { anchorsFor, partSubtree, blueprintBaseTypes, blueprintUsers, getBlueprint } from '../../core/domain/blueprint.js';
import { CMD } from '../../core/commands/commands.js';
import { $, ico, trapTab } from './dom.js';
import { t } from './i18n.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const deg = r => Math.round(r * 180 / Math.PI * 10) / 10;
const SNAP_MOVE = [0, .01, .05, .1, .25], SNAP_ANGLE = [0, 5, 15, 45, 90];

/**
 * openModel(opts) → editor model · createView(container, opts) → preview · recover() → a crashed draft or null ·
 * onClose() leaves the screen · toast(html) · onSaved({ id, version }) after a successful save.
 */
export function createEditorUI({ root, game, openModel, createView, recover, onClose, toast, onSaved = () => {}, reducedMotion = false }) {
  let ed = null, view = null, libCat = null, libQuery = '', night = false, comparing = false, snaps = { move: .05, angle: 15 }, dialog = null, inspKey = '';
  const state = () => game.getSnapshot().state;

  function shell() {
    root.innerHTML = `
    <header class="ed-top">
      <h2 id="ed-title">${ico('i-home')}${t('ed_title')}</h2>
      <label class="ed-field">${t('ed_name')}<input id="ed-name" maxlength="${BLUEPRINT_LIMITS.nameLength}" autocomplete="off"></label>
      <label class="ed-field">${t('ed_base')}<select id="ed-base"></select></label>
      <div class="ed-cost" id="ed-cost" aria-live="polite"></div>
      <div class="ed-tools" role="toolbar" aria-label="${t('ed_tools')}">
        <button class="btn" id="ed-undo" title="${t('ed_undo')} (Ctrl+Z)">↶ <span>${t('ed_undo')}</span></button>
        <button class="btn" id="ed-redo" title="${t('ed_redo')} (Ctrl+Y)">↷ <span>${t('ed_redo')}</span></button>
        <span class="ed-sep"></span>
        <div class="ed-seg" role="radiogroup" aria-label="${t('ed_gizmo')}">
          ${['translate', 'rotate', 'scale'].map((m, i) => `<button class="btn" role="radio" data-mode="${m}" title="${t('ed_mode_' + m)} (${'MTS'[i]})">${t('ed_mode_' + m)}</button>`).join('')}
        </div>
        <label class="ed-field small">${t('ed_snapMove')}<select id="ed-snapm">${SNAP_MOVE.map(v => `<option value="${v}">${v ? v + ' m' : t('ed_snapOff')}</option>`).join('')}</select></label>
        <label class="ed-field small">${t('ed_snapAngle')}<select id="ed-snapa">${SNAP_ANGLE.map(v => `<option value="${v}">${v ? v + '°' : t('ed_snapOff')}</option>`).join('')}</select></label>
        <span class="ed-sep"></span>
        <button class="btn" id="ed-night" aria-pressed="false">${t('ed_night')}</button>
        <button class="btn" id="ed-compare" aria-pressed="false">${t('ed_compare')}</button>
        <button class="btn" id="ed-cam" title="${t('ed_resetCam')}">${t('ed_resetCam')}</button>
      </div>
      <div class="ed-main-actions">
        <button class="btn up" id="ed-save">${t('ed_save')}</button>
        <button class="btn" id="ed-savenew" hidden>${t('ed_saveNew')}</button>
        <button class="btn" id="ed-close">${t('close')}</button>
        <button class="btn warn" id="ed-delete" hidden>${t('ed_deleteDesign')}</button>
      </div>
    </header>
    <aside class="ed-lib" aria-labelledby="ed-lib-h">
      <h3 id="ed-lib-h">${t('ed_library')}</h3>
      <input id="ed-search" type="search" placeholder="${t('ed_search')}" aria-label="${t('ed_search')}" autocomplete="off">
      <div class="ed-cats" role="group" aria-label="${t('ed_categories')}"></div>
      <ul class="ed-mods" id="ed-mods"></ul>
    </aside>
    <main class="ed-stage" id="ed-stage" aria-label="${t('ed_preview')}">
      <p class="ed-legend" aria-hidden="true"><span class="lg-ent">➜ ${t('ed_entrance')}</span><span class="lg-street">▭ ${t('ed_street')}</span><span class="lg-sel">▢ ${t('ed_selected')}</span><span class="lg-bad">⬚ ${t('ed_problem')}</span></p>
      <p class="ed-cmp" id="ed-cmp" hidden><span>${t('ed_original')}</span><span>${t('ed_draft')}</span></p>
      <p class="ed-keys">${t('ed_keys')}</p>
    </main>
    <aside class="ed-side">
      <section aria-labelledby="ed-tree-h"><h3 id="ed-tree-h">${t('ed_parts')}</h3><ul class="ed-tree" id="ed-tree" role="tree" aria-multiselectable="true"></ul>
        <div class="ed-row"><button class="btn" id="ed-dup">${t('ed_dup')}</button><button class="btn warn" id="ed-del">${t('ed_del')}</button></div></section>
      <section aria-labelledby="ed-insp-h"><h3 id="ed-insp-h">${t('ed_inspector')}</h3><div id="ed-insp"></div></section>
    </aside>
    <footer class="ed-issues" aria-labelledby="ed-iss-h"><h3 id="ed-iss-h">${t('ed_checks')}</h3><ul id="ed-iss" aria-live="polite"></ul></footer>
    <div class="ed-dialog" id="ed-dialog" role="alertdialog" aria-modal="true" aria-labelledby="ed-dlg-t" hidden></div>`;
  }

  // ---------------------------------------------------------------- rendering of the panels
  const modName = id => t('mod_' + id);
  const partLabel = p => `${modName(p.module)} #${p.id}`;
  function renderTop() {
    const d = ed.draft, c = ed.cost(), saved = !!ed.original;
    if (document.activeElement !== $('ed-name')) $('ed-name').value = d.name;
    $('ed-base').innerHTML = blueprintBaseTypes().map(k => `<option value="${k}" ${k === d.baseType ? 'selected' : ''}>${esc(t('n_' + k))} · ${DEFS[k].s}×${DEFS[k].s}</option>`).join('');
    $('ed-base').disabled = saved; $('ed-base').title = saved ? t('ed_baseLocked') : '';
    $('ed-cost').innerHTML = `${ico('i-coin')}<b>${c.total}</b> <small>(${t('n_' + d.baseType)} ${c.base} + ${t('ed_partsCost')} ${c.extra})</small> · <span class="${c.parts > c.maxParts ? 'bad' : ''}">${t('ed_partsN', { n: c.parts, m: c.maxParts })}</span> · <span class="${c.weight > c.maxWeight ? 'bad' : ''}">${t('ed_weightN', { n: c.weight, m: c.maxWeight })}</span>${ed.original ? ` · ${t('ed_version', { n: ed.original.version })}` : ''}`;
    $('ed-undo').disabled = !ed.canUndo; $('ed-redo').disabled = !ed.canRedo;
    const v = ed.validation(), blocked = !v.ok, unchanged = !ed.differsFromOriginal();
    $('ed-save').disabled = blocked || unchanged; $('ed-save').title = blocked ? t('ed_fixFirst') : unchanged ? t('ed_unchanged') : '';
    $('ed-savenew').hidden = !saved; $('ed-savenew').disabled = blocked;
    $('ed-delete').hidden = !saved;
    $('ed-compare').hidden = !saved; $('ed-compare').setAttribute('aria-pressed', comparing);
    $('ed-night').setAttribute('aria-pressed', night);
    root.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-checked', b.dataset.mode === view.mode));
  }
  function renderLibrary() {
    root.querySelector('.ed-cats').innerHTML = [null, ...MODULE_CATS].map(c => `<button class="fchip ${libCat === c ? 'on' : ''}" data-cat="${c || ''}" aria-pressed="${libCat === c}">${t(c ? 'modcat_' + c : 'all')}</button>`).join('');
    const ids = searchModules(libQuery, libCat, modName);
    $('ed-mods').innerHTML = ids.length ? ids.map(id => { const m = MODULES[id];
      return `<li><button class="ed-mod" data-add="${id}" title="${t('ed_addHint', { m: modName(id) })}"><b>${modName(id)}</b><small>${t('modcat_' + m.cat)} · ${ico('i-coin')}${m.cost}${m.entrance ? ' · ' + t('ed_isEntrance') : ''}</small></button></li>`; }).join('') : `<li class="empty">${t('ed_noMatch')}</li>`;
  }
  function renderTree() {
    const d = ed.draft, issues = ed.validation().issues, sel = new Set(ed.selection), rows = [];
    const walk = (parent, level) => { for (const p of d.parts.filter(q => q.parent === parent)) {
      const probs = issues.filter(i => i.partId === p.id), err = probs.some(i => i.level === 'error');
      rows.push(`<li role="treeitem" aria-level="${level}" aria-selected="${sel.has(p.id)}" style="--lvl:${level - 1}"><button data-part="${p.id}" class="${sel.has(p.id) ? 'on' : ''}">${modName(p.module)} <small>${t('anchor_' + p.anchor)}</small>${probs.length ? ` <span class="${err ? 'bad' : 'warn'}">${err ? '✕ ' + t('ed_error') : '⚠ ' + t('ed_warning')}</span>` : ''}</button></li>`);
      walk(p.id, level + 1);
    } };
    walk(null, 1);
    $('ed-tree').innerHTML = rows.join('') || `<li class="empty">${t('ed_noParts')}</li>`;
    $('ed-dup').disabled = $('ed-del').disabled = !ed.selection.length;
  }
  function numField(key, label, value, { step = .01, min, max, unit = 'm' } = {}) {
    return `<label class="ed-num">${label}<input type="number" data-f="${key}" value="${value}" step="${step}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''} inputmode="decimal"><small>${unit}</small></label>`;
  }
  function renderInspector() {
    const box = $('ed-insp'), id = ed.primary, p = id !== null ? ed.part(id) : null;
    if (!p) { inspKey = ''; box.innerHTML = `<p class="hint">${ed.selection.length > 1 ? t('ed_multi', { n: ed.selection.length }) : t('ed_none')}</p>`; return; }
    const m = MODULES[p.module], key = [p.id, p.module, p.anchor, p.parent, ed.selection.length].join('|');
    if (key === inspKey && box.contains(document.activeElement)) { // typing: refresh the other fields only
      box.querySelectorAll('[data-f]').forEach(el => { if (el !== document.activeElement) el.value = fieldValue(p, el.dataset.f); }); return;
    }
    inspKey = key;
    const parents = [null, ...ed.draft.parts.filter(q => !partSubtree(ed.draft, p.id).includes(q.id)).map(q => q.id)].filter(pid => anchorsFor(p.module, pid).length);
    const anchors = anchorsFor(p.module, p.parent);
    box.innerHTML = `<p class="ed-insp-t"><b>${partLabel(p)}</b> <small>${t('modcat_' + m.cat)}${ed.selection.length > 1 ? ' · ' + t('ed_multi', { n: ed.selection.length }) : ''}</small></p>
      <div class="ed-grid">
        <label class="ed-field">${t('ed_parent')}<select data-reparent>${parents.map(pid => `<option value="${pid ?? ''}" ${pid === p.parent ? 'selected' : ''}>${pid === null ? t('ed_lot') : esc(partLabel(ed.part(pid)))}</option>`).join('')}</select></label>
        <label class="ed-field">${t('ed_anchor')}<select data-anchor>${anchors.map(a => `<option value="${a}" ${a === p.anchor ? 'selected' : ''}>${t('anchor_' + a)}</option>`).join('')}</select></label>
      </div>
      <fieldset><legend>${t('ed_position')}</legend><div class="ed-grid3">${numField('ox', FACES.includes(p.anchor) ? t('ed_along') : 'X', fieldValue(p, 'ox'), { step: snaps.move || .01 })}${numField('oy', t('ed_up'), fieldValue(p, 'oy'), { step: snaps.move || .01 })}${numField('oz', FACES.includes(p.anchor) ? t('ed_out') : 'Z', fieldValue(p, 'oz'), { step: snaps.move || .01 })}</div>
        ${numField('rot', t('ed_turn'), fieldValue(p, 'rot'), { step: snaps.angle || 1, unit: '°' })}</fieldset>
      <fieldset><legend>${t('ed_size')}</legend><div class="ed-grid3">${['w', 'h', 'd'].map(k => numField('s' + k, t('ed_' + k), fieldValue(p, 's' + k), { step: .01, min: m.min[k], max: m.max[k] })).join('')}</div></fieldset>
      <div class="ed-grid">
        ${m.colorable ? `<label class="ed-field">${t('ed_color')}<input type="color" data-f="color" value="${p.color}"></label>` : ''}
        ${m.variants > 1 ? `<label class="ed-field">${t('ed_variant')}<select data-f="variant">${Array.from({ length: m.variants }, (_, i) => `<option value="${i}" ${i === p.variant ? 'selected' : ''}>${t('ed_lookN', { n: i + 1 })}</option>`).join('')}</select></label>` : ''}
      </div>`;
  }
  function fieldValue(p, f) {
    if (f === 'ox' || f === 'oy' || f === 'oz') return +p.offset[f[1]].toFixed(3);
    if (f === 'rot') return deg(p.rotation);
    if (f[0] === 's') return +p.size[f[1]].toFixed(3);
    if (f === 'color') return p.color; if (f === 'variant') return p.variant;
    return '';
  }
  function renderIssues() {
    const v = ed.validation(), list = $('ed-iss');
    if (!v.issues.length) { list.innerHTML = `<li class="ok">✓ ${t('ed_ok')}</li>`; return; }
    list.innerHTML = v.issues.map(i => { const vars = { n: i.value, m: i.limit, s: DEFS[ed.draft.baseType].s }, part = i.partId && ed.part(i.partId);
      return `<li class="${i.level}"><b>${i.level === 'error' ? '✕ ' + t('ed_error') : '⚠ ' + t('ed_warning')}</b> ${t('iss_' + i.code, vars)}${part ? ` (${esc(partLabel(part))})` : ''}<br><small>${t('fix_' + i.code, vars)}</small>${part ? ` <button class="btn small" data-show="${i.partId}">${t('ed_show')}</button>` : ''}</li>`; }).join('');
  }
  function refresh(kind = 'edit') {
    if (!ed) return;
    view.update(ed.draft, { selection: ed.selection, issues: ed.validation().issues });
    renderTop(); renderTree(); renderInspector();
    if (kind !== 'select') renderIssues();
  }

  // ---------------------------------------------------------------- dialogs (confirmations, recovery)
  function ask({ title, body, yes, no, danger = false }) {
    return new Promise(res => {
      const box = $('ed-dialog'); dialog = res;
      box.innerHTML = `<div class="ed-dlg"><h3 id="ed-dlg-t">${title}</h3>${body ? `<p>${body}</p>` : ''}<div class="actions"><button class="btn" data-dlg="no">${no}</button><button class="btn ${danger ? 'red' : 'up'}" data-dlg="yes">${yes}</button></div></div>`;
      box.hidden = false; box.querySelector('[data-dlg="no"]').focus();
    });
  }
  function closeDialog(answer) { const box = $('ed-dialog'); box.hidden = true; box.innerHTML = ''; const r = dialog; dialog = null; if (r) r(answer); }

  // ---------------------------------------------------------------- actions
  async function save(asNew = false) {
    const v = ed.validation(); if (!v.ok) { toast(t('ed_fixFirst')); return; }
    const res = game.dispatch({ type: CMD.SaveBlueprint, blueprint: ed.toSave(), asNew });
    if (!res.ok) { toast(`${t('ed_saveFailed')}: ${t(res.reason)}`); return; }
    if (res.unchanged) { toast(t('ed_unchanged')); return; }
    const saved = getBlueprint(state(), { id: res.id, version: res.version });
    ed.markSaved(saved); refresh('edit');
    toast(`${ico('i-home')} ${t('ed_saved', { name: esc(saved.name), n: res.version })}`); onSaved(res);
  }
  async function removeDesign() {
    const id = ed.original?.id; if (!id) return;
    const users = blueprintUsers(state(), id);
    if (users.buildings.length || users.villas.length) { await ask({ title: t('ed_inUseT'), body: t('ed_inUse', { n: users.buildings.length, v: users.villas.length }), yes: t('ed_understood'), no: t('close') }); return; }
    if (!await ask({ title: t('ed_deleteQ', { name: esc(ed.original.name) }), body: t('ed_deleteBody'), yes: t('ed_deleteDesign'), no: t('ed_keep'), danger: true })) return;
    const res = game.dispatch({ type: CMD.DeleteBlueprint, id }); if (res.ok) { ed.discardDraft(); toast(t('ed_deleted')); close(); }
  }
  /** Closing asks first when there are unsaved changes; the autosaved draft is dropped only after "discard". */
  async function requestClose() {
    if (dialog) { closeDialog(false); return; }
    if (ed && ed.dirty && ed.differsFromOriginal()) {
      if (!await ask({ title: t('ed_discardQ'), body: t('ed_discardBody'), yes: t('ed_discard'), no: t('ed_keep'), danger: true })) return;
      ed.discardDraft();
    }
    close();
  }
  function close() { if (view) view.dispose(); view = null; ed = null; root.hidden = true; root.innerHTML = ''; onClose(); }
  function nudge(dx, dy, dz, fine) {
    const s = (snaps.move || .05) * (fine ? .2 : 1);
    ed.updateMany(ed.selection, p => ({ offset: { x: p.offset.x + dx * s, y: p.offset.y + dy * s, z: p.offset.z + dz * s } }), 'nudge');
  }
  function turn(dir) { const a = (snaps.angle || 15) * Math.PI / 180 * dir; ed.updateMany(ed.selection, p => ({ rotation: p.rotation + a }), 'turn'); }

  function bind() {
    root.addEventListener('click', e => {
      const el = e.target.closest('button'); if (!el || el.disabled) return;
      if (el.dataset.dlg) return closeDialog(el.dataset.dlg === 'yes');
      if (el.dataset.add) { ed.addPart(el.dataset.add); return; }
      if (el.dataset.part) { const id = +el.dataset.part; ed.select(id, { toggle: e.shiftKey || e.ctrlKey || e.metaKey }); return; }
      if (el.dataset.show) { ed.select(+el.dataset.show); return; }
      if (el.dataset.cat !== undefined) { libCat = el.dataset.cat || null; renderLibrary(); return; }
      if (el.dataset.mode) { view.setMode(el.dataset.mode); refresh('select'); return; }
      switch (el.id) {
        case 'ed-undo': ed.undo(); break; case 'ed-redo': ed.redo(); break;
        case 'ed-dup': ed.duplicate(); break; case 'ed-del': ed.removeParts(); break;
        case 'ed-night': night = !night; view.setNight(night ? 1 : 0); renderTop(); break;
        case 'ed-compare': comparing = !comparing; view.compare(comparing ? ed.original : null); $('ed-cmp').hidden = !comparing; renderTop(); break;
        case 'ed-cam': view.resetCamera(); break;
        case 'ed-save': save(false); break; case 'ed-savenew': save(true); break;
        case 'ed-close': requestClose(); break; case 'ed-delete': removeDesign(); break;
      }
    });
    root.addEventListener('input', e => {
      const el = e.target;
      if (el.id === 'ed-search') { libQuery = el.value; renderLibrary(); return; }
      if (el.id === 'ed-name') { ed.setName(el.value); return; }
      const f = el.dataset.f, id = ed.primary; if (!f || id === null) return;
      const v = el.type === 'number' ? parseFloat(el.value) : el.value;
      if (el.type === 'number' && !Number.isFinite(v)) return;
      if (f === 'ox' || f === 'oy' || f === 'oz') ed.updatePart(id, { offset: { [f[1]]: v } }, 'field-' + f);
      else if (f === 'rot') ed.updatePart(id, { rotation: v * Math.PI / 180 }, 'field-rot');
      else if (f[0] === 's') ed.updatePart(id, { size: { [f[1]]: v } }, 'field-' + f);
      else if (f === 'color') ed.updatePart(id, { color: v }, 'field-color');
      else if (f === 'variant') ed.updatePart(id, { variant: +v });
    });
    root.addEventListener('change', e => {
      const el = e.target;
      if (el.dataset.f || el.id === 'ed-name') ed.endGesture();
      if (el.id === 'ed-base') ed.setBaseType(el.value);
      if (el.id === 'ed-snapm') { snaps.move = +el.value; view.setSnaps({ move: snaps.move }); inspKey = ''; renderInspector(); }
      if (el.id === 'ed-snapa') { snaps.angle = +el.value; view.setSnaps({ angle: snaps.angle }); inspKey = ''; renderInspector(); }
      if (el.dataset.reparent !== undefined) { const id = ed.primary, parent = el.value === '' ? null : +el.value; ed.reattach(id, parent, anchorsFor(ed.part(id).module, parent)[0]); }
      if (el.dataset.anchor !== undefined) ed.reattach(ed.primary, ed.part(ed.primary).parent, el.value);
    });
    root.addEventListener('keydown', e => {
      trapTab(dialog ? $('ed-dialog') : root, e); // a modal screen: focus stays inside (and inside a dialog while one is open)
      if (!ed || dialog) { if (dialog && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDialog(false); } return; }
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName), k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) ed.redo(); else ed.undo(); return; }
      if (mod && k === 'y') { e.preventDefault(); ed.redo(); return; }
      if (typing) return;
      if (mod && k === 'd') { e.preventDefault(); ed.duplicate(); return; }
      if (mod && k === 'a') { e.preventDefault(); ed.selectAll(); return; }
      if (k === 'delete' || k === 'backspace') { e.preventDefault(); ed.removeParts(); return; }
      if (k === 'm' || k === 't' || k === 's') { view.setMode({ m: 'translate', t: 'rotate', s: 'scale' }[k]); refresh('select'); return; }
      if (!ed.selection.length) return;
      const arrows = { arrowleft: [-1, 0, 0], arrowright: [1, 0, 0], arrowup: e.altKey ? [0, 1, 0] : [0, 0, -1], arrowdown: e.altKey ? [0, -1, 0] : [0, 0, 1], pageup: [0, 1, 0], pagedown: [0, -1, 0] };
      if (arrows[k]) { e.preventDefault(); nudge(...arrows[k], e.shiftKey); return; }
      if (k === '[' || k === ']') { turn(k === ']' ? 1 : -1); return; }
    });
    root.addEventListener('keyup', e => { if (e.key.startsWith('Arrow') || e.key === '[' || e.key === ']') ed?.endGesture(); });
  }
  function bindStage() {
    const c = view.canvas; let down = null;
    c.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, gizmo: view.gizmoActive }; });
    c.addEventListener('pointerup', e => {
      if (!down || down.gizmo || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; } down = null;
      const id = view.pick(e.clientX, e.clientY);
      if (id === null) { if (!(e.shiftKey || e.ctrlKey)) ed.clearSelection(); return; }
      ed.select(id, { toggle: e.shiftKey || e.ctrlKey || e.metaKey });
    });
  }

  function reopen({ blueprintId = null, version = null, baseType = 'cottage', draft = null, keepView = false } = {}) {
    const bp = blueprintId ? getBlueprint(state(), { id: blueprintId, version }) : null;
    const opts = { blueprint: draft || bp, baseType, name: t('ed_newName'), onChange: kind => refresh(kind) };
    if (draft) { opts.original = bp; opts.recovered = true; } // a recovered draft is unsaved and compares with the version it came from
    ed = openModel(opts);
    if (!keepView) { if (view) view.dispose(); view = createView($('ed-stage'), { reducedMotion, onGizmo: g => { if (g.size) ed.updatePart(g.id, { size: g.size }, 'gizmo'); else ed.transformPart(g.id, { pose: g.pose }); if (g.phase === 'end') ed.endGesture(); } }); view.setSnaps(snaps); view.canvas.setAttribute('aria-label', t('ed_canvasLabel')); bindStage(); }
    comparing = false; view.compare(null); $('ed-cmp').hidden = true;
    renderLibrary(); refresh('edit');
  }

  return {
    get isOpen() { return !!ed; },
    /** Opens the editor: { blueprintId?, version?, baseType? }. Offers to recover a draft a crash left behind. */
    async open(what = {}) {
      root.hidden = false; shell(); bind(); dialog = null; night = false;
      reopen(what);
      $('ed-snapm').value = String(snaps.move); $('ed-snapa').value = String(snaps.angle);
      const lost = recover();
      if (lost && !(what.blueprintId && lost.id === what.blueprintId && JSON.stringify(lost.parts) === JSON.stringify(ed.draft.parts))) {
        if (await ask({ title: t('ed_recoverQ'), body: esc(lost.name || t('ed_newName')), yes: t('ed_recover'), no: t('ed_recoverNo') })) {
          const exists = lost.id && getBlueprint(state(), { id: lost.id });
          reopen({ blueprintId: exists ? lost.id : null, draft: lost, keepView: true });
        }
      }
      $('ed-name').focus();
    },
    requestClose,
    frame() { if (view) view.frame(); },
  };
}
