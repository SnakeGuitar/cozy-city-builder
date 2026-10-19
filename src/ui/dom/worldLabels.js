// HTML labels pinned to world positions: rising +coin floaters, "no road"/"vacant" badges, relation chips.
// World → screen projection is supplied by the view, so this module knows nothing about Three.js.
import { $, ico } from './dom.js';
import { t } from './i18n.js';

export function createWorldLabels(view) {
  const layer = $('world-ui');
  const floaters = []; let badges = [], chips = [];
  const place = (el, p, extra) => { const [x, y] = view.project(p); el.style.transform = `translate(${x}px,${y}px) ${extra}`; };
  return {
    floater(pos, html, cls = '', life = 1.8) { const el = document.createElement('div'); el.className = 'floater ' + cls; el.innerHTML = html; layer.appendChild(el); floaters.push({ el, pos, t: 0, life }); },
    /** Buildings that need attention: disconnected, or a shop standing vacant. */
    badges(state, derived) {
      badges.forEach(b => b.el.remove()); badges = [];
      for (const rec of Object.values(derived.byId)) {
        if (!['house', 'shop', 'industry', 'service', 'utility'].includes(rec.kind)) continue;
        const icon = !rec.conn ? 'i-road' : rec.kind === 'shop' && rec.open === false ? 'i-closed' : null; if (!icon) continue;
        const el = document.createElement('div'); el.className = 'badge3d'; el.title = t(rec.conn ? 'st_vacant' : 'disconnected'); el.innerHTML = ico(icon, ''); layer.appendChild(el);
        badges.push({ el, pos: view.topOf(state.buildings[rec.id], .45) });
      }
    },
    chips(list) { chips.forEach(c => c.el.remove()); chips = list.map(({ pos, html, kind }) => { const el = document.createElement('div'); el.className = 'chipfx ' + kind; el.innerHTML = html; layer.appendChild(el); return { el, pos }; }); },
    update(dt) {
      for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.t += dt; if (f.t > f.life) { f.el.remove(); floaters.splice(i, 1); continue; }
        const k = f.t / f.life, p = f.pos.clone(); p.y += f.t * .45;
        place(f.el, p, `translate(-50%,-100%) scale(${.8 + Math.min(1, f.t * 6) * .2})`); f.el.style.opacity = k < .7 ? Math.min(1, f.t * 6) : 1 - (k - .7) / .3; }
      for (const b of badges) { const [x, y] = view.project(b.pos); b.el.style.transform = `translate(${x - 12}px,${y - 12}px)`; }
      for (const c of chips) place(c.el, c.pos, 'translate(-50%,-50%)');
    },
  };
}
