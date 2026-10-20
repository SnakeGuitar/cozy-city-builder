// Small DOM helpers shared by the views.
export const $ = id => document.getElementById(id);
export const ico = (id, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 20 20"><use href="#${id}"/></svg>`;
export const pct = v => Math.round(v * 100) + '%';
export function meter(v, max, cls = '') { const w = max ? Math.min(100, v / max * 100) : 0; return `<span class="meter ${cls}"><i style="width:${w}%"></i></span>`; }
export function bump(id) { const el = $(id); if (!el) return; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
export const KIND_KEY = { road: 'k_road', house: 'k_house', shop: 'k_shop', industry: 'k_industry', service: 'k_service', utility: 'k_utility', nature: 'k_nature', deco: 'k_deco' };
/** Keeps Tab / Shift+Tab inside a modal `root` (its first and last focusable elements wrap around). */
export function trapTab(root, e) {
  if (e.key !== 'Tab') return;
  const list = [...root.querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
  if (!list.length) return;
  const first = list[0], last = list.at(-1);
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
