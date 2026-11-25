import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from '../../app/frontend/js/fixtures/synthetic.js';
import { createI18n } from '../../app/frontend/js/i18n/index.js';
import { defaultConfig } from '../../app/frontend/js/config.js';
import { applyConfig, netModel } from '../../app/frontend/js/model.js';
import { defaultLock } from '../../app/frontend/js/lock.js';
import { defaultAccess } from '../../app/frontend/js/onboard.js';
import { appView, context } from '../../app/frontend/js/views/app.js';
import { buildNetworkLive, emptyNetwork } from '../../app/frontend/js/network-live.js';
import { LAYOUTS } from './helpers.js';

const EVIL = '<img src=x onerror=1>';

// The backend's /api/ha/network for a synthetic house (see tests/backend/network.test.js).
const NET = {
  unifi: {
    wan: { online: true, upSeconds: 91_800, cpu: 12.5, memory: 48 },
    nodes: [
      { id: 'u01', name: `Gateway ${EVIL}`, model: 'GW', online: true, main: true, link: null },
      { id: 'u02', name: 'Hall AP', model: `AP ${EVIL}`, online: true, main: false, link: 'uplink' },
      { id: 'u03', name: 'Loft AP', model: null, online: false, main: false, link: 'uplink' },
      { id: 'wired', name: null, model: null, online: true, main: false, link: 'wired' },
    ],
    devices: [
      { id: 'u04', name: `Phone ${EVIL}`, node: 'u02', band: 'g5', online: true },
      { id: 'u05', name: 'Desktop', node: 'wired', band: 'wired', online: true },
      { id: 'u06', name: 'Tablet', node: 'u01', band: 'unknown', online: false },
      { id: 'u07', name: 'Lost', node: 'gone', band: 'odd', online: 'yes' },
    ],
  },
  zigbee: {
    coordinator: { id: 'z01', name: 'Coordinator', model: 'ZC' },
    devices: [
      { id: 'z02', name: `Bulb ${EVIL}`, model: 'B1', online: true, kind: 'light', lqi: 180 },
      { id: 'z03', name: 'Door', model: null, online: true, kind: 'door', battery: 71 },
      { id: 'z04', name: 'Gone', model: 'G1', online: false, kind: 'unknown_kind' },
    ],
  },
};

const NOW = Date.parse('2026-11-25T12:00:00Z');
const SPEED = { down: 512.25, up: 50, ping: 12, at: NOW / 1000 - 600 };

const S0 = {
  theme: { mode: 'auto', manual: 'light' }, sun: 'above', netWidth: 1000, view: 'network', room: null, roomCfg: false, settings: false,
  floor: 'ground', netTab: 'network', netView: 'all', site: 'site_01', device: null, evPeriod: 'day', menu: null, edit: false, planEdit: false,
  confirm: null, locked: false, pinPad: false, pinEntry: '', diag: null, grouping: false, musicSel: null, musicPick: [], onboard: null,
  lock: defaultLock(), access: defaultAccess(),
};

function live(net) {
  const d = createFixture();
  d.live = true;
  d.network = buildNetworkLive(net);
  const cfg = defaultConfig(d);
  applyConfig(d, cfg);
  return { d, cfg };
}

const view = (d, cfg, state) => appView(context({ ...S0, ...state }, d, createI18n(state.lang || 'en'), cfg));

test('live network: the backend map in the demo shape, junk left out', () => {
  const { d, cfg } = live(NET);
  const site = d.network.bySite.site_01;
  assert.deepEqual(site.nodes.map((n) => [n.id, n.link]), [['u01', null], ['u02', 'uplink'], ['u03', 'uplink'], ['wired', 'wired']]);
  const lost = site.devices.find((v) => v.id === 'u07');
  assert.deepEqual([lost.node, lost.band, lost.online], ['u01', 'unknown', false], 'an unknown node, band or online value is not trusted');
  assert.ok(site.devices.every((v) => v.traffic === false));
  assert.deepEqual(d.network.zigbee.devices.map((v) => [v.icon, v.battery, v.lqi]), [['bulb', undefined, 180], ['door', 71, undefined], ['chip', undefined, undefined]]);
  assert.deepEqual(d.network.availability.items, [], 'the demo availability list is not shown as if it were the house');
  const all = netModel(d, cfg, 'all', 'site_01');
  assert.ok(!all.devices.some((v) => /^dev_/.test(v.id)), 'no demo devices');
});

test('live network renders every view, layout and language, escaped, without demo or missing values', () => {
  for (const net of [NET, { unifi: NET.unifi, zigbee: null }, { unifi: null, zigbee: NET.zigbee }, { unifi: null, zigbee: null }, null, { unifi: { nodes: 'x' }, zigbee: { devices: [] } }]) {
    const { d, cfg } = live(net);
    for (const lang of ['en', 'nl']) {
      for (const layout of LAYOUTS) {
        for (const netView of ['all', 'unifi', 'zigbee']) {
          for (const device of [null, 'u04', 'u06', 'z02', 'z04']) {
            const html = view(d, cfg, { lang, layout, netView, device });
            const where = `${JSON.stringify(net && Object.keys(net))} ${lang} ${layout} ${netView} ${device}`;
            assert.ok(!html.includes('<img'), `unescaped: ${where}`);
            assert.ok(!/NaN|undefined|Infinity|\bnull\b|\[object/.test(html.replace(/<[^>]+>/g, ' ')), `a missing value shown: ${where}`);
            assert.ok(!/\[[a-z]+\.[a-zA-Z.]+\]/.test(html), `missing translation: ${where}`);
            assert.ok(!/net\.siteB|avail\.|wan\.ping24|wan\.dataToday/.test(html) && !html.includes('data-action="net-tab"'), `demo content: ${where}`);
          }
        }
      }
    }
  }
});

test('live WAN card: gateway state, uptime, CPU and memory only; no traffic row for clients', () => {
  const { d, cfg } = live(NET);
  const html = view(d, cfg, { layout: 'desktop', netView: 'unifi', device: 'u04' });
  assert.match(html, /online for 25 h 30 min/);
  assert.match(html, /CPU/);
  assert.match(html, /Memory/);
  assert.ok(!/ms<|Packet loss|Traffic/i.test(html.replace(/<[^>]+>/g, '<')), 'no ping, loss or traffic');
  const zb = view(d, cfg, { layout: 'desktop', netView: 'zigbee', device: 'z02' });
  assert.match(zb, /Model/);
  assert.match(zb, /routes not known/);
  const down = live({ ...NET, unifi: { ...NET.unifi, wan: { online: false, upSeconds: null, cpu: null, memory: null } } });
  const off = view(down.d, down.cfg, { layout: 'desktop', netView: 'unifi' });
  assert.match(off, /Offline/);
  assert.ok(!/online for/.test(off));
});

test('the speedtest shows on the WAN card when Home Assistant has one, and not at all when it has none', () => {
  const with_ = (sp) => {
    const d = createFixture();
    d.live = true;
    d.network = buildNetworkLive({ ...NET, speedtest: sp }, NOW);
    const cfg = defaultConfig(d);
    applyConfig(d, cfg);
    return appView(context({ ...S0, layout: 'desktop', netView: 'unifi', lang: 'en' }, d, createI18n('en'), cfg));
  };
  const html = with_(SPEED);
  assert.match(html, /Speedtest/);
  assert.match(html, /↓ 512/);
  assert.match(html, /↑ 50/);
  assert.match(html, /at \d/);
  for (const sp of [null, undefined, {}, { down: null, up: 'x', ping: NaN }]) assert.ok(!with_(sp).includes('Speedtest'), JSON.stringify(sp));
  assert.match(with_({ ...SPEED, at: NOW / 1000 - 3 * 86_400 }), /more than a day ago/);
  const partial = with_({ down: 3.25, up: null, ping: null, at: null });
  assert.match(partial, /↓ 3\.3/);
  assert.ok(!/↑|ms ping/.test(partial.slice(partial.indexOf('Speedtest'))), 'a missing part is left out');
});

test('no source in Home Assistant, or none chosen: a plain message instead of a map', () => {
  const none = live(null);
  assert.match(view(none.d, none.cfg, { layout: 'desktop' }), /no UniFi or Zigbee devices/);
  none.cfg.net = { unifi: false, zigbee: false };
  assert.match(view(none.d, none.cfg, { layout: 'desktop' }), /No network source is chosen/);
  assert.deepEqual(emptyNetwork().present, { unifi: false, zigbee: false });
});
