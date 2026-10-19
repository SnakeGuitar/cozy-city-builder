// City panel: demand with reasons, population and jobs, services, utilities and money.
import { SVC_GROUPS, UTILS } from '../../core/config/catalog.js';
import { $, ico, meter, pct } from './dom.js';
import { t, fmt } from './i18n.js';

export function renderCityPanel({ state, derived }) {
  const el = $('city'); if (el.hidden) return;
  const city = derived.city, E = derived.employed;
  const dm = k => { const v = Math.round(state.demand[k]); return `<div class="dem"><div class="dem-h"><b class="dk ${k}">${t('dem_' + k)}</b><span class="dbar"><i class="${v < 0 ? 'neg' : ''}" style="${v < 0 ? 'right:50%' : 'left:50%'};width:${Math.abs(v) / 2}%"></i></span><b class="num">${v > 0 ? '+' : ''}${v}</b></div><ul>${city.reasons[k].map(r => `<li>${t(r)}</li>`).join('')}</ul></div>`; };
  const svcRow = g => { let cap = 0, load = 0, got = 0, total = 0, n = 0; for (const k of SVC_GROUPS[g]) { const s = city.svc[k]; if (!s) continue; cap += s.cap; load += s.load; got += s.got; total += s.total; n += s.n; }
    const cov = total ? got / total : 1; return `<tr><td>${t('grp_' + g)}</td><td>${n ? `${fmt(load)}/${fmt(cap)}` : `<em>${t('none')}</em>`}</td><td>${meter(cov, 1, cov < .6 ? 'bad' : '')}<b>${total ? pct(cov) : '—'}</b></td></tr>`; };
  const utilRow = u => { const x = city.util[u] || { use: 0, supply: 0, ratio: 1 }; return `<tr><td>${t('util_' + u)}</td><td>${fmt(x.use)}/${fmt(x.supply)}</td><td>${meter(x.use, x.supply, x.ratio < 1 ? 'bad' : '')}<b>${x.ratio < 1 ? pct(x.ratio) : 'OK'}</b></td></tr>`; };
  const html = `<button class="close" id="c-close" aria-label="${t('close')}">×</button><h3>${ico('i-chart')}${t('cityPanel')}</h3>
    <section>${dm('r')}${dm('c')}${dm('i')}</section>
    <section><h4>${t('sec_people')}</h4><div class="kv">
      <span>${t('residents')}</span><b>${fmt(state.population)} / ${fmt(city.Rcap)}</b>
      <span>${t('vacantHomes')}</span><b>${city.vacantHomes} · ${fmt(Math.max(0, city.Rcap - state.population))} ${t('places')}</b>
      ${city.homeless ? `<span>${t('homeless')}</span><b>${city.homeless}</b>` : ''}
      <span>${t('jobs')}</span><b>${fmt(city.J)}</b>
      <span>${t('workforce')}</span><b>${fmt(city.W)}</b>
      <span>${t('employed')}</span><b>${fmt(E)}</b>
      <span>${t('unemployed')}</span><b>${fmt(Math.max(0, city.W - E))}</b>
      <span>${t('openJobs')}</span><b>${fmt(Math.max(0, city.J - E))}</b>
      <span>${t('vacantShops')}</span><b>${city.vacantShops}</b>
      <span>${t('idleIndustry')}</span><b>${city.idleInd}</b></div></section>
    <section><h4>${t('sec_services')}</h4><table class="svc"><tbody>${Object.keys(SVC_GROUPS).map(svcRow).join('')}${UTILS.map(utilRow).join('')}</tbody></table></section>
    <section><h4>${t('sec_money')}</h4><div class="kv">
      <span>${t('inc_shops')}</span><b>+${fmt(city.income.shops)}${t('perMin')}</b>
      <span>${t('inc_industry')}</span><b>+${fmt(city.income.industry)}${t('perMin')}</b>
      <span>${t('inc_tax')}</span><b>+${fmt(city.income.tax)}${t('perMin')}</b>
      <span>${t('upkeep')}</span><b>−${fmt(city.upkeep)}${t('perMin')}</b>
      <span><b>${t('net')}</b></span><b class="${city.net < 0 ? 'neg' : 'pos'}">${city.net >= 0 ? '+' : '−'}${fmt(Math.abs(city.net))}${t('perMin')}</b>
      <span>${t('goods')}</span><b>${fmt(city.prod)} / ${fmt(city.goodsNeed)}</b></div>
      ${state.coins <= 0 ? `<p class="warn">${t('broke')}</p>` : ''}</section>`;
  if (html === el._html) return;
  el._html = html; el.innerHTML = html;
  $('c-close').onclick = () => { el.hidden = true; };
}
