// Shared setup for the unit tests. The views are plain string renderers, so
// the whole UI can be rendered and inspected without a browser.
import { createFixture } from '../../app/frontend/js/fixtures/synthetic.js';
import { createI18n } from '../../app/frontend/js/i18n/index.js';
import { defaultConfig } from '../../app/frontend/js/config.js';
import { applyConfig } from '../../app/frontend/js/model.js';
import { defaultLock } from '../../app/frontend/js/lock.js';
import { appView, context } from '../../app/frontend/js/views/app.js';

export const LAYOUTS = ['desktop', 'tablet', 'phone'];

const STATE = {
  theme: { mode: 'auto', manual: 'light' }, sun: 'above', layout: 'desktop', netWidth: 1000, view: 'home', room: null, roomCfg: false,
  settings: false, floor: 'floor_01', netTab: 'network', netView: 'all', site: 'site_01', device: null, evPeriod: 'day', menu: null,
  edit: false, planEdit: false, confirm: null, locked: false, pinPad: false, pinEntry: '', diag: null,
  grouping: false, musicSel: null, musicPick: [],
};

/** What main.js collects from the browser for the diagnostics section. */
export const DIAG = {
  agent: 'Test browser <1.0>', width: 1024, height: 768, touch: true,
  checks: ['storage', 'plural', 'currency', 'cssEscape', 'matchMedia', 'pointer', 'file', 'backdrop', 'clipPath', 'colorScheme'].map((id, i) => ({ id, ok: i !== 7 })),
};

/** Build fixture, configuration and render context. tweak(cfg, d) runs before the config is applied. */
export function setup({ lang = 'en', state = {}, tweak } = {}) {
  const d = createFixture();
  const cfg = defaultConfig(d);
  if (tweak) tweak(cfg, d);
  applyConfig(d, cfg);
  const s = { ...STATE, lang, lock: defaultLock(), ...state };
  return { d, cfg, s, c: context(s, d, createI18n(lang), cfg) };
}

export const render = (options) => appView(setup(options).c);

/** A configuration with every EV statistic mapped, one of them to an entity that does not exist. */
export function evConfigured(cfg) {
  cfg.cards.energy.push('ev');
  Object.assign(cfg.ev.map, { status: 'sensor_01', power: 'sensor_03', energy: 'sensor_05', soc: 'sensor_06', duration: 'sensor_07', cost: 'sensor_99' });
}
