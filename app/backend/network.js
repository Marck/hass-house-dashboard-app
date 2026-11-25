// Network, read-only (step 8): the UniFi and Zigbee (ZHA) devices Home
// Assistant knows, as nodes and devices for the network map. Built here from
// the registries and the raw states, so MAC and IP addresses, host names and
// Wi-Fi names never leave the backend: the browser gets opaque ids, names,
// models, online state, Wi-Fi band, battery and signal quality only.
//
// What Home Assistant 2026.11.1 gives a non-admin user, checked on a real
// instance: UniFi network devices with state, uptime, CPU and memory sensors
// and, for access points and switches, the MAC of their uplink; client
// trackers with the MAC of their access point and the radio when wireless.
// There is no switch port, WAN speed or traffic per client. ZHA devices hang
// off the coordinator in the device registry; router or end device is not
// exposed without an admin user, so it is left out.
//
// The speedtest comes from Home Assistant's Speedtest.net integration
// (speedtestdotnet), found by its platform and unique ids, so a renamed entity
// still counts. Home Assistant's UniFi integration does not expose the
// console's own speedtest (2026.11.1 source: WAN latency only).

const MAC = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
const BAND = { ng: 'g24', na: 'g5' };
const NO_VALUE = ['unavailable', 'unknown'];

const mac = (v) => (typeof v === 'string' && MAC.test(v.trim()) ? v.trim().toLowerCase().replaceAll('-', ':') : null);
const nameOf = (d) => String(d.name_by_user || d.name || '').trim();
const domains = (d) => (d.identifiers || []).map((i) => i && i[0]);
/** A number, or undefined for Home Assistant's "no value" states and anything that is not one. */
const num = (v) => {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const text = String(v).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
};
const usable = (st) => Boolean(st) && !NO_VALUE.includes(st.s);

/** The registry entries the network map needs, kept in the backend only. */
export function keepNetworkRegistry({ devices = [], entities = [] }) {
  const ents = entities
    .filter((e) => ((e.platform === 'unifi' || e.platform === 'zha') && e.device_id) || e.platform === 'speedtestdotnet')
    .filter((e) => !e.disabled_by)
    .map((e) => ({ id: e.entity_id, device: e.device_id, platform: e.platform, key: e.translation_key || null, uid: String(e.unique_id || '') }));
  const used = new Set(ents.map((e) => e.device));
  const devs = devices
    .filter((d) => !d.disabled_by && (used.has(d.id) || domains(d).includes('zha')))
    .map((d) => ({
      id: d.id, name: nameOf(d), model: d.model ? String(d.model) : null, via: d.via_device_id || null,
      zha: domains(d).includes('zha'), service: d.entry_type === 'service',
      macs: (d.connections || []).filter((c) => c && c[0] === 'mac').map((c) => mac(String(c[1]))).filter(Boolean),
    }));
  return { devices: devs, entities: ents };
}

/** Opaque, stable ids in the order given: the registry id never reaches the browser. */
function opaque(prefix, ids) {
  return new Map([...ids].sort().map((id, i) => [id, `${prefix}${String(i + 1).padStart(2, '0')}`]));
}

function unifi(reg, states, now) {
  const ents = reg.entities.filter((e) => e.platform === 'unifi');
  const byDevice = new Map();
  for (const e of ents) byDevice.set(e.device, [...(byDevice.get(e.device) || []), e]);
  const devs = reg.devices.filter((d) => !d.service && byDevice.has(d.id));
  const find = (d, test) => (byDevice.get(d.id) || []).find(test);
  const state = (e) => (e ? states.get(e.id) : undefined);
  const infra = devs.filter((d) => find(d, (e) => e.key === 'device_state'));
  if (!infra.length) return null;
  const byMac = new Map();
  for (const d of infra) for (const m of d.macs) byMac.set(m, d.id);
  const uplinkOf = (d) => {
    const st = state(find(d, (e) => e.key === 'device_uplink_mac'));
    return st ? byMac.get(mac(st.s)) || null : null;
  };
  // The gateway is the device without an uplink to another UniFi device.
  const gateway = infra.find((d) => !find(d, (e) => e.key === 'device_uplink_mac')) || infra.find((d) => !uplinkOf(d)) || infra[0];
  const ids = opaque('u', devs.map((d) => d.id));
  const online = (d) => {
    const st = state(find(d, (e) => e.key === 'device_state'));
    return Boolean(st) && st.s === 'connected';
  };
  const nodes = infra.map((d) => ({
    id: ids.get(d.id), name: d.name, model: d.model, online: online(d), main: d.id === gateway.id,
    link: d.id === gateway.id ? null : 'uplink',
  }));
  nodes.sort((a, b) => Number(b.main) - Number(a.main) || a.name.localeCompare(b.name));
  const infraIds = new Set(infra.map((d) => d.id));
  const devices = [];
  let wired = false;
  for (const d of devs) {
    if (infraIds.has(d.id)) continue;
    const st = state(find(d, (e) => e.id.startsWith('device_tracker.')));
    if (!st) continue;
    const home = st.s === 'home';
    const ap = home ? byMac.get(mac(st.a && st.a.ap_mac)) : null;
    let node = ids.get(gateway.id);
    let band = 'unknown';
    if (ap) {
      node = ids.get(ap);
      band = BAND[st.a && st.a.radio] || 'unknown';
    } else if (home) {
      // Online without an access point: wired, behind a port Home Assistant does not name.
      node = 'wired';
      band = 'wired';
      wired = true;
    }
    devices.push({ id: ids.get(d.id), name: d.name || (st.a && st.a.friendly_name) || ids.get(d.id), node, band, online: home });
  }
  if (wired) nodes.push({ id: 'wired', name: null, model: null, online: true, main: false, link: 'wired' });
  devices.sort((a, b) => a.name.localeCompare(b.name));
  const gw = (key, test) => state(find(gateway, test || ((e) => e.key === key)));
  const since = gw(null, (e) => e.uid.startsWith('device_uptime-'));
  const upAt = since && usable(since) ? Date.parse(since.s) : NaN;
  const wan = {
    online: online(gateway),
    upSeconds: Number.isFinite(upAt) && upAt <= now ? Math.floor((now - upAt) / 1000) : null,
    cpu: num((gw('device_cpu_utilization') || {}).s) ?? null,
    memory: num((gw('device_memory_utilization') || {}).s) ?? null,
  };
  return { wan, nodes, devices };
}

function zigbee(reg, states) {
  const devs = reg.devices.filter((d) => d.zha);
  if (!devs.length) return null;
  const ents = reg.entities.filter((e) => e.platform === 'zha');
  const byDevice = new Map();
  for (const e of ents) byDevice.set(e.device, [...(byDevice.get(e.device) || []), e]);
  const ids = new Set(devs.map((d) => d.id));
  // The coordinator is the one the others hang off; it has no via device of its own.
  const coordinator = devs.find((d) => !d.via || !ids.has(d.via)) || devs[0];
  const opaqueIds = opaque('z', devs.map((d) => d.id));
  const devices = devs.filter((d) => d.id !== coordinator.id).map((d) => {
    const own = (byDevice.get(d.id) || []).map((e) => ({ e, st: states.get(e.id) })).filter((x) => x.st);
    const cls = (c) => own.find(({ st }) => st.a && st.a.device_class === c && usable(st));
    const lqi = own.find(({ e }) => e.key === 'lqi');
    const battery = num((cls('battery') || {}).st?.s);
    const out = {
      id: opaqueIds.get(d.id), name: d.name || opaqueIds.get(d.id), model: d.model,
      // A Zigbee device that stops answering turns every entity unavailable.
      online: own.some(({ st }) => usable(st)), kind: kindOf(own),
    };
    if (battery !== undefined && battery >= 0 && battery <= 100) out.battery = battery;
    if (lqi && usable(lqi.st) && num(lqi.st.s) !== undefined) out.lqi = num(lqi.st.s);
    return out;
  });
  devices.sort((a, b) => a.name.localeCompare(b.name));
  return { coordinator: { id: opaqueIds.get(coordinator.id), name: coordinator.name, model: coordinator.model }, devices };
}

/** What a Zigbee device is, for its icon: from its entities, not from its name. */
function kindOf(own) {
  const has = (domain, classes) => own.some(({ e, st }) => e.id.startsWith(`${domain}.`) && (!classes || classes.includes(st.a && st.a.device_class)));
  if (has('light')) return 'light';
  if (has('climate')) return 'climate';
  if (has('binary_sensor', ['door', 'window', 'opening', 'garage_door'])) return 'door';
  if (has('binary_sensor', ['motion', 'occupancy', 'presence'])) return 'motion';
  if (has('binary_sensor', ['moisture'])) return 'leak';
  if (has('switch')) return 'plug';
  if (has('sensor', ['temperature', 'humidity'])) return 'climate_sensor';
  return 'other';
}

// Units Home Assistant may give a data rate or a duration in, to Mbit/s and ms.
const RATE = { 'bit/s': 1e-6, 'kbit/s': 1e-3, 'Mbit/s': 1, 'Gbit/s': 1e3, 'B/s': 8e-6, 'kB/s': 8e-3, 'MB/s': 8, 'GB/s': 8e3 };
const DURATION = { ms: 1, s: 1e3, min: 6e4 };

/** The last speedtest: download and upload in Mbit/s, ping in ms, when it ran; null when there is none. */
function speedtest(reg, states) {
  const ents = reg.entities.filter((e) => e.platform === 'speedtestdotnet');
  const read = (uid, units) => {
    const e = ents.find((x) => x.uid === uid);
    const st = e && states.get(e.id);
    if (!usable(st)) return undefined;
    const factor = units[(st.a && st.a.unit_of_measurement) || ''];
    const value = num(st.s);
    const at = Math.max(Number(st.lc) || 0, Number(st.lu) || 0) || null; // seconds; lu is newer when the value did not change
    return factor && value !== undefined && value >= 0 ? { value: value * factor, at } : undefined;
  };
  const down = read('download', RATE);
  const up = read('upload', RATE);
  const ping = read('ping', DURATION);
  if (!down && !up && !ping) return null;
  const times = [down, up, ping].filter((x) => x && x.at).map((x) => x.at);
  return { down: down ? down.value : null, up: up ? up.value : null, ping: ping ? ping.value : null, at: times.length ? Math.max(...times) : null };
}

/** The network map for the browser: null for a source Home Assistant does not have. */
export function buildNetwork(reg, states, now = Date.now()) {
  if (!reg) return null;
  return { unifi: unifi(reg, states, now), zigbee: zigbee(reg, states), speedtest: speedtest(reg, states) };
}
