// The build catalogue: tabs, tradition/era filters for homes, and item cards.
import { CATS, DEFS, ERAS, FAMS } from '../../core/config/catalog.js';
import { costFor, canAfford } from '../../core/commands/commands.js';
import { $, ico, KIND_KEY } from './dom.js';
import { t } from './i18n.js';

const CAT_ICON = { paths: 'i-road', homes: 'i-home', shops: 'i-shop', industry: 'i-factory', services: 'i-civic', green: 'i-leaf', decor: 'i-blossom' };
function metaOf(k) {
  const d = DEFS[k], sz = `${d.s}×${d.s}`;
  if (d.kind === 'house') return `${ico('i-pop', '')}${d.cap} · ${sz}`;
  if (d.kind === 'shop') return `${ico('i-job', '')}${d.jobs} · ${ico('i-pop', '')}${d.cust}`;
  if (d.kind === 'industry') return `${ico('i-job', '')}${d.jobs} · ${ico('i-box', '')}${d.out}`;
  if (d.kind === 'service') return `${ico('i-range', '')}${d.r} · ${ico('i-pop', '')}${d.cap}`;
  if (d.kind === 'utility') return `${ico('i-' + d.util, '')}${d.cap} · ${sz}`;
  return sz;
}
export const catalogKeys = prefs => Object.keys(DEFS).filter(k => DEFS[k].cat === prefs.tab && (prefs.tab !== 'homes' || ((prefs.filt.fam === 'all' || DEFS[k].fam === prefs.filt.fam) && (prefs.filt.era === 'all' || DEFS[k].era === prefs.filt.era))));

export function renderCatalog({ state }, prefs, unlocked, thumbs, activeType) {
  $('tabs').innerHTML = CATS.map(c => { const n = Object.keys(DEFS).filter(k => DEFS[k].cat === c); const hasNew = n.some(k => prefs.newT.includes(k));
    return `<button class="tab k-${c} ${prefs.tab === c ? 'on' : ''}" data-cat="${c}">${ico(CAT_ICON[c])}${hasNew ? '<span class="dot"></span>' : ''}<span>${t('cat_' + c)}</span> <small>${n.filter(k => unlocked.has(k)).length}/${n.length}</small></button>`; }).join('');
  const f = $('filters');
  if (prefs.tab === 'homes') { f.hidden = false;
    f.innerHTML = `<span class="flbl">${t('tradition')}</span>${['all', ...FAMS].map(x => `<button class="fchip ${prefs.filt.fam === x ? 'on' : ''}" data-fam="${x}">${t(x === 'all' ? 'all' : 'fam_' + x)}</button>`).join('')}<span class="flbl">${t('era')}</span>${['all', ...ERAS].map(x => `<button class="fchip ${prefs.filt.era === x ? 'on' : ''}" data-era="${x}">${t(x === 'all' ? 'all' : 'era_' + x)}</button>`).join('')}`;
  } else f.hidden = true;
  const keys = catalogKeys(prefs), built = new Set(Object.values(state.buildings).map(b => b.type));
  $('items').innerHTML = keys.length ? keys.map(k => {
    const d = DEFS[k], lock = !unlocked.has(k), isBuilt = d.unique && built.has(k);
    const badge = lock ? `<span class="badge lock">${t('locked')}</span>` : isBuilt ? `<span class="badge uniq">${t('built')}</span>` : prefs.newT.includes(k) ? `<span class="badge">${t('newb')}</span>` : '';
    const tag = d.fam ? '' : `<span class="tag kc-${d.kind}">${t(KIND_KEY[d.kind])}</span>`;
    return `<button class="item ${activeType === k ? 'on' : ''} ${lock ? 'locked' : ''} ${!lock && !isBuilt && !canAfford(state, k) ? 'poor' : ''} ${prefs.newT.includes(k) ? 'new' : ''}" data-type="${k}" title="${t('d_' + k)}">${badge}<span class="th"><img alt="" src="${thumbs[k] || ''}"></span>${tag}<span class="nm">${t('n_' + k)}</span><span class="meta">${metaOf(k)}</span><span class="pr">${lock ? ico('i-lock', '') : isBuilt ? '—' : `${costFor(state, k) ? `${ico('i-coin', '')}${costFor(state, k)}` : t('free')}${d.upkeep ? `<small>−${d.upkeep}${t('perMin')}</small>` : ''}`}</span></button>`;
  }).join('') : `<div class="empty">${t('noMatch')}</div>`;
}
/** Cheap key that changes when the catalogue needs a redraw because affordability changed. */
export const affordKey = ({ state }, prefs) => Object.keys(DEFS).filter(k => DEFS[k].cat === prefs.tab).map(k => canAfford(state, k) ? 1 : 0).join('');
