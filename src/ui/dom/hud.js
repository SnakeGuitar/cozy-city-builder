// Top bar: coins and net income, residents, wellbeing, R·C·I meters, day, speed, sound.
import { $, ico } from './dom.js';
import { t, fmt } from './i18n.js';

const demBar = v => { const h = Math.min(13, Math.abs(v) / 100 * 13); return v >= 0 ? `<i style="bottom:13px;height:${h}px"></i>` : `<i class="neg" style="top:13px;height:${h}px"></i>`; };
/** rules: the game's rules (core/config/rules.js); settings: global player settings (sound …). */
export function renderHud({ state, derived }, settings, rules) {
  const city = derived.city, net = Math.round(city.net);
  $('v-coins').textContent = rules.unlimitedMoney ? '∞' : fmt(state.coins);
  $('c-mode').hidden = rules.mode === 'normal'; $('c-mode').textContent = t('mode_' + rules.mode);
  $('v-net').textContent = (net >= 0 ? '+' : '−') + fmt(Math.abs(net)) + t('perMin'); $('v-net').classList.toggle('neg', net < 0);
  $('v-pop').textContent = `${fmt(state.population)}/${fmt(city.Rcap)}`;
  $('v-well').textContent = Math.round(city.well); $('v-wbar').style.width = Math.round(city.well) + '%';
  for (const k of ['r', 'c', 'i']) $('d-' + k).innerHTML = demBar(state.demand[k]);
  $('b-city').title = `${t('demand')} — R ${Math.round(state.demand.r)} · C ${Math.round(state.demand.c)} · I ${Math.round(state.demand.i)}`;
  $('v-day').textContent = t('day', { n: state.clock.day });
  const paused = state.clock.paused, pb = $('b-pause');
  pb.classList.toggle('on', paused); pb.innerHTML = ico(paused ? 'i-play' : 'i-pause'); pb.title = t(paused ? 'play' : 'pause'); pb.setAttribute('aria-label', pb.title);
  for (const n of [1, 2, 3]) $('b-s' + n).classList.toggle('on', !paused && state.clock.speed === n);
  $('snd-use').setAttribute('href', settings.muted ? '#i-mute' : '#i-snd'); $('b-snd').title = t(settings.muted ? 'soundOn' : 'soundOff'); $('b-snd').setAttribute('aria-label', $('b-snd').title);
}
/** Day/night: tint overlay and sun/moon icon. */
export function renderLight(light) {
  const el = $('tint'); el.style.backgroundColor = light.tint; el.style.opacity = light.tintOpacity;
  const want = light.night > .5 ? 'moon' : 'sun', ic = $('clock-ico');
  if (ic.dataset.v !== want) { ic.dataset.v = want; ic.innerHTML = `<use href="#i-${want}"/>`; }
}
/** Paper grain overlay, generated once. */
export function paintPaper(rng) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), r = rng(5); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) { const v = 200 + r() * 55; x.fillStyle = `rgba(${v},${v - 8},${v - 22},${.25 + r() * .3})`; x.fillRect(r() * 256, r() * 256, 1 + r() * 1.5, 1); }
  for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(170,140,100,${.08 + r() * .1})`; x.lineWidth = .6; x.beginPath(); const sx = r() * 256, sy = r() * 256; x.moveTo(sx, sy); x.quadraticCurveTo(sx + r() * 20 - 10, sy + r() * 20 - 10, sx + r() * 30 - 15, sy + r() * 30 - 15); x.stroke(); }
  $('paper').style.backgroundImage = `url(${c.toDataURL()})`;
}
