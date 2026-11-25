// Screen C: energy and property overview.
import { icon } from '../icons.js';
import { propertyArt, chipStyle } from '../art/property.js';
import { sparkline, socChart, rings, meter, batteryArt } from '../charts.js';
import { esc } from '../util.js';
import { act, live, cardGrid, demoNote } from './parts.js';
import { evCard } from './ev.js';

/** Live: only what Home Assistant provides; irrigation and the generator are not live, so they are left out. */
function liveFlowItems({ d, t, f }) {
  const e = d.energy;
  const items = [];
  if (e.house !== null) items.push({ key: 'house', icon: 'home', tone: 'blue', value: f.unit(e.house, 'W'), label: t('energy.house') });
  if (e.solar !== null) items.push({ key: 'solar', icon: 'sun', tone: 'amber', value: f.unit(e.solar, 'W'), label: t('energy.solar') });
  if (e.battery && e.battery.soc !== null) {
    items.push({ key: 'battery', icon: 'battery', tone: 'teal', value: f.pct(e.battery.soc), label: e.battery.power === null ? t('battery.title') : t(e.battery.power < 0 ? 'energy.charging' : 'energy.discharging', { watts: f.unit(Math.abs(e.battery.power), 'W') }) });
  }
  return items;
}

/** The values shown as callouts on the artwork, and as tiles on phones. */
function flowItems(c) {
  const { d, t, f } = c;
  if (d.energy.live) return liveFlowItems(c);
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
  if (e.live) {
    return `<section class="card hero">
    <div class="hero-art"><div class="chips">${live(c)}</div>${art}</div>
    ${liveStatus(c)}
  </section>`;
  }
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

/** Live: today's totals from Home Assistant's statistics, each only when it is known. */
function liveStatus({ d, t, f }) {
  const x = d.energy.today;
  const b = d.energy.balance;
  const tiles = [
    ['energy.today.solar', x.solar], ['energy.today.imported', x.imported], ['energy.today.exported', x.exported],
    ['energy.today.forecast', b.forecastTotal],
  ].filter(([, v]) => v !== null).map(([key, v]) => `<div class="tile"><small>${t(key)}</small><b>${f.unit(v, 'kWh', 1)}</b></div>`).join('');
  return `<aside class="tile status">
      <header><span class="ic-box">${icon('star')}</span><h2>${t('energy.status')}</h2><time>${f.time(d.now.h, d.now.m)}</time></header>
      <h3>${t('energy.today.title')}</h3>
      ${tiles ? `<div class="pair">${tiles}</div>` : `<p class="muted">${t('energy.today.none')}</p>`}
    </aside>`;
}

function liveBatteryCard({ d, t, f }) {
  const b = d.energy.battery;
  if (!b) return '';
  return `<section class="card" id="card-battery">
    <header class="card-head"><span class="ic-box">${icon('battery')}</span><h2>${t('battery.title')}</h2>${b.capacity ? `<span class="muted">${t('battery.model', { kwh: f.unit(b.capacity, 'kWh') })}</span>` : ''}</header>
    <div class="batt">
      ${b.soc === null ? '' : batteryArt(b.soc, [])}
      <div class="batt-main">
        ${b.soc === null ? '' : `<p class="big">${f.num(b.soc)}<sup>%</sup></p>`}
        ${b.power === null ? '' : `<p><span class="chip is-teal">${t(b.power < 0 ? 'battery.charging' : 'battery.discharging', { watts: f.unit(Math.abs(b.power), 'W') })}</span></p>`}
      </div>
    </div>
  </section>`;
}

function batteryCard(c) {
  if (c.d.energy.live) return liveBatteryCard(c);
  const { d, t, f } = c;
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

function liveBalanceCard({ d, t, f }) {
  const b = d.energy.balance;
  const row = (cls, title, sub, value) => `<li><i class="dot ${cls}"></i><span><b>${title}</b><small>${sub}</small></span><strong>${value}</strong></li>`;
  const rows = [
    b.autarky !== null && row('is-teal', t('balance.autarky'), t('balance.autarkyLive'), f.pct(b.autarky)),
    b.solarUsed !== null && row('is-amber', t('balance.solarUsed'), t('balance.solarUsedLive'), f.pct(b.solarUsed)),
    b.forecastPct !== null && row('is-blue', t('balance.forecast'), t('balance.forecastSub', { done: f.num(d.energy.today.solar, 1), total: f.unit(b.forecastTotal, 'kWh', 1) }), f.pct(b.forecastPct)),
    b.consumed !== null && row('is-muted', t('balance.consumed'), t('balance.consumedSub'), f.unit(b.consumed, 'kWh', 1)),
  ].filter(Boolean);
  if (!rows.length) return '';
  const ringList = [[b.autarky, 'is-teal'], [b.solarUsed, 'is-amber'], [b.forecastPct, 'is-blue']].filter(([v]) => v !== null).map(([value, cls]) => ({ value, cls }));
  return `<section class="card">
    <header class="card-head"><span class="ic-box">${icon('ring')}</span><h2>${t('balance.title')}</h2><span class="muted">${t('balance.until', { time: f.time(d.now.h, d.now.m) })}</span></header>
    <div class="balance">
      ${ringList.length ? `<div class="rings-wrap">${rings(ringList, { label: t('balance.chartLabel') })}
        ${b.autarky !== null ? `<p class="rings-center"><b>${f.num(b.autarky)}<sup>%</sup></b><small>${t('balance.selfSufficient')}</small></p>` : ''}</div>` : ''}
      <ul class="balance-list">${rows.join('')}</ul>
    </div>
  </section>`;
}

function balanceCard(c) {
  if (c.d.energy.live) return liveBalanceCard(c);
  const { d, t, f } = c;
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

function liveConsumptionCard({ d, t, f }) {
  const e = d.energy;
  const top = e.consumption.top;
  if (e.house === null && e.consumption.today === null && !top.length) return '';
  const max = Math.max(...top.map((x) => x.kwh), 0.001) * 1.2;
  return `<section class="card">
    <header class="card-head"><span class="ic-box">${icon('home')}</span><h2>${t('cons.title')}</h2></header>
    ${e.house === null ? '' : `<p class="big">${f.num(e.house)}<sup>W</sup></p>`}
    ${e.consumption.today === null ? '' : `<p class="muted">${t('cons.todayLive', { kwh: f.unit(e.consumption.today, 'kWh', 1) })}</p>`}
    ${top.length ? `<p class="muted">${t('cons.topToday')}</p><ul class="meter-list">${top.map((x) => `<li><span>${esc(x.name)}</span><b>${f.unit(x.kwh, 'kWh', 2)}</b>${meter(x.kwh, max)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

/** Gas and water today, from the Energy settings. */
function utilitiesCard({ d, t, f }) {
  const u = d.utilities;
  if (!u) return '';
  const tile = (key, ic, today, unit, extra = '') => `<div class="tile"><small>${icon(ic)} ${t(key)}</small><b>${today === null ? t('state.unavailable') : f.unit(today, unit, unit === 'm³' ? 2 : 1)}</b>${extra}</div>`;
  const flow = u.water && u.water.flow ? `<small>${t('util.flow', { value: f.num(u.water.flow.value, 1), unit: esc(u.water.flow.unit) })}</small>` : '';
  return `<section class="card" id="card-utilities">
    <header class="card-head"><span class="ic-box">${icon('drop')}</span><h2>${t('util.title')}</h2><span class="muted">${t('util.today')}</span></header>
    <div class="pair">${u.gas ? tile('util.gas', 'bolt', u.gas.today, u.gas.unit) : ''}${u.water ? tile('util.water', 'drop', u.water.today, u.water.unit, flow) : ''}</div>
  </section>`;
}

function consumptionCard(c) {
  if (c.d.energy.live) return liveConsumptionCard(c);
  const { d, t, f } = c;
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

const ENERGY_CARDS = { battery: batteryCard, balance: balanceCard, consumption: consumptionCard, utilities: utilitiesCard, ev: evCard };

export function energyView(c) {
  const { t } = c;
  return `<div class="page-head"><div><h1>${t('energy.title')}</h1><p class="lead">${t(c.d.energy.live ? 'energy.leadLive' : 'energy.lead')}</p></div>
      <button type="button" class="icon-btn" aria-label="${t('common.notifications')}" ${act('bell')}>${icon('bell')}</button></div>${c.d.energy.live ? '' : demoNote(c)}
    ${hero(c)}
    ${cardGrid(c, 'energy', ENERGY_CARDS, 'grid-energy')}`;
}
