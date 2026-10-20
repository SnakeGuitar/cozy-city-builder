// Limoni — Villa Limón's mascot: an original anthropomorphic fox with lemon-zest fur, a cream muzzle,
// leaf-tipped ears, a lemon-slice hair clip and a sage scarf. Drawn here as layered SVG so it needs no files.
//
// This module is the single place that knows what the mascot looks like. A later version (e.g. a Godot scene
// with animations) only has to provide the same entries: a name key and one picture per mood.
export const MOODS = Object.freeze(['wave', 'happy', 'point', 'think', 'cheer', 'alert']);

const INK = '#5b3e2c', FUR = '#f0a83c', FUR_D = '#d9822b', ZEST = '#f6c94a', CREAM = '#fbf1dc', LEAF = '#6e9a33', SCARF = '#8fb36a';

function eyes(mood) {
  if (mood === 'cheer' || mood === 'happy') return `<path d="M44 58q5-6 10 0M66 58q5-6 10 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  if (mood === 'think') return `<circle cx="49" cy="58" r="4" fill="${INK}"/><path d="M66 58h10" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
  if (mood === 'alert') return `<circle cx="49" cy="57" r="5" fill="${INK}"/><circle cx="71" cy="57" r="5" fill="${INK}"/><circle cx="50.5" cy="55.5" r="1.6" fill="#fff"/><circle cx="72.5" cy="55.5" r="1.6" fill="#fff"/>`;
  return `<circle cx="49" cy="58" r="4.2" fill="${INK}"/><circle cx="71" cy="58" r="4.2" fill="${INK}"/><circle cx="50.4" cy="56.6" r="1.4" fill="#fff"/><circle cx="72.4" cy="56.6" r="1.4" fill="#fff"/>`;
}
function mouth(mood) {
  if (mood === 'cheer') return `<path d="M52 74q8 10 16 0z" fill="#b34a3a" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
  if (mood === 'alert') return `<ellipse cx="60" cy="75" rx="4" ry="3.4" fill="#b34a3a" stroke="${INK}" stroke-width="2"/>`;
  if (mood === 'think') return `<path d="M54 75q6 2 12-1" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  return `<path d="M53 73q7 7 14 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
}
function paw(mood) {
  if (mood === 'wave') return `<g class="paw wave"><path d="M95 92q10-14 6-28" stroke="${FUR_D}" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="101" cy="62" r="7" fill="${FUR}" stroke="${INK}" stroke-width="2"/></g>`;
  if (mood === 'point') return `<g class="paw"><path d="M92 96q14-2 22-10" stroke="${FUR_D}" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="115" cy="85" r="6.5" fill="${FUR}" stroke="${INK}" stroke-width="2"/></g>`;
  if (mood === 'cheer') return `<g class="paw"><path d="M26 92q-10-16-4-30M94 92q10-16 4-30" stroke="${FUR_D}" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="21" cy="60" r="7" fill="${FUR}" stroke="${INK}" stroke-width="2"/><circle cx="99" cy="60" r="7" fill="${FUR}" stroke="${INK}" stroke-width="2"/></g>`;
  if (mood === 'think') return `<g class="paw"><path d="M80 104q2-14-8-22" stroke="${FUR_D}" stroke-width="9" fill="none" stroke-linecap="round"/><circle cx="71" cy="81" r="6" fill="${FUR}" stroke="${INK}" stroke-width="2"/></g>`;
  return '';
}
/** The portrait for a mood, as an SVG string (viewBox 0 0 120 130). */
export function mascotSvg(mood = 'wave') {
  const m = MOODS.includes(mood) ? mood : 'wave';
  return `<svg viewBox="0 0 120 130" class="limoni mood-${m}" aria-hidden="true">
  <defs><radialGradient id="lm-fur" cx=".45" cy=".35" r=".7"><stop offset="0" stop-color="${ZEST}"/><stop offset=".55" stop-color="${FUR}"/><stop offset="1" stop-color="${FUR_D}"/></radialGradient></defs>
  <path d="M30 128q-4-34 30-38q34 4 30 38z" fill="url(#lm-fur)" stroke="${INK}" stroke-width="2.4"/>
  <path d="M46 96q14 8 28 0l-2 9q-12 6-24 0z" fill="${SCARF}" stroke="${INK}" stroke-width="2"/><path d="M70 102l8 18-9-3z" fill="${SCARF}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M50 112q10 10 20 0" fill="${CREAM}" stroke="${INK}" stroke-width="1.6"/>
  <path d="M84 118q26-6 30-30q-12 12-28 14z" fill="url(#lm-fur)" stroke="${INK}" stroke-width="2.2"/><path d="M106 96q6-4 8-8q-2 10-10 14z" fill="${CREAM}"/>
  ${paw(m)}
  <path d="M28 46L22 10L48 30z" fill="url(#lm-fur)" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M92 46L98 10L72 30z" fill="url(#lm-fur)" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M27 36L24 16L40 30z" fill="${CREAM}"/><path d="M93 36L96 16L80 30z" fill="${CREAM}"/>
  <path d="M22 10q-6 4-3 10q5-4 3-10zM98 10q6 4 3 10q-5-4-3-10z" fill="${LEAF}" stroke="${INK}" stroke-width="1.4"/>
  <path d="M20 58q0-30 40-30q40 0 40 30q0 18-14 26q-12 8-26 8q-14 0-26-8q-14-8-14-26z" fill="url(#lm-fur)" stroke="${INK}" stroke-width="2.6"/>
  <path d="M34 66q8 22 26 22q18 0 26-22q-8 6-26 6q-18 0-26-6z" fill="${CREAM}"/>
  <ellipse cx="60" cy="68" rx="6" ry="4.4" fill="${INK}"/><ellipse cx="58.6" cy="66.8" rx="1.8" ry="1.1" fill="#fff" opacity=".7"/>
  ${eyes(m)}${mouth(m)}
  <circle cx="38" cy="70" r="5" fill="#f08a6a" opacity=".45"/><circle cx="82" cy="70" r="5" fill="#f08a6a" opacity=".45"/>
  <g transform="translate(78 34) rotate(18)"><circle r="9" fill="${ZEST}" stroke="${INK}" stroke-width="1.8"/><circle r="6.6" fill="#fbefb4"/><path d="M0-6.6V6.6M-6.6 0H6.6M-4.6-4.6L4.6 4.6M4.6-4.6L-4.6 4.6" stroke="#d9b32a" stroke-width="1"/></g>
  </svg>`;
}
export const MASCOT = Object.freeze({ id: 'limoni', nameKey: 'mascot_name', portrait: mascotSvg, moods: MOODS });
