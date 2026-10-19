// The goals card: the next three goals, with completed ones lingering briefly.
import { GOALS } from '../../core/config/goals.js';
import { goalProgress } from '../../core/goals/goals.js';
import { $ } from './dom.js';
import { t } from './i18n.js';

export function renderGoals({ state, derived }, justDone, now) {
  const show = [];
  for (const g of GOALS) { const done = state.goalsDone.includes(g.id); if (done && !(justDone.has(g.id) && now - justDone.get(g.id) < 4000)) continue; show.push(g); if (show.length >= 3) break; }
  if (!show.length) { $('goals').hidden = true; return; } $('goals').hidden = false;
  $('goal-list').innerHTML = show.map(g => { const done = state.goalsDone.includes(g.id), [a, b] = goalProgress(g, state, derived);
    return `<div class="goal ${done ? 'done' : ''} ${justDone.has(g.id) && now - justDone.get(g.id) < 1300 ? 'flash' : ''}"><span class="box">${done ? '<svg width="14" height="14" viewBox="0 0 20 20"><use href="#i-check"/></svg>' : ''}</span><span class="txt">${t(g.id)}<span class="rw">+${g.reward} ${g.unlock.length ? '· ' + g.unlock.map(u => t('n_' + u)).join(', ') : ''}</span></span><span class="prog">${done ? '' : `${Math.min(a, b)}/${b}`}</span></div>`; }).join('');
}
