// The placement bar shown while placing or moving a building: grid ⇄ free, snaps, rotation step, turn buttons,
// and (after a touch tap in free mode) confirm / cancel. It edits only the per-game placement preferences.
import { $, ico } from './dom.js';
import { t } from './i18n.js';
import { isRoadType } from '../../core/config/catalog.js';

const STEPS = [5, 15, 45, 90];
const deg = a => Math.round(a * 180 / Math.PI) % 360;

export function createPlaceBar({ interaction, prefs, onChange, history = () => ({ undo: 0, redo: 0 }) }) {
  const el = $('placebar'); let last = '';
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const p = prefs();
    if (b.dataset.pm) p.mode = b.dataset.pm;
    else if (b.dataset.snap) p[b.dataset.snap] = !p[b.dataset.snap];
    else if (b.dataset.step) p.step = +b.dataset.step;
    else if (b.dataset.shape) p.roadShape = b.dataset.shape;
    else if (b.dataset.flip) { interaction.flipCorner(); return; }
    else if (b.dataset.hist) { if (b.dataset.hist === 'undo') interaction.undoRoad(); else interaction.redoRoad(); return render(); }
    else if (b.dataset.rot) { interaction.rotate(+b.dataset.rot); return render(); }
    else if (b.id === 'pb-ok') { interaction.confirmPending(); return render(); }
    else if (b.id === 'pb-no') { interaction.cancel(); return render(); }
    else return;
    interaction.placementChanged(); onChange(); render();
  });
  function render() {
    const tool = interaction.tool, show = tool.kind === 'build' || tool.kind === 'move', roadTool = show && isRoadType(tool.type);
    const p = prefs(), free = p.mode === 'free';
    const key = show ? JSON.stringify([p, tool.kind, tool.type, free ? deg(tool.rot) : tool.r, !!interaction.pending, roadTool && history()]) + t('pm_grid') : '';
    if (key === last) return; last = key;
    el.hidden = !show; if (!show) { el.innerHTML = ''; return; }
    const on = (cond) => cond ? 'on' : '';
    el.innerHTML = `<div class="pb-seg" role="group" aria-label="${t('placeMode')}">
        <button class="${on(!free)}" data-pm="grid" aria-pressed="${!free}">${ico('i-grid')}${t(roadTool ? 'pm_cells' : 'pm_grid')}</button>
        <button class="${on(free)}" data-pm="free" aria-pressed="${free}">${ico('i-free')}${t(roadTool ? 'pm_draw' : 'pm_free')}</button></div>
      ${roadTool ? `<div class="pb-group"><button class="pb-ico" data-hist="undo" title="${t('undo')} (Ctrl + Z)" aria-label="${t('undo')}" ${history().undo ? '' : 'disabled'}>↶</button><button class="pb-ico" data-hist="redo" title="${t('redo')} (Ctrl + Y)" aria-label="${t('redo')}" ${history().redo ? '' : 'disabled'}>↷</button></div>${free ? `<div class="pb-seg" role="group" aria-label="${t('roadShape')}">${['straight', 'l', 'curve'].map(sh => `<button class="${on(p.roadShape === sh)}" data-shape="${sh}" aria-pressed="${p.roadShape === sh}">${t('shape_' + sh)}</button>`).join('')}</div>
          <div class="pb-group"><button class="pb-chip ${on(p.snapGrid)}" data-snap="snapGrid" aria-pressed="${p.snapGrid}">${t('snap_grid')}</button>${p.roadShape === 'l' ? `<button class="pb-chip" data-flip="1" title="${t('flipCorner')}">⤾ ${t('flipCorner')}</button>` : ''}</div>` : ''}
        ${interaction.pending ? `<div class="pb-group"><button class="pb-ok" id="pb-ok">✓ ${t('buildRoad')}</button><button class="pb-no" id="pb-no" aria-label="${t('cancel')}">✕</button></div>` : ''}` : `
      ${free ? `<div class="pb-group" role="group" aria-label="${t('snaps')}">
        <button class="pb-chip ${on(p.snapGrid)}" data-snap="snapGrid" aria-pressed="${p.snapGrid}">${t('snap_grid')}</button>
        <button class="pb-chip ${on(p.snapRoad)}" data-snap="snapRoad" aria-pressed="${p.snapRoad}">${t('snap_road')}</button>
        <button class="pb-chip ${on(p.snapBuild)}" data-snap="snapBuild" aria-pressed="${p.snapBuild}">${t('snap_build')}</button></div>
      <div class="pb-group" role="group" aria-label="${t('rot_step')}"><span class="pb-lbl">${t('rot_step')}</span>${STEPS.map(s => `<button class="pb-chip ${on(p.step === s)}" data-step="${s}" aria-pressed="${p.step === s}">${s}°</button>`).join('')}</div>` : ''}
      <div class="pb-group"><button class="pb-ico" data-rot="-1" title="${t('turnL')}" aria-label="${t('turnL')}">${ico('i-rl')}</button>
        <span class="pb-angle">${free ? deg(tool.rot) : tool.r * 90}°</span>
        <button class="pb-ico" data-rot="1" title="${t('turnR')}" aria-label="${t('turnR')}">${ico('i-rr')}</button></div>
      ${interaction.pending ? `<div class="pb-group"><button class="pb-ok" id="pb-ok">✓ ${t('placeHere')}</button><button class="pb-no" id="pb-no" aria-label="${t('cancel')}">✕</button></div>` : ''}`}`;
  }
  return { render };
}
