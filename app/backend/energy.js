// Energy, read-only (step 7): what Home Assistant's Energy settings name, today's
// totals of those statistics, and the solar forecast. Every parameter sent to
// Home Assistant is built here from its own Energy settings; nothing comes from a
// request. Statistic ids are checked against the entity id format before use.

const STAT_ID = /^[a-z_]+\.[a-z0-9_]+$/;
const REFRESH_MS = 5 * 60_000; // Home Assistant writes statistics every 5 minutes
const RETRY_MS = 5_000; // cheap while not connected: the command is refused locally
// Today's change, converted by Home Assistant itself.
const UNITS = { energy: 'kWh', volume: 'm³' };

const id = (value) => (typeof value === 'string' && STAT_ID.test(value) ? value : null);

/** Power as the Energy settings describe it: one sensor, an inverted one, or an in/out pair. */
function power(source, own = 'stat_rate') {
  const cfg = source.power_config || {};
  const rate = id(cfg.stat_rate) || id(source[own]);
  if (rate) return { rate };
  if (id(cfg.stat_rate_inverted)) return { rate: id(cfg.stat_rate_inverted), inverted: true };
  if (id(cfg.stat_rate_from) || id(cfg.stat_rate_to)) return { from: id(cfg.stat_rate_from), to: id(cfg.stat_rate_to) };
  return null;
}

/**
 * The Energy settings in the shape the dashboard uses. Grid in both the current
 * and the older shape (flow_from and flow_to lists, one entry per tariff).
 */
export function shapePrefs(prefs) {
  const out = { solar: [], grid: [], battery: [], gas: [], water: [], home: [], devices: [] };
  const sources = (prefs && Array.isArray(prefs.energy_sources)) ? prefs.energy_sources : [];
  for (const s of sources) {
    if (!s || typeof s !== 'object') continue;
    if (s.type === 'solar' && id(s.stat_energy_from)) out.solar.push({ energy: id(s.stat_energy_from), power: power(s), forecast: Array.isArray(s.config_entry_solar_forecast) && s.config_entry_solar_forecast.length > 0 });
    else if (s.type === 'grid') {
      const imports = [id(s.stat_energy_from), ...(s.flow_from || []).map((f) => id(f && f.stat_energy_from))].filter(Boolean);
      const exports = [id(s.stat_energy_to), ...(s.flow_to || []).map((f) => id(f && f.stat_energy_to))].filter(Boolean);
      const legacyPower = (s.power || []).map((p) => p && power(p)).find(Boolean) || null;
      if (imports.length || exports.length) out.grid.push({ import: imports, export: exports, power: power(s) || legacyPower });
    } else if (s.type === 'battery' && (id(s.stat_energy_from) || id(s.stat_energy_to))) {
      out.battery.push({ out: id(s.stat_energy_from), in: id(s.stat_energy_to), power: power(s), soc: id(s.stat_soc), capacity: Number.isFinite(s.capacity) ? s.capacity : null });
    } else if ((s.type === 'gas' || s.type === 'water') && id(s.stat_energy_from)) out[s.type].push({ energy: id(s.stat_energy_from), rate: id(s.stat_rate) });
    else if (s.type === 'home' && id(s.stat_energy_to)) out.home.push({ energy: id(s.stat_energy_to), power: power(s) });
  }
  for (const dev of (prefs && Array.isArray(prefs.device_consumption)) ? prefs.device_consumption : []) {
    if (dev && id(dev.stat_consumption)) out.devices.push({ energy: id(dev.stat_consumption), power: id(dev.stat_rate), name: typeof dev.name === 'string' ? dev.name.slice(0, 80) : null });
  }
  return out;
}

/** Every statistic whose total today is wanted. */
export function statIds(shape) {
  const ids = [
    ...shape.solar.map((s) => s.energy),
    ...shape.grid.flatMap((g) => [...g.import, ...g.export]),
    ...shape.battery.flatMap((b) => [b.in, b.out]),
    ...shape.gas.map((g) => g.energy), ...shape.water.map((w) => w.energy),
    ...shape.home.map((h) => h.energy), ...shape.devices.map((d) => d.energy),
  ];
  return [...new Set(ids.filter(Boolean))];
}

/** The forecast's hours (ISO time -> Wh), all forecast entries added together. */
export function shapeForecast(result) {
  const hours = {};
  for (const entry of Object.values(result || {})) {
    for (const [at, wh] of Object.entries((entry && entry.wh_hours) || {})) {
      if (Number.isFinite(wh) && !Number.isNaN(Date.parse(at))) hours[at] = (hours[at] || 0) + wh;
    }
  }
  return Object.keys(hours).length ? hours : null;
}

/** `ha` is from createHa(). snapshot() is what /api/ha/energy serves, or null before the first load. */
export function createEnergy({ ha, timers = globalThis, now = Date.now, log = console }) {
  let snap = null;
  let timer = null;
  let stopped = false;

  async function load() {
    const prefs = await ha.command('energy/get_prefs');
    const shape = shapePrefs(prefs);
    const today = {};
    for (const stat of statIds(shape)) {
      try {
        const r = await ha.command('recorder/statistic_during_period', { statistic_id: stat, types: ['change'], calendar: { period: 'day' }, units: UNITS });
        today[stat] = r && Number.isFinite(r.change) ? r.change : null;
      } catch {
        today[stat] = null; // no statistics (yet) for this one: shown as unavailable
      }
    }
    let forecast = null;
    if (shape.solar.some((s) => s.forecast)) {
      try {
        forecast = shapeForecast(await ha.command('energy/solar_forecast'));
      } catch {
        forecast = null;
      }
    }
    snap = { ...shape, today, forecast, at: now() };
  }

  function tick() {
    timer = null;
    if (stopped) return;
    load().then(() => {
      if (!stopped) timer = timers.setTimeout(tick, REFRESH_MS);
    }, (error) => {
      if (error.message !== 'not connected') log.warn(`energy: not loaded (${error.message.startsWith('refused') ? 'refused' : error.message.slice(0, 40)})`);
      if (!stopped) timer = timers.setTimeout(tick, RETRY_MS);
    });
  }

  return {
    start() {
      stopped = false;
      if (!timer) tick();
    },
    stop() {
      stopped = true;
      timers.clearTimeout(timer);
      timer = null;
    },
    snapshot: () => snap,
  };
}
