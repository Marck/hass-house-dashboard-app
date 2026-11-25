// Screen B: network overview with All, UniFi and Zigbee views, and uplink diagnostics.
// Both sources are optional; Home Assistant is the integration layer for each.
import { icon } from '../icons.js';
import { netModel, netPresent, netStats } from '../model.js';
import { netSources, netViews } from '../config.js';
import { layoutNetwork } from '../art/netlayout.js';
import { pingChart, outageBars, meter } from '../charts.js';
import { act, seg, cardGrid, showId, demoNote } from './parts.js';

const BANDS = { unifi: ['wired', 'g5', 'g24', 'unknown'], zigbee: ['zb'] };

const box = (b) => `left:${b.x.toFixed(1)}px;top:${b.y.toFixed(1)}px;width:${b.w.toFixed(1)}px`;
const at = (n) => `left:${n.x.toFixed(1)}px;top:${n.y.toFixed(1)}px`;
const curve = (x0, y0, x1, y1) => {
  const k = (x1 - x0) / 2;
  return `M${x0.toFixed(1)},${y0.toFixed(1)}C${(x0 + k).toFixed(1)},${y0.toFixed(1)} ${(x1 - k).toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
};
const mixed = (m) => m.sources.length > 1;

function deviceCard(c, m, v, style) {
  const { s, t } = c;
  const sub = [showId(v.id)];
  if (mixed(m)) sub.push(t(`net.src.${v.src}`));
  if (!v.online) sub.push(t('net.offline'));
  const label = [t(v.nameKey), t(`net.src.${v.src}`), t(`net.band.${v.band}`), t(v.online ? 'net.online' : 'net.offline')].join(', ');
  return `<button type="button" class="dev band-${v.band}${v.online ? '' : ' is-offline'}${s.device === v.id ? ' is-selected' : ''}"${style ? ` data-style="${style}"` : ''}
    aria-pressed="${s.device === v.id}" aria-label="${label}" ${act('device', v.id)}>
    <span class="ic-box">${icon(v.icon)}</span><span class="dev-text"><b>${t(v.nameKey)}</b><small>${sub.join(' · ')}</small></span>
    ${v.tagKey ? `<span class="tag">${t(v.tagKey)}</span>` : ''}${v.online ? '' : '<i class="dot is-off"></i>'}</button>`;
}

const nodeSub = (c, m, node, count) => `<small>${showId(node.id)}</small><small>${c.t(node.typeKey)} · ${c.t('net.deviceCount', { n: c.f.num(count) })}${node.online === false ? ` · ${c.t('net.offline')}` : ''}</small>${mixed(m) ? `<small>${c.t(`net.src.${node.src}`)}</small>` : ''}`;

function netMap(c, m) {
  const { s, t, f } = c;
  const L = layoutNetwork(m, s.netWidth || 1000);
  const main = L.nodes[L.mainId];
  let lines = '';
  let labels = '';
  let html = '';
  if (m.wan) {
    lines += `<path class="link is-wan" d="M${L.wan.x + 24},${L.wan.y + 30}C${L.wan.x + 110},${L.wan.y + 70} ${main.x - 100},${main.y - 150} ${main.x - 14},${main.y - 40}"/>`;
    html += `<div class="node is-wan" data-style="${at(L.wan)}"><span class="node-dot">${icon('uplink')}</span><b>${t(m.wan.nameKey)}</b>${Number.isFinite(m.wan.ping) ? `<small>${f.unit(m.wan.ping, 'ms')}</small>` : ''}</div>`;
  }

  m.nodes.forEach((node) => {
    const n = L.nodes[node.id];
    const count = m.devices.filter((v) => v.node === node.id).length;
    if (node.link) {
      lines += `<path class="link is-${node.link} is-trunk" d="${curve(main.x, main.y, n.x, n.y)}"/>`;
      labels += `<span class="link-label is-${node.link}" data-style="left:${((main.x + n.x) / 2).toFixed(1)}px;top:${((main.y + n.y) / 2).toFixed(1)}px">${t(`net.link.${node.link}`)}</span>`;
    }
    html += `<div class="node src-${node.src}${node.link ? '' : ' is-main'}" data-style="${at(n)}"><span class="node-dot">${icon(node.src === 'unifi' ? 'router' : 'chip')}<i class="node-count" aria-hidden="true">${f.num(count)}</i></span>
      <b>${t(node.nameKey)}</b>${nodeSub(c, m, node, count)}</div>`;
  });

  m.devices.forEach((v, i) => {
    const b = L.cards[v.id];
    const n = L.nodes[v.node];
    const cy = b.y + b.h / 2;
    const cls = `link band-${v.band}${v.online ? '' : ' is-offline'}${s.device === v.id ? ' is-selected' : ''}`;
    if (v.node === L.mainId) {
      const lane = 3 + (i % 5) * 2.5;
      lines += `<path class="${cls}" d="M${(n.x - 34).toFixed(1)},${(n.y + 20).toFixed(1)}C${(n.x - 150).toFixed(1)},${(n.y + 10).toFixed(1)} ${lane},${(n.y + 40).toFixed(1)} ${lane},${(cy - 30).toFixed(1)}Q${lane},${cy.toFixed(1)} ${b.x.toFixed(1)},${cy.toFixed(1)}"/>`;
    } else {
      lines += `<path class="${cls}" d="${curve(n.x, n.y, b.x, cy)}"/>`;
    }
    html += deviceCard(c, m, v, box(b));
  });

  const cluster = L.cluster
    ? `<div class="cluster" data-style="${box(L.cluster)};height:${L.cluster.h}px"><span>${t('net.cluster')}</span></div>` : '';
  return `<div class="netmap" id="netmap" data-style="height:${L.H}px">
    <svg width="${L.W}" height="${L.H}" viewBox="0 0 ${L.W} ${L.H}" aria-hidden="true" focusable="false">${lines}</svg>${cluster}${labels}${html}</div>`;
}

/** Phone layout: the same nodes and devices as a plain list, no map. */
function netList(c, m) {
  return m.nodes.map((node) => {
    const devices = m.devices.filter((v) => v.node === node.id);
    return `<section class="net-group"><header><span class="ic-box">${icon(node.src === 'unifi' ? 'router' : 'chip')}</span><div><b>${c.t(node.nameKey)}</b>${nodeSub(c, m, node, devices.length)}</div></header>
      <div class="net-rows">${devices.map((v) => deviceCard(c, m, v, '')).join('')}</div></section>`;
  }).join('');
}

const rate = ({ t, f }, v) => (v.down || v.up ? `↓ ${f.num(v.down, 2)} kB/s ↑ ${f.num(v.up, 2)} kB/s` : t('net.quiet'));

/** Details of the selected device. Fields a device does not report are left out. */
function detailPanel(c, m, v) {
  const { t, f } = c;
  const rows = [
    [t('net.detail.state'), t(v.online ? 'net.online' : 'net.offline')],
    [t('net.detail.source'), t(`net.src.${v.src}`)],
    [t('net.detail.link'), t(`net.band.${v.band}`)],
    [t('net.detail.node'), t(m.nodes.find((n) => n.id === v.node).nameKey)],
  ];
  if (v.type) rows.push([t('net.detail.type'), t(`zb.type.${v.type}`)]);
  if (v.modelKey) rows.push([t('net.detail.model'), t(v.modelKey)]);
  if (v.lqi !== undefined && v.online) rows.push([t('net.detail.lqi'), f.num(v.lqi)]);
  if (v.battery !== undefined) rows.push([t('net.detail.battery'), f.pct(v.battery)]);
  // Live UniFi clients have no traffic in Home Assistant: left out, not shown as quiet.
  if (v.src === 'unifi' && v.traffic !== false) rows.push([t('net.detail.traffic'), v.online ? rate(c, v) : t('net.none')]);
  return `<div class="tile detail" role="status"><b>${t(v.nameKey)}</b><dl>${rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('')}</dl></div>`;
}

function activePanel(c, m) {
  const { s, t } = c;
  const selected = m.devices.find((v) => v.id === s.device);
  const rows = m.active.map((id) => m.devices.find((x) => x.id === id)).filter(Boolean)
    .map((v) => `<li class="tile"><span>${t(v.nameKey)}</span><b>${rate(c, v)}</b></li>`).join('');
  return `<aside class="card active">
    <header class="card-head"><span class="ic-box">${icon('network')}</span><h2>${t(rows ? 'net.active' : 'net.selected')}</h2></header>
    ${selected ? detailPanel(c, m, selected) : ''}${rows ? `<ul class="active-list">${rows}</ul>` : ''}<p class="muted">${t('net.hint')}</p></aside>`;
}

/** Live: what Home Assistant has of the gateway, its state, uptime, CPU and memory. No ping, speed or data. */
function wanLive(c, w) {
  const { t, f } = c;
  const up = w.upHours !== undefined ? `<span class="chip is-teal"><i class="dot is-ok"></i>${t('wan.uptime', { h: f.num(w.upHours), m: f.num(w.upMinutes) })}</span>` : '';
  const tile = (value, label) => (value === undefined ? '' : `<div class="tile"><b>${f.pct(value)}</b><small>${label}</small></div>`);
  const load = tile(w.cpu, t('wan.cpu')) + tile(w.memory, t('wan.memory'));
  const sp = w.speed;
  const rateTile = (v, arrow) => (v === undefined ? '' : `<div class="tile"><b>${arrow} ${f.num(v, v < 10 ? 1 : 0)}</b><small>${t('wan.mbit')}</small></div>`);
  const when = !sp || !sp.at ? '' : sp.at === 'old' ? t('wan.speedOld') : t('wan.speedAt', { time: f.time(sp.at.getHours(), sp.at.getMinutes()) });
  const speed = sp ? `<div class="tile"><div class="eyebrow"><h3>${t('wan.speedtest')}</h3>${when ? `<span>${when}</span>` : ''}</div>
      <div class="pair">${rateTile(sp.down, '↓')}${rateTile(sp.up, '↑')}${sp.ping === undefined ? '' : `<div class="tile"><b>${f.num(sp.ping)}</b><small>${t('wan.pingUnit')}</small></div>`}</div></div>` : '';
  return `<section class="card wan">
    <header class="card-head"><span class="ic-box">${icon('uplink')}</span><h2>${t('wan.gateway')}</h2>${w.healthy ? up : ''}</header>
    <p><span class="chip"><i class="dot ${w.healthy ? 'is-ok' : 'is-off'}"></i>${t(w.healthy ? 'wan.online' : 'wan.offline')}</span></p>
    ${load ? `<div class="pair">${load}</div>` : ''}${speed}
  </section>`;
}

function wanCard(c, w) {
  if (w.live) return wanLive(c, w);
  const { t, f } = c;
  const tile = (value, label) => `<div class="tile"><b>${value}</b><small>${label}</small></div>`;
  const days = w.outages.map((_, i) => f.weekday(i));
  const outages = w.outages.filter(Boolean).length;
  const dataMax = Math.max(w.dataDown, w.dataUp);
  return `<section class="card wan">
    <header class="card-head"><span class="ic-box">${icon('uplink')}</span><h2>${t(w.nameKey)}</h2>
      <span class="chip is-teal"><i class="dot is-ok"></i>${t('wan.uptime', { h: f.num(w.upHours), m: f.num(w.upMinutes) })}</span></header>
    <div class="wan-top">
      <div class="wan-stats">
        <p class="big">${f.num(w.ping)}<sup>${t('wan.pingUnit')}</sup></p>
        <div class="pair">${tile(f.pct(w.loss, 1), t('wan.loss'))}${tile(f.pct(w.reach, 2), t('wan.reach'))}</div>
        <div class="pair">${tile(`↓ ${f.num(w.down, 1)}`, t('wan.rate'))}${tile(`↑ ${f.num(w.up, 1)}`, t('wan.rate'))}</div>
        <p><span class="chip"><i class="dot ${w.healthy ? 'is-ok' : 'is-off'}"></i>${t(w.healthy ? 'wan.healthy' : 'wan.unhealthy')}</span></p>
      </div>
      <div class="tile ping">
        <div class="eyebrow"><h3>${t('wan.ping24')}</h3><span>${t('wan.limitNote', { ms: f.unit(w.pingLimit, 'ms') })}</span></div>
        <div class="ping-plot">${pingChart(w.pingSeries, w.pingLimit, { label: t('wan.pingLabel', { ms: f.num(w.ping) }), limitLabel: f.unit(w.pingLimit, 'ms') })}</div>
        <div class="axis"><span>${t('wan.yesterday')}</span><span>${t('common.now')}</span></div>
      </div>
    </div>
    <div class="grid grid-wan">
      <div class="tile"><div class="eyebrow"><h3>${t('wan.outages7')}</h3><span>${c.tn('wan.outageCount', outages)}</span></div>
        ${outageBars(w.outages, days)}
        <p class="sr-only">${w.outages.map((v, i) => `${days[i]}: ${t('wan.outageMinutes', { n: f.num(v) })}`).join(', ')}</p></div>
      <div class="tile"><div class="eyebrow"><h3>${t('wan.dataToday')}</h3><span>${t('wan.dataMonth', { gb: f.unit(w.dataMonth, 'GB', 1) })}</span></div>
        <p class="data-line"><b>${f.unit(w.dataDown, 'MB')}</b> ${t('wan.down')}</p>${meter(w.dataDown, dataMax)}
        <p class="data-line"><b>${f.unit(w.dataUp, 'MB')}</b> ${t('wan.up')}</p>${meter(w.dataUp, dataMax)}</div>
      <div class="tile"><div class="eyebrow"><h3>${t('wan.power')}</h3><span>${t('wan.measured')}</span></div>
        <p class="big is-small">${f.num(w.watts)}<sup>W</sup></p>
        <p class="muted">${t('wan.energy', { day: f.unit(w.kwhDay, 'kWh', 1), year: f.unit(w.kwhYear, 'kWh') })}</p></div>
    </div>
  </section>`;
}

function availability(c) {
  const { d, t } = c;
  const items = d.network.availability.items.map((item) => `<li class="tile${item.open ? ' is-open' : ''}">
    <span class="ic-box">${icon(item.open ? 'alert' : 'check')}</span><span><b>${t(item.key)}</b><small>${t(item.open ? 'avail.open' : 'avail.done')}</small></span></li>`).join('');
  return `<section class="card"><header class="card-head"><span class="ic-box">${icon('shield')}</span><h2>${t('avail.title')}</h2></header>
    <ul class="avail-list">${items}</ul></section>`;
}

function statCards(c, m, st) {
  const { t, f } = c;
  const kind = mixed(m) ? 'all' : m.sources[0];
  const items = {
    unifi: [[st.online, 'net.stat.online', 'is-ok'], [st.wired, 'net.stat.wired', 'is-blue'], [st.g5, 'net.band.g5', 'is-ok'], [st.g24, 'net.band.g24', 'is-warn'], [st.unknown, 'net.band.unknown', 'is-muted']],
    zigbee: [[st.online, 'net.stat.online', 'is-ok'], [st.offline, 'net.stat.offline', 'is-off'], [st.battery, 'net.stat.battery', 'is-blue'], [st.lowBattery, 'net.stat.lowBattery', 'is-warn']],
    all: [[st.online, 'net.stat.online', 'is-ok'], [st.offline, 'net.stat.offline', 'is-off'], [st.unifi, 'net.src.unifi', 'is-blue'], [st.zigbee, 'net.src.zigbee', 'is-purple']],
  }[kind];
  return `<ul class="grid grid-stats">${items.map(([value, key, cls]) => `<li class="card stat-card"><b>${f.num(value)}</b><span><i class="dot ${cls}"></i>${t(key)}</span></li>`).join('')}</ul>`;
}

function mapCard(c, m) {
  const { s, t } = c;
  const lines = m.sources.reduce((all, src) => all.concat(BANDS[src]), []).map((b) => `<li><i class="line band-${b}"></i>${t(`net.band.${b}`)}</li>`).join('');
  const mesh = m.nodes.some((n) => n.link === 'mesh') ? `<li><i class="line is-mesh"></i>${t('net.link.mesh')}</li>` : '';
  return `<div class="grid grid-net">
    <section class="card map-card">
      <header class="card-head"><span class="ic-box">${icon('network')}</span><h2>${t('net.map')}</h2></header>
      <p class="muted">${t('net.mapHint')}</p>
      ${s.layout === 'phone' ? netList(c, m) : `${netMap(c, m)}<ul class="legend" aria-label="${t('legend.title')}">${lines}${mesh}</ul>`}
    </section>
    ${activePanel(c, m)}
  </div>`;
}

export function networkView(c) {
  const { s, d, cfg, t, tn, f } = c;
  const present = netPresent(d, cfg);
  const views = netViews(cfg).filter((v) => v === 'all' || present.includes(v));
  const view = views.includes(s.netView) ? s.netView : 'all';
  const m = netModel(d, cfg, view, s.site);
  const st = netStats(m);
  const avail = d.network.availability;
  const open = avail.items.filter((i) => i.open).length;
  // The availability list is demo content; live mode has none, so no tab for it.
  const tabs = avail.items.length ? seg(t('net.views'), [
    { label: t('nav.network'), on: s.netTab === 'network', attrs: act('net-tab', 'network') },
    { label: t('avail.title'), on: s.netTab === 'availability', attrs: act('net-tab', 'availability'), badge: open ? '<i class="dot is-warn"></i>' : '' },
  ]) : '';
  const lead = m.sources.length ? t(`net.lead.${mixed(m) ? 'all' : m.sources[0]}`, { nodes: f.num(st.nodes), online: f.num(st.online), offline: f.num(st.offline) }) : t('net.lead.none');
  const head = `<div class="page-head"><div><h1>${t('net.title')}</h1><p class="lead">${lead}</p></div>
    ${tabs}<span class="chip"><i class="dot is-ok"></i>${t('common.live', { time: f.time(d.now.h, d.now.m) })}</span></div>${demoNote(c)}`;
  if (s.netTab === 'availability' && avail.items.length) return head + availability(c);
  if (!m.sources.length) {
    return `${head}<section class="card"><p class="muted">${t(netSources(cfg).length ? 'net.empty' : 'net.noSources')}</p>
      <button type="button" class="btn" ${act('settings')}>${icon('gear')}<span>${t('net.sources')}</span></button></section>`;
  }

  const banner = open ? `<div class="banner is-warn"><span class="ic-box">${icon('shield')}</span>
      <p><b>${tn('avail.banner', open)}</b>${Number.isFinite(avail.lastBackupHours) ? `<small>${t('avail.bannerSub', { h: f.num(avail.lastBackupHours) })}</small>` : ''}</p>
      <button type="button" class="btn btn-link" ${act('net-tab', 'availability')}><span>${t('common.view')}</span>${icon('chevron')}</button></div>` : '';
  const sourceViews = seg(t('net.sourceViews'), views.map((v) => ({ label: t(v === 'all' ? 'net.view.all' : `net.src.${v}`), on: v === view, attrs: act('net-view', v) })));
  const sites = m.sources.includes('unifi') && d.network.sites.length > 1
    ? seg(t('net.sites'), d.network.sites.map((x) => ({ label: t(x.nameKey), on: x.id === s.site, attrs: act('site', x.id) }))) : '';
  const bar = `<div class="net-bar">${sourceViews}${sites}
    <button type="button" class="btn" ${act('settings')}>${icon('gear')}<span>${t('net.sources')}</span></button></div>`;

  return `${head}${banner}${bar}${cardGrid(c, 'network', {
    stats: () => statCards(c, m, st),
    map: () => mapCard(c, m),
    wan: () => (m.wan ? wanCard(c, m.wan) : ''),
  }, 'grid-stack')}`;
}
