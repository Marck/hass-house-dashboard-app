// Optional EV charging card. It shows only the statistics the user mapped to
// an entity; nothing is hardcoded to a vehicle, charger or integration.
import { icon } from '../icons.js';
import { evStats } from '../model.js';
import { EV_SLOTS } from '../config.js';
import { batteryArt, sparkline } from '../charts.js';
import { act, seg, showId } from './parts.js';

export const EV_PERIODS = ['day', 'week', 'month'];
export const SLOT_ICONS = { status: 'plug', power: 'bolt', energy: 'battery', soc: 'car', duration: 'gauge', cost: 'star' };

/** A statistic as display text. Errors are spelled out, never shown as zero. */
export function evValueText({ t, f }, slot, stat) {
  if (stat.error === 'missing') return t('entity.notFound');
  if (stat.error) return t('ev.unavailable');
  if (slot === 'status') return t(stat.charging ? 'ev.charging' : 'ev.notCharging');
  if (slot === 'power') return f.unit(stat.value, 'kW', 1);
  if (slot === 'energy') return f.unit(stat.value, 'kWh', 1);
  if (slot === 'soc') return f.pct(stat.value);
  if (slot === 'duration') return t('ev.durationValue', { h: f.num(Math.floor(stat.minutes / 60)), m: f.num(stat.minutes % 60) });
  return f.money(stat.value, stat.currency);
}

export function evCard(c) {
  const { s, d, cfg, t, f } = c;
  const stats = evStats(d, cfg);
  const shown = EV_SLOTS.filter((slot) => stats[slot]);
  const ok = (slot) => stats[slot] && !stats[slot].error;
  const gear = `<button type="button" class="icon-btn is-small" aria-label="${t('ev.configure')}" ${act('settings')}>${icon('gear')}</button>`;
  const head = `<header class="card-head"><span class="ic-box">${icon('car')}</span><h2>${t('card.ev')}</h2>
    <span class="muted">${t('ev.count', { n: f.num(shown.length), total: f.num(EV_SLOTS.length) })}</span>${gear}</header>`;
  if (!shown.length) {
    return `<section class="card" id="card-ev">${head}<p class="muted">${t('ev.empty')}</p>
      <div class="btn-row"><button type="button" class="btn" ${act('settings')}>${icon('gear')}<span>${t('ev.choose')}</span></button></div></section>`;
  }

  const status = stats.status;
  let chip = '';
  if (status && status.error) chip = `<span class="chip is-amber">${icon('alert')}${evValueText(c, 'status', status)}</span>`;
  else if (status) chip = `<span class="chip${status.charging ? ' is-teal' : ''}">${icon('plug')}${evValueText(c, 'status', status)}</span>`;

  // The headline is the charging power when there is one, else the vehicle battery.
  const lead = ok('power') ? 'power' : ok('soc') ? 'soc' : null;
  const big = lead === 'power'
    ? `<p class="big">${f.num(stats.power.value, 1)}<sup>kW</sup></p>`
    : lead === 'soc' ? `<p class="big">${f.num(stats.soc.value)}<sup>%</sup></p>` : '';
  const tiles = shown.filter((slot) => slot !== 'status' && slot !== lead).map((slot) => {
    const stat = stats[slot];
    const extra = stat.error === 'missing' ? `<small class="mono">${showId(stat.id)}</small>` : '';
    return `<div class="tile${stat.error ? ' is-missing' : ''}"><small>${t(`ev.slot.${slot}`)}</small><b>${evValueText(c, slot, stat)}</b>${extra}</div>`;
  }).join('');

  let history = '';
  if (ok('energy')) {
    const period = EV_PERIODS.includes(s.evPeriod) ? s.evPeriod : 'day';
    const values = d.ev.history[period];
    const total = values.reduce((sum, v) => sum + v, 0);
    history = `<div class="chart-head"><b>${t('ev.history')}</b><span class="muted">${t('ev.total', { kwh: f.unit(total, 'kWh', 1) })}</span></div>
      ${seg(t('ev.period'), EV_PERIODS.map((p) => ({ label: t(`ev.period.${p}`), on: p === period, attrs: act('ev-period', p) })), 'seg-full')}
      ${sparkline(values, { w: 320, h: 90, lo: 0, label: t('ev.historyLabel', { period: c.tx(`ev.period.${period}`), kwh: f.unit(total, 'kWh', 1) }) })}`;
  }

  return `<section class="card" id="card-ev">${head}
    <div class="batt">
      ${ok('soc') ? batteryArt(stats.soc.value, [], 'ev') : ''}
      <div class="batt-main">${big}${chip ? `<p>${chip}</p>` : ''}${tiles ? `<div class="pair">${tiles}</div>` : ''}</div>
    </div>${history}</section>`;
}
