// The energy screen from Home Assistant (step 7, read-only): power now from the
// live states, today's totals from the backend's /api/ha/energy, both in the
// shape the demo uses. A value without a source is null, and the views leave
// it out; nothing is made up and unavailable is never shown as 0.
import { numeric } from './live.js';

const OFF = ['unavailable', 'unknown'];
const POWER = { W: 1, kW: 1000, MW: 1e6 };
const VOLUME = ['m³', 'ft³', 'L', 'CCF', 'MCF', 'gal'];
const POWER_CLASSES = ['power', 'battery'];

const sum = (list) => (list.length && list.every((v) => v !== null) ? list.reduce((a, b) => a + b, 0) : null);
const clampPct = (v) => (v === null || !Number.isFinite(v) ? null : Math.max(0, Math.min(100, v)));

/** A sensor's value in W (power) or % (battery), or null when it is not a usable number. */
export function reading(states, id) {
  const st = id && states[id];
  if (!st || OFF.includes(st.s)) return null;
  const v = numeric(st.s);
  if (v === undefined) return null;
  const unit = st.a && st.a.unit_of_measurement;
  if (unit === '%') return v;
  return unit in POWER ? v * POWER[unit] : null;
}

/** Power as the Energy settings describe it: one sensor, an inverted one, or an in/out pair. */
function settingsPower(states, p) {
  if (!p) return null;
  if (p.rate) {
    const v = reading(states, p.rate);
    return v === null ? null : (p.inverted ? -v : v);
  }
  const from = reading(states, p.from);
  const to = reading(states, p.to);
  return from === null || to === null ? null : from - to;
}

/** The value for one slot: the user's sensor, nothing, or (auto) the Energy settings' sensor. */
function slot(states, choice, auto) {
  if (choice === null) return null;
  if (choice && choice !== 'auto') return reading(states, choice);
  return auto();
}

/** Sensors the pickers offer, from the live states: power and battery sensors with a known unit. */
export function energySensors(states, names = {}) {
  const out = {};
  for (const [id, st] of Object.entries(states)) {
    const a = (st && st.a) || {};
    if (!id.startsWith('sensor.') || !POWER_CLASSES.includes(a.device_class)) continue;
    out[id] = { name: names[id] || a.friendly_name || id, cls: a.device_class, unit: typeof a.unit_of_measurement === 'string' ? a.unit_of_measurement : '' };
  }
  return out;
}

/** Forecast for today in kWh: all of today, and the part until now. `now` is a Date in the browser's time zone. */
function forecastToday(hours, now) {
  if (!hours) return { total: null, done: null };
  const day = (t) => `${t.getFullYear()}-${t.getMonth()}-${t.getDate()}`;
  let total = 0;
  let done = 0;
  for (const [at, wh] of Object.entries(hours)) {
    const t = new Date(at);
    if (day(t) !== day(now)) continue;
    total += wh / 1000;
    if (t < now) done += wh / 1000;
  }
  return total > 0 ? { total, done } : { total: null, done: null };
}

/**
 * Builds d.energy and d.utilities. `snap` is /api/ha/energy (or null), `map`
 * the configuration's energy slots, `names` entity id -> display name.
 */
export function buildEnergy(snap, states, map, names = {}, now = new Date()) {
  const s = snap || { solar: [], grid: [], battery: [], gas: [], water: [], home: [], devices: [], today: {}, forecast: null };
  const today = (id) => (id && Number.isFinite(s.today[id]) ? s.today[id] : null);
  const solar = slot(states, map.solar, () => sum(s.solar.map((x) => settingsPower(states, x.power))));
  const grid = slot(states, map.grid, () => sum(s.grid.map((x) => settingsPower(states, x.power))));
  const battPower = slot(states, map.battPower, () => sum(s.battery.map((x) => settingsPower(states, x.power))));
  const battSoc = slot(states, map.battSoc, () => (s.battery[0] ? reading(states, s.battery[0].soc) : null));
  // The house uses what comes in: solar, the grid (positive is import) and the battery (positive is discharge).
  const house = slot(states, map.house, () => {
    const own = sum(s.home.map((x) => settingsPower(states, x.power)));
    if (own !== null) return own;
    const parts = [solar, grid, s.battery.length ? battPower : 0];
    return parts.every((v) => v !== null) && (solar !== null || grid !== null) ? Math.max(0, parts.reduce((a, b) => a + b, 0)) : null;
  });

  const solarToday = s.solar.length ? sum(s.solar.map((x) => today(x.energy))) : null;
  const imported = s.grid.length ? sum(s.grid.flatMap((g) => g.import.map(today))) : null;
  const exported = s.grid.length ? sum(s.grid.flatMap((g) => g.export.map(today))) : null;
  const battIn = s.battery.length ? sum(s.battery.map((b) => today(b.in))) : 0;
  const battOut = s.battery.length ? sum(s.battery.map((b) => today(b.out))) : 0;
  // Every configured part must be known; a part that is not configured counts as 0.
  const parts = [s.solar.length ? solarToday : 0, imported, s.grid.some((g) => g.export.length) ? exported : 0, battOut, battIn];
  const consumed = parts.every((v) => v !== null) ? Math.max(0, parts[0] + parts[1] - parts[2] + parts[3] - parts[4]) : null;
  const fc = forecastToday(s.forecast, now);

  const top = s.devices
    .map((dev) => ({ name: dev.name || names[dev.energy] || dev.energy, kwh: today(dev.energy) }))
    .filter((dev) => dev.kwh !== null)
    .sort((a, b) => b.kwh - a.kwh)
    .slice(0, 3);

  const volume = (id) => {
    const unit = states[id] && states[id].a && states[id].a.unit_of_measurement;
    return VOLUME.includes(unit) ? 'm³' : 'kWh'; // Home Assistant converted volume to m³ and energy to kWh
  };
  const flow = (id) => {
    const st = id && states[id];
    const v = st && !OFF.includes(st.s) ? numeric(st.s) : undefined;
    if (v === undefined) return null;
    return { value: v, unit: String((st.a && st.a.unit_of_measurement) || '') };
  };
  const gas = s.gas.length ? { today: sum(s.gas.map((g) => today(g.energy))), unit: volume(s.gas[0].energy) } : null;
  const water = s.water.length ? { today: sum(s.water.map((w) => today(w.energy))), unit: 'm³', flow: flow(s.water[0].rate) } : null;

  return {
    energy: {
      live: true,
      house,
      solar,
      grid,
      battery: s.battery.length || map.battSoc !== 'auto' || map.battPower !== 'auto'
        ? (battSoc === null && battPower === null ? null : { soc: battSoc, power: battPower, capacity: s.battery[0] ? s.battery[0].capacity : null })
        : null,
      today: { solar: solarToday, imported, exported, consumed },
      balance: {
        autarky: consumed > 0 && imported !== null ? clampPct(100 * (1 - imported / consumed)) : null,
        solarUsed: solarToday > 0 && exported !== null ? clampPct((100 * (solarToday - exported)) / solarToday) : null,
        forecastTotal: fc.total,
        forecastDone: fc.done,
        forecastPct: fc.total && solarToday !== null ? clampPct((100 * solarToday) / fc.total) : null,
        consumed,
      },
      consumption: { today: consumed, top },
    },
    utilities: gas || water ? { gas, water } : null,
  };
}
