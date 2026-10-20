// Panel for a selected road: its style, size, what it cost, whether it reaches the café, and the curve tools
// (edit handles, add / remove a control point), demolition, undo and redo. Numbers come from the core.
import { DEFS } from '../../core/config/catalog.js';
import { roadsOf, segmentPolyline, polylineLength, segmentsAt } from '../../core/domain/roads.js';
import { $, ico } from './dom.js';
import { bindHold } from './selectionPanel.js';
import { t, fmt } from './i18n.js';

export function renderRoadPanel({ state, derived }, interaction, history, rules) {
  const p = $('panel'), piece = interaction.road, r = roadsOf(state);
  const seg = piece?.segmentId && r.segments[piece.segmentId], node = piece?.nodeId && r.nodes[piece.nodeId];
  if (!seg && !node) return false;
  p.hidden = false;
  const style = seg ? seg.style : node.style || 'road', d = DEFS[style];
  const main = seg ? derived.roads.mainSegments.includes(seg.id) : derived.roads.mainNodes.includes(node.id);
  const paid = seg ? seg.paid || 0 : node.paid || 0, back = rules.refundsEnabled ? Math.floor(paid / 2) : 0;
  const row = (a, v) => `<span>${a}</span><b>${v}</b>`;
  const kv = seg ? row(t('roadLength'), `${polylineLength(segmentPolyline(state, seg)).toFixed(1)} m`) + row(t('roadWidth'), `${seg.width} m`) + row(t('roadCurve'), seg.controlPoints.length ? t('roadPoints', { n: seg.controlPoints.length }) : t('roadStraight'))
    + row(t('roadEnds'), [seg.startNodeId, seg.endNodeId].map(n => segmentsAt(state, n).length > 1 ? t('roadJoined') : t('roadDeadEnd')).join(' · '))
    : row(t('roadWidth'), `${node.width || 1} m`);
  const editing = interaction.editing, demo = interaction.confirmDemo;
  const html = `<button class="close" id="p-close" aria-label="${t('close')}">×</button>
    <div class="kind"><span class="kdot kc-road"></span>${t('k_road')}${seg ? '' : ` · ${t('roadCell')}`}</div><div class="ttl">${t('n_' + style)}</div><div class="desc">${t('d_' + style)}</div>
    <div class="status ${main ? '' : 'off'}"><i></i>${t(main ? 'roadMain' : 'roadNotMain')}</div>
    <div class="kv">${kv}${row(t('roadPaid'), paid ? `${fmt(paid)} ${ico('i-coin', 'ico')}` : t('free'))}</div>
    ${seg ? `<div class="actions"><button class="btn ${editing ? 'up' : ''}" id="r-edit" aria-pressed="${editing}">${t(editing ? 'roadEditDone' : 'roadEdit')}</button><button class="btn" id="r-add">${t('roadAddPoint')}</button>
      ${seg.controlPoints.length ? `<button class="btn" id="r-del">${t('roadRemovePoint')}</button>` : ''}</div>${editing ? `<p class="hint">${t('roadEditHint')}</p>` : ''}` : ''}
    <div class="actions"><button class="btn" id="r-undo" ${history.undo ? '' : 'disabled'} title="Ctrl + Z">↶ ${t('undo')}</button><button class="btn" id="r-redo" ${history.redo ? '' : 'disabled'} title="Ctrl + Y">↷ ${t('redo')}</button>
      <button class="btn ${demo ? 'red' : 'warn'}" id="r-demo">${demo ? (back ? t('demolishConfirm', { n: back }) : t('demolishSure')) : t('demolish')}</button></div>`;
  if (html === p._html) return true;
  bindHold(p);
  if (p._hold) { p._pending = () => renderRoadPanel({ state, derived }, interaction, history, rules); return true; }
  p._html = html; p.innerHTML = html;
  $('p-close').onclick = () => interaction.selectRoad(null);
  if ($('r-edit')) $('r-edit').onclick = () => interaction.toggleEditing();
  if ($('r-add')) $('r-add').onclick = () => interaction.addControlPoint();
  if ($('r-del')) $('r-del').onclick = () => interaction.removeControlPoint();
  $('r-undo').onclick = () => interaction.undoRoad(); $('r-redo').onclick = () => interaction.redoRoad();
  $('r-demo').onclick = () => interaction.demolishRoad();
  return true;
}
