// Panel for the selected building: what it does, its numbers, and who it affects.
import { DEFS, SVC_GROUPS, LANDMARK, canUpgrade } from '../../core/config/catalog.js';
import { refundFor, upgradePreview } from '../../core/commands/commands.js';
import { statsOf } from '../../core/domain/state.js';
import { $, ico, meter, pct, KIND_KEY } from './dom.js';
import { t, fmt } from './i18n.js';

const STAT_FMT = { r: v => t('tiles', { n: v }), upkeep: v => v ? `−${v}${t('perMin')}` : '0', goods: v => `${v}${t('perMin')}`, out: v => `${v}${t('perMin')}` };
const stars = (n, max) => `<span class="tier" aria-label="${t('tierN', { n, m: max })}">${'★'.repeat(n)}${'☆'.repeat(max - n)}</span>`;
/** The upgrade block: a button, or the core's preview of the next tier with confirm / cancel. No numbers are computed here. */
function upgradeHtml(state, b, open, rules) {
  if (!canUpgrade(b.type)) return '';
  const pv = upgradePreview(state, b.id);
  if (!pv.next) return `<div class="upg max">${stars(pv.from, pv.max)} ${t('maxTier')}</div>`;
  if (!open) return `<div class="upg"><button class="btn up" id="p-up">${ico('i-up', 'ico')}${t('upgrade')} · ${pv.cost ? `${ico('i-coin', 'ico')}${pv.cost}` : t('free')}</button></div>`;
  const val = (k, v) => (STAT_FMT[k] || (x => x))(v);
  const rows = pv.changes.map(c => `<span>${t('stat_' + c.stat)}</span><b>${val(c.stat, c.from)} → <em class="${c.stat === 'upkeep' ? 'worse' : 'better'}">${val(c.stat, c.to)}</em></b>`).join('');
  return `<div class="upg open"><h4>${t('upgradeTo', { n: pv.to })} ${stars(pv.to, pv.max)}</h4><div class="kv">${rows}<span>${t('upgradeCost')}</span><b>${pv.cost ? `${ico('i-coin', 'ico')}${pv.cost}` : t('free')}</b></div>
    ${pv.reason ? `<p class="bad">${t(pv.reason)}</p>` : ''}<div class="actions"><button class="btn" id="p-up-no">${t('cancel')}</button><button class="btn up" id="p-up-yes" ${pv.reason ? 'disabled' : ''}>${t('upgradeConfirm')}</button></div></div>`;
}

/** Never replace a panel's buttons between a press and its release, or the click is lost: redraws wait for the release. */
export function bindHold(p) {
  if (p._holdBound) return; p._holdBound = true;
  p.addEventListener('pointerdown', () => { p._hold = true; });
  addEventListener('pointerup', () => { if (!p._hold) return; p._hold = false; if (p._pending) setTimeout(p._pending, 0); p._pending = null; }, true);
  addEventListener('pointercancel', () => { p._hold = false; }, true);
}

export function renderSelectionPanel({ state, derived }, id, confirmDemo, actions, upgradeOpen = false) {
  const p = $('panel'), b = id && state.buildings[id], rec = b && derived.byId[id];
  if (!b || !rec) { p.hidden = true; return; }
  p.hidden = false; const d = statsOf(b), k = d.kind, city = derived.city;
  const need = ['house', 'shop', 'industry', 'service', 'utility'].includes(k);
  let status = need ? `<div class="status ${rec.conn ? '' : 'off'}"><i></i>${t(rec.conn ? 'connected' : 'disconnected')}</div>` : `<div class="status"><i></i>${t('noNeed')}</div>`;
  if (rec.conn && k === 'shop' && rec.open === false) status = `<div class="status off"><i></i>${t('st_vacant')}</div>`;
  const row = (a, v) => `<span>${a}</span><b>${v}</b>`;
  let kv = '';
  if (k === 'house') { kv = row(t('residents'), `${rec.occ}/${rec.cap}`) + (d.upkeep ? row(t('upkeep'), `−${d.upkeep}${t('perMin')}`) : '') + row(t('wellLabel'), Math.round(rec.well));
    if (rec.conn) for (const g in SVC_GROUPS) { const f = rec.groups[g] || 0; kv += row(t('grp_' + g), `${meter(f, 1, f < .5 ? 'bad' : '')} ${pct(f)}`); } }
  if (k === 'shop') kv = row(t('customers'), `${fmt(rec.cust)}/${d.cust}`) + row(t('staff'), pct(rec.staff)) + row(t('income'), `${fmt(rec.inc || 0)}${t('perMin')}`) + row(t('bonusLabel'), `+${rec.mult}%`) + row(t('jobs'), d.jobs) + (d.upkeep ? row(t('upkeep'), `−${d.upkeep}${t('perMin')}`) : '');
  if (k === 'industry') kv = row(t('staff'), `${pct(rec.staff)} · ${d.jobs} ${t('jobsShort')}`) + row(t('production'), `${(rec.prod || 0).toFixed(1)}${t('perMin')}`) + row(t('soldLocal'), city.prod ? pct(city.sold / city.prod) : '—') + row(t('income'), `${fmt(rec.inc || 0)}${t('perMin')}`) + (rec.mult ? row(t('bonusLabel'), `+${rec.mult}%`) : '') + (d.upkeep ? row(t('upkeep'), `−${d.upkeep}${t('perMin')}`) : '');
  if (k === 'service') { const sat = rec.capEff && rec.load >= rec.capEff - .5;
    kv = row(t('capUsed'), `${meter(rec.load || 0, rec.capEff || 1, sat ? 'bad' : '')} ${fmt(rec.load || 0)}/${fmt(rec.capEff || 0)}`) + row(t('homesServed'), (rec.served || []).length) + row(t('rangeLabel'), t('tiles', { n: d.r })) + row(t('staff'), pct(rec.staff)) + row(t('upkeep'), `−${d.upkeep}${t('perMin')}`);
    if (sat) kv += `<span class="wide warn">${t('saturated')}</span>`; }
  if (k === 'utility') { const u = city.util[d.util] || { use: 0, supply: 0 }; kv = row(t('cityCap'), `${meter(u.use, u.supply, u.ratio < 1 ? 'bad' : '')} ${fmt(u.use)}/${fmt(u.supply)}`) + row(t('contributes'), fmt(d.cap * (.5 + .5 * rec.staff))) + row(t('staff'), pct(rec.staff)) + row(t('upkeep'), `−${d.upkeep}${t('perMin')}`); }
  if (d.fx && k !== 'service') kv += row(t('rangeLabel'), t('tiles', { n: Math.max(...d.fx.map(f => f.r)) }));
  const li = (name, s) => `<li class="${s.k}"><span>${name}</span><span>${t(s.k === 'well' ? 'fx_well' : 'fx_inc', { n: s.v })}</span></li>`;
  const rec2 = rec.src.map(s => li(t('n_' + state.buildings[s.from].type), s));
  const agg = new Map();
  for (const o of Object.values(derived.byId)) for (const s of o.src) if (s.from === id) { const key = o.type + s.k; const a = agg.get(key) || { n: 0, type: o.type, s }; a.n++; agg.set(key, a); }
  const giv = [...agg.values()].map(a => li((a.n > 1 ? a.n + ' × ' : '') + t('n_' + a.type), a.s));
  const tag = (d.fam ? ` · ${t('fam_' + d.fam)} · ${t('era_' + d.era)}` : '') + (canUpgrade(b.type) ? ` · ${stars(b.tier || 1, DEFS[b.type].tiers.length)}` : '');
  const html = `<button class="close" id="p-close" aria-label="${t('close')}">×</button>
    <div class="kind"><span class="kdot kc-${k}"></span>${t(KIND_KEY[k])}${tag} · ${d.s}×${d.s}</div><div class="ttl">${t('n_' + b.type)}</div><div class="desc">${t('d_' + b.type)}</div>${status}
    ${kv ? `<div class="kv">${kv}</div>` : ''}
    ${rec2.length ? `<div class="rel"><h4>${t('receives')}</h4><ul>${rec2.join('')}</ul></div>` : ''}
    ${giv.length ? `<div class="rel"><h4>${t('gives')}</h4><ul>${giv.join('')}</ul></div>` : ''}
    ${upgradeHtml(state, b, upgradeOpen)}
    <div class="actions"><button class="btn" id="p-move">${t('move')}</button><button class="btn" id="p-rot">${t('rotate')}</button>
    ${b.type === LANDMARK ? '' : `<button class="btn ${confirmDemo ? 'red' : 'warn'}" id="p-demo">${confirmDemo ? (refundFor(state, b) ? t('demolishConfirm', { n: refundFor(state, b) }) : t('demolishSure')) : t('demolish')}</button>`}</div>`;
  if (html === p._html) return; // unchanged: keep the DOM (and any click in progress)
  bindHold(p);
  if (p._hold) { p._pending = () => renderSelectionPanel({ state, derived }, id, confirmDemo, actions, upgradeOpen); return; }
  p._html = html; p.innerHTML = html;
  $('p-close').onclick = actions.close; $('p-move').onclick = actions.move; $('p-rot').onclick = actions.rotate;
  if ($('p-demo')) $('p-demo').onclick = actions.demolish;
  if ($('p-up')) $('p-up').onclick = () => actions.upgrade(true);
  if ($('p-up-no')) $('p-up-no').onclick = () => actions.upgrade(false);
  if ($('p-up-yes')) $('p-up-yes').onclick = actions.confirmUpgrade;
}

/** Relation links for the selected building as plain data: [fromId, toId, kind, labelHtml, chipOnId]. */
export function relationLinks({ state, derived }, id) {
  const b = id && state.buildings[id], rec = b && derived.byId[id]; if (!rec) return [];
  const links = [];
  for (const s of rec.src) if (state.buildings[s.from]) links.push([s.from, id, s.k, t(s.k === 'well' ? 'fx_well' : 'fx_inc', { n: s.v }), s.from]);
  for (const o of Object.values(derived.byId)) for (const s of o.src) if (s.from === id) links.push([id, o.id, s.k, t(s.k === 'well' ? 'fx_well' : 'fx_inc', { n: s.v }), o.id]);
  if (rec.kind === 'service') for (const h of rec.served || []) links.push([id, h, 'svc', `${ico('i-pop', '')} ${derived.byId[h].occ}`, h]);
  if (rec.kind === 'house') for (const o of Object.values(derived.byId)) if (o.kind === 'service' && (o.served || []).includes(id)) links.push([o.id, id, 'svc', t('svc_' + DEFS[o.type].svc), o.id]);
  return links;
}
