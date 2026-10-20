// Panel for the selected building: what it does, its numbers, and who it affects.
import { DEFS, SVC_GROUPS } from '../../core/config/catalog.js';
import { refundFor } from '../../core/commands/commands.js';
import { $, ico, meter, pct, KIND_KEY } from './dom.js';
import { t, fmt } from './i18n.js';

export function renderSelectionPanel({ state, derived }, id, confirmDemo, actions) {
  const p = $('panel'), b = id && state.buildings[id], rec = b && derived.byId[id];
  if (!b || !rec) { p.hidden = true; return; }
  p.hidden = false; const d = DEFS[b.type], k = d.kind, city = derived.city;
  const need = ['house', 'shop', 'industry', 'service', 'utility'].includes(k);
  let status = need ? `<div class="status ${rec.conn ? '' : 'off'}"><i></i>${t(rec.conn ? 'connected' : 'disconnected')}</div>` : `<div class="status"><i></i>${t('noNeed')}</div>`;
  if (rec.conn && k === 'shop' && rec.open === false) status = `<div class="status off"><i></i>${t('st_vacant')}</div>`;
  const row = (a, v) => `<span>${a}</span><b>${v}</b>`;
  let kv = '';
  if (k === 'house') { kv = row(t('residents'), `${rec.occ}/${rec.cap}`) + row(t('wellLabel'), Math.round(rec.well));
    if (rec.conn) for (const g in SVC_GROUPS) { const f = rec.groups[g] || 0; kv += row(t('grp_' + g), `${meter(f, 1, f < .5 ? 'bad' : '')} ${pct(f)}`); } }
  if (k === 'shop') kv = row(t('customers'), `${fmt(rec.cust)}/${d.cust}`) + row(t('staff'), pct(rec.staff)) + row(t('income'), `${fmt(rec.inc || 0)}${t('perMin')}`) + row(t('bonusLabel'), `+${rec.mult}%`) + row(t('jobs'), d.jobs);
  if (k === 'industry') kv = row(t('staff'), `${pct(rec.staff)} · ${d.jobs} ${t('jobsShort')}`) + row(t('production'), `${(rec.prod || 0).toFixed(1)}${t('perMin')}`) + row(t('soldLocal'), city.prod ? pct(city.sold / city.prod) : '—') + row(t('income'), `${fmt(rec.inc || 0)}${t('perMin')}`) + (rec.mult ? row(t('bonusLabel'), `+${rec.mult}%`) : '');
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
  const tag = d.fam ? ` · ${t('fam_' + d.fam)} · ${t('era_' + d.era)}` : '';
  const html = `<button class="close" id="p-close" aria-label="${t('close')}">×</button>
    <div class="kind"><span class="kdot kc-${k}"></span>${t(KIND_KEY[k])}${tag} · ${d.s}×${d.s}</div><div class="ttl">${t('n_' + b.type)}</div><div class="desc">${t('d_' + b.type)}</div>${status}
    ${kv ? `<div class="kv">${kv}</div>` : ''}
    ${rec2.length ? `<div class="rel"><h4>${t('receives')}</h4><ul>${rec2.join('')}</ul></div>` : ''}
    ${giv.length ? `<div class="rel"><h4>${t('gives')}</h4><ul>${giv.join('')}</ul></div>` : ''}
    <div class="actions"><button class="btn" id="p-move">${t('move')}</button><button class="btn" id="p-rot">${t('rotate')}</button>
    ${b.type === 'cafe' ? '' : `<button class="btn ${confirmDemo ? 'red' : 'warn'}" id="p-demo">${confirmDemo ? (refundFor(state, b.type) ? t('demolishConfirm', { n: refundFor(state, b.type) }) : t('demolishSure')) : t('demolish')}</button>`}</div>`;
  if (html === p._html) return; // unchanged: keep the DOM (and any click in progress)
  p._html = html; p.innerHTML = html;
  $('p-close').onclick = actions.close; $('p-move').onclick = actions.move; $('p-rot').onclick = actions.rotate;
  if ($('p-demo')) $('p-demo').onclick = actions.demolish;
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
