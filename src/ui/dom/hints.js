// Tutorial hints: one small, non-blocking bubble chosen from the current progress.
import { $ } from './dom.js';
import { t } from './i18n.js';

export function hintKey({ state, derived }, prefs) {
  if (!prefs.tips) return null;
  const tut = prefs.tut, done = state.goalsDone;
  if (!tut.moved && tut.age < 14) return 'h_welcome';
  if (!done.includes('g1')) return Object.values(derived.byId).some(b => b.kind === 'house' && !b.conn) ? 'h_connect' : 'h_house';
  if (!done.includes('g2')) return 'h_bakery';
  if (!done.includes('g3')) return 'h_garden';
  if (!tut.city) return 'h_city';
  if (derived.city.utilMin < .98) return 'h_utils';
  if (state.population > 20 && derived.city.svcScore < .5) return 'h_services';
  if (tut.free < 25) return 'h_free';
  return null;
}
let last = '';
export function renderHint(snapshot, prefs, force = false) {
  const k = hintKey(snapshot, prefs); if (k === last && !force) return; last = k;
  const h = $('hint'); if (!k) { h.classList.add('hide'); return; }
  $('hint-text').textContent = t(k); h.classList.remove('hide');
}
