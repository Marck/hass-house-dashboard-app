// Screen C: energy and property overview.
import { icon } from '../icons.js';
import { propertyArt, chipStyle } from '../art/property.js';
import { sparkline, socChart, rings, meter, batteryArt } from '../charts.js';
import { act, live, cardGrid } from './parts.js';
import { evCard } from './ev.js';

/** The values shown as callouts on the artwork, and as tiles on phones. */
function flowItems({ d, t, f }) {
  const e = d.energy;
  const zone = (z) => ({
    key: z.id, icon: 'drop', tone: 'blue', value: t(z.nameKey),
    label: t(d.irrigation.running === z.id ? 'irr.running' : 'energy.idle'), slim: true,
  });
  return [
    { key: 'house', icon: 'home', tone: 'blue', value: f.unit(e.house, 'W'), label: t('energy.house') },
    { key: 'solar', icon: 'sun', tone: 'amber', value: f.unit(e.solar, 'W'), label: t('energy.solar') },
    { key: 'battery', icon: 'battery', tone: 'teal', value: f.pct(e.battery.soc), label: t('energy.charging', { watts: f.unit(e.battery.power, 'W') }) },
    { key: 'generator', icon: 'bolt', tone: 'red', value: t(`energy.generator.${e.generator}`), label: t('energy.generator') },
    zone(d.irrigation.zones[0]),
    zone(d.irrigation.zones[1]),
  ];
}

const callout = (item, style) => `<button type="button" class="callout${item.slim ? ' is-slim' : ''} tone-${item.tone}"${style ? ` data-style="${style}"` : ''} ${act('flow', item.key)}>
  <span class="ic-box">${icon(item.icon)}</span><span class="callout-text"><b>${item.value}</b><small>${item.label}</small></span></button>`;

function hero(c) {
  const { s, d, t, f } = c;
  const e = d.energy;
  const items = flowItems(c);
  const art = s.layout === 'phone'
    ? `<div class="flow-grid">${items.map((item) => callout(item, '')).join('')}</div>`
    : `<div class="property-art">${propertyArt(t('energy.artLabel'))}${items.map((item) => callout(item, chipStyle(item.key))).join('')}</div>`;
  return `<section class="card hero">
    <div class="hero-art">
      <div class="chips">${live(c)}<span class="chip">${icon('sun')}${f.unit(d.weather.temp, '°C')}, ${t(d.weather.conditionKey)}</span></div>
      ${art}
    </div>
    <aside class="tile status">
      <header><span class="ic-box">${icon('star')}</span><h2>${t('energy.status')}</h2><time>${f.time(d.now.h, d.now.m)}</time></header>
      <h3>${t('energy.status.headline')}</h3>
      <p>${t('energy.status.body', { hz: f.num(e.frequency, 2), watts: f.unit(e.solar, 'W'), potential: f.unit(e.solarPotential, 'kW', 2) })}</p>
      <div class="pair">
        <div class="tile"><small>${t('energy.free')}</small><b>≈ ${f.unit(e.free, 'kW', 2)}</b></div>
        <div class="tile"><small>${t('energy.untilSunset')}</small><b>≈ ${f.unit(e.untilSunset, 'kWh', 1)}</b></div>
      </div>
      <p class="tip">${icon('bulb')}<span>${t('energy.tip')}</span></p>
    </aside>
  </section>`;
}

function batteryCard({ d, t, f }) {
  const b = d.energy.battery;
  return `<section class="card" id="card-battery">
    <header class="card-head"><span class="ic-box">${icon('battery')}</span><h2>${t('battery.title')}</h2><span class="muted">${t('battery.model', { kwh: f.unit(b.capacity, 'kWh') })}</span></header>
    <div class="batt">
      ${batteryArt(b.soc, [75, b.startAt])}
      <div class="batt-main">
        <p class="big">${f.num(b.soc)}<sup>%</sup></p>
        <p>${t('battery.stored', { stored: f.num(b.stored, 1), capacity: f.unit(b.usable, 'kWh', 1) })}</p>
        <p class="muted">${t('battery.health', { pct: f.pct(b.health), kwh: f.unit(b.capacity, 'kWh') })}</p>
        <p><span class="chip is-teal">↑ ${t('battery.charging', { watts: f.unit(b.power, 'W') })}</span></p>
        <div class="pair">
          <div class="tile"><small>${t('battery.lasts')}</small><b>${t('battery.lastsValue', { d: f.num(b.lastsDays), h: f.num(b.lastsHours) })}</b></div>
          <div class="tile"><small>${t('battery.temp')}</small><b>${f.unit(b.temp, '°C')}</b></div>
        </div>
      </div>
    </div>
    <div class="chart-head"><b>${t('battery.today')}</b><span class="muted">${t('battery.generatorAt', { pct: f.pct(b.startAt) })}</span></div>
    ${socChart(b.history, b.historyUntil, b.startAt, { label: t('battery.chartLabel', { pct: f.pct(b.soc) }) })}
    <div class="axis" aria-hidden="true"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>
  </section>`;
}

function balanceCard({ d, t, f }) {
  const b = d.energy.balance;
  const row = (cls, title, sub, value) => `<li><i class="dot ${cls}"></i><span><b>${title}</b><small>${sub}</small></span><strong>${value}</strong></li>`;
  return `<section class="card">
    <header class="card-head"><span class="ic-box">${icon('ring')}</span><h2>${t('balance.title')}</h2><span class="muted">${t('balance.until', { time: f.time(d.now.h, d.now.m) })}</span></header>
    <div class="balance">
      <div class="rings-wrap">${rings([{ value: b.autarky, cls: 'is-teal' }, { value: b.solarUsed, cls: 'is-amber' }, { value: b.forecastPct, cls: 'is-blue' }], { label: t('balance.chartLabel') })}
        <p class="rings-center"><b>${f.num(b.autarky)}<sup>%</sup></b><small>${t('balance.selfSufficient')}</small></p></div>
      <ul class="balance-list">
        ${row('is-teal', t('balance.autarky'), t('balance.autarkySub'), f.pct(b.autarky))}
        ${row('is-amber', t('balance.solarUsed'), t('balance.solarUsedSub', { kwh: f.unit(b.curtailed, 'kWh', 1) }), f.pct(b.solarUsed))}
        ${row('is-blue', t('balance.forecast'), t('balance.forecastSub', { done: f.num(b.forecastDone, 1), total: f.unit(b.forecastTotal, 'kWh', 1) }), f.pct(b.forecastPct))}
        ${row('is-muted', t('balance.consumed'), t('balance.consumedSub'), f.unit(b.consumed, 'kWh', 1))}
      </ul>
    </div>
  </section>`;
}

function consumptionCard({ d, t, f }) {
  const e = d.energy;
  const max = Math.max(...e.consumption.top.map((x) => x.watts)) * 1.6;
  const top = e.consumption.top.map((x) => `<li><span>${t(x.nameKey)}</span><b>${f.unit(x.watts, 'W')}</b>${meter(x.watts, max)}</li>`).join('');
  return `<section class="card">
    <header class="card-head"><span class="ic-box">${icon('home')}</span><h2>${t('cons.title')}</h2>
      <button type="button" class="btn" ${act('details')}><span>${t('common.details')}</span>${icon('chevron')}</button></header>
    <p class="big">${f.num(e.house)}<sup>W</sup></p>
    <p class="muted">${t('cons.today', { kwh: f.unit(e.consumption.today, 'kWh', 1), base: f.unit(e.consumption.base, 'W') })}</p>
    ${sparkline(e.consumption.series, { w: 320, h: 90, lo: 0, label: t('cons.chartLabel') })}
    <ul class="meter-list">${top}</ul>
  </section>`;
}

const ENERGY_CARDS = { battery: batteryCard, balance: balanceCard, consumption: consumptionCard, ev: evCard };

export function energyView(c) {
  const { t } = c;
  return `<div class="page-head"><div><h1>${t('energy.title')}</h1><p class="lead">${t('energy.lead')}</p></div>
      <button type="button" class="icon-btn" aria-label="${t('common.notifications')}" ${act('bell')}>${icon('bell')}</button></div>
    ${hero(c)}
    ${cardGrid(c, 'energy', ENERGY_CARDS, 'grid-energy')}`;
}
