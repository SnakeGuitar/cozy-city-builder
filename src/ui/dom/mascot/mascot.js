// The mascot bubble: shows neutral `mascot_message_requested` events in the player's language.
// Tutorial lines are sticky (they stay until the next one); tips and celebrations fade after a few seconds
// and the sticky line comes back. Hidden entirely when the player turns Limoni off in the settings.
import { $ } from '../dom.js';
import { t } from '../i18n.js';
import { MASCOT } from './assets.js';

const SHOW_MS = 7000;
/** Turn a request's params (ids only) into words. */
export function mascotText(req) {
  const p = req.params || {}, vars = {};
  if (p.goalId) vars.goal = t(p.goalId);
  if (p.types) vars.types = p.types.map(x => t('n_' + x)).join(', ');
  if (p.buildingType) vars.building = t('n_' + p.buildingType);
  return t(req.messageId, vars);
}

export function createMascot(prefs) {
  const el = $('mascot');
  let sticky = null, current = null, timer = null;
  function render(req) {
    current = req;
    if (!req || !prefs.mascot) { el.classList.add('hide'); return; }
    $('mascot-portrait').innerHTML = MASCOT.portrait(req.mood);
    $('mascot-name').textContent = t(MASCOT.nameKey);
    $('mascot-text').textContent = mascotText(req);
    el.classList.remove('hide'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }
  $('mascot-x').onclick = () => { if (current === sticky) sticky = null; clearTimeout(timer); timer = null; render(sticky); };
  return {
    show(req) {
      if (req.sticky) {
        sticky = req;
        if (timer) return;                // a celebration or tip is on screen: the tutorial line follows it
        render(req); return;
      }
      if (req.reason === 'tutorial') sticky = null;   // the closing tutorial line ends the sticky chain
      clearTimeout(timer); render(req);
      timer = setTimeout(() => { timer = null; render(sticky); }, SHOW_MS);
    },
    clear() { sticky = null; clearTimeout(timer); timer = null; render(null); },
    refresh() { render(current); },   // language or visibility changed
  };
}
