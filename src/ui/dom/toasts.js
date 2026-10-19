import { $ } from './dom.js';
/** Short notices at the top of the screen; at most three at once. */
export function toast(html, cls = '', ms = 3200) {
  const box = $('toasts'); while (box.children.length >= 3) box.firstChild.remove();
  const el = document.createElement('div'); el.className = 'toast ' + cls; el.innerHTML = html; box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 500); }, ms);
}
