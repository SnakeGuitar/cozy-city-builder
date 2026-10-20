// The build catalogue: tabs, tradition/era filters for homes, and item cards.
import { CATS, DEFS, ERAS, FAMS } from '../../core/config/catalog.js';
import { costFor, canAfford, blueprintPriceFor, canAffordCoins } from '../../core/commands/commands.js';
import { blueprintsOf } from '../../core/domain/blueprint.js';
import { $, ico, KIND_KEY } from './dom.js';
import { t } from './i18n.js';

const CAT_ICON = { paths: 'i-road', homes: 'i-home', shops: 'i-shop', industry: 'i-factory', services: 'i-civic', green: 'i-leaf', decor: 'i-blossom', custom: 'i-up' };
/** Catalogue tabs: the catalogue categories, then the player's own designs. */
export const TABS = Object.freeze([...CATS, 'custom']);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

/**
 * The player's designs (latest version of each): a "new design" card, then one card per design with its picture,
 * name, base type and price; a pencil button opens it in the editor. Locked base types cannot be built yet.
 */
function customItems(state, unlocked, bpThumb, active) {
  const list = Object.values(blueprintsOf(state)).sort((a, b) => +a.id.slice(2) - +b.id.slice(2)).map(e => e.versions[e.latest]);
  const card = bp => { const lock = !unlocked.has(bp.baseType), price = blueprintPriceFor(state, bp);
    return `<div class="item-wrap"><button class="item ${active === bp.id ? 'on' : ''} ${lock ? 'locked' : ''} ${!lock && !canAffordCoins(state, price) ? 'poor' : ''}" data-bp="${bp.id}" title="${esc(bp.name)}">${lock ? `<span class="badge lock">${t('locked')}</span>` : `<span class="badge">v${bp.version}</span>`}<span class="th"><img alt="" src="${bpThumb ? bpThumb(bp) : ''}"></span><span class="tag kc-${DEFS[bp.baseType].kind}">${t('n_' + bp.baseType)}</span><span class="nm">${esc(bp.name)}</span><span class="meta">${DEFS[bp.baseType].s}×${DEFS[bp.baseType].s}</span><span class="pr">${lock ? ico('i-lock', '') : price ? `${ico('i-coin', '')}${price}` : t('free')}</span></button>
      <button class="item-edit" data-editbp="${bp.id}" aria-label="${t('ed_editX', { name: esc(bp.name) })}" title="${t('ed_edit')}">✎</button></div>`; };
  return `<button class="item new-design" data-newbp="1"><span class="th big">＋</span><span class="nm">${t('ed_new')}</span><span class="meta">${t('ed_newHint')}</span></button>${list.map(card).join('')}`;
}

export function renderCatalog({ state }, prefs, unlocked, thumbs, activeType, { bpThumb = null, activeBlueprint = null } = {}) {
  const designs = Object.keys(blueprintsOf(state)).length;
  $('tabs').innerHTML = CATS.map(c => { const n = Object.keys(DEFS).filter(k => DEFS[k].cat === c); const hasNew = n.some(k => prefs.newT.includes(k));
    return `<button class="tab k-${c} ${prefs.tab === c ? 'on' : ''}" data-cat="${c}">${ico(CAT_ICON[c])}${hasNew ? '<span class="dot"></span>' : ''}<span>${t('cat_' + c)}</span> <small>${n.filter(k => unlocked.has(k)).length}/${n.length}</small></button>`; }).join('')
    + `<button class="tab k-custom ${prefs.tab === 'custom' ? 'on' : ''}" data-cat="custom">${ico(CAT_ICON.custom)}<span>${t('cat_custom')}</span> <small>${designs}</small></button>`;
  if (prefs.tab === 'custom') { $('filters').hidden = true; $('items').innerHTML = customItems(state, unlocked, bpThumb, activeBlueprint); return; }
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
export const affordKey = ({ state }, prefs) => prefs.tab === 'custom'
  ? Object.values(blueprintsOf(state)).map(e => canAffordCoins(state, blueprintPriceFor(state, e.versions[e.latest])) ? 1 : 0).join('')
  : Object.keys(DEFS).filter(k => DEFS[k].cat === prefs.tab).map(k => canAfford(state, k) ? 1 : 0).join('');
