// Phase 1 entry point: mocked data only. This file makes no network requests;
// the page's Content-Security-Policy (connect-src 'none') enforces that.
import { createFixture } from './fixtures/synthetic.js';
import { createI18n, LANGS } from './i18n/index.js';
import { resolveTheme, MODES, SUN_STATES } from './theme.js';
import { commands, applyConfig } from './model.js';
import { CARDS, defaultConfig, normalizeConfig, parseConfig, serializeConfig, edit, netViews } from './config.js';
import { appView, context } from './views/app.js';
import { climateVisual, climateStatus } from './views/room.js';
import { EV_PERIODS } from './views/ev.js';

const PREFS_KEY = 'hhd.prefs';
const CONFIG_KEY = 'hhd.config';
const IMPORT_MAX_BYTES = 200000;
const THEME_COLORS = { light: '#e9efed', dark: '#0e1413' };
const root = document.getElementById('app');
const toastEl = document.getElementById('toast');

function loadJson(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null');
  } catch (err) {
    return null;
  }
}

function saveJson(key, text) {
  try {
    window.localStorage.setItem(key, text);
  } catch (err) {
    // Private mode or blocked storage: the setting simply lasts for this visit.
  }
}

const stored = loadJson(PREFS_KEY);
const prefs = stored && typeof stored === 'object' ? stored : {};
const browserLang = (navigator.language || 'en').toLowerCase().startsWith('nl') ? 'nl' : 'en';

const s = {
  lang: LANGS.includes(prefs.lang) ? prefs.lang : browserLang,
  theme: { mode: MODES.includes(prefs.mode) ? prefs.mode : 'auto', manual: prefs.manual === 'dark' ? 'dark' : 'light' },
  sun: 'above', // Phase 1 mock. Phase 2 takes this from the Home Assistant sun state.
  layout: 'desktop',
  netWidth: 0,
  view: 'home',
  room: null,
  roomCfg: false,
  settings: false,
  floor: 'floor_01',
  netTab: 'network',
  netView: 'all',
  site: 'site_01',
  device: null,
  evPeriod: 'day',
  menu: null,
  edit: false, // card layout edit mode
  planEdit: false, // floors and rooms editor
  confirm: null, // a destructive action waiting for its second tap
};
const d = createFixture();
// The configuration (names the user typed, links to areas and entities) stays in
// this browser in Phase 1. It is never sent anywhere.
let cfg = normalizeConfig(loadJson(CONFIG_KEY), d);
applyConfig(d, cfg);
let i18n = createI18n(s.lang);
let lastSheet = null;
let focusNext = null;
let toastTimer = 0;

const savePrefs = () => saveJson(PREFS_KEY, JSON.stringify({ lang: s.lang, mode: s.theme.mode, manual: s.theme.manual }));

function toast(key, params) {
  toastEl.textContent = i18n.tx(key, params);
  toastEl.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('is-visible'), 3200);
}

function currentLayout() {
  if (window.matchMedia('(max-width: 699px), (max-height: 499px)').matches) return 'phone';
  return window.matchMedia('(min-width: 1100px)').matches ? 'desktop' : 'tablet';
}

/** Positions come from data-style and are applied through the CSSOM, which a strict style-src allows. */
function applyStyles(scope) {
  scope.querySelectorAll('[data-style]').forEach((el) => {
    el.style.cssText = el.getAttribute('data-style');
  });
}

const sheetKey = () => (s.settings ? 'settings' : s.room ? `${s.room}${s.roomCfg ? '/config' : ''}` : null);

function render() {
  const active = document.activeElement;
  const fid = active && active.getAttribute ? active.getAttribute('data-fid') : null;
  const scroller = root.querySelector('[data-scroll]');
  const scrollTop = scroller ? scroller.scrollTop : 0;
  const c = context(s, d, i18n, cfg);
  const sheet = sheetKey();

  root.innerHTML = appView(c);
  applyStyles(root);

  const html = document.documentElement;
  const theme = resolveTheme(s.theme, s.sun);
  html.setAttribute('lang', s.lang);
  html.setAttribute('data-theme', theme);
  html.classList.toggle('has-sheet', Boolean(sheet));
  document.title = `${i18n.tx(`nav.${s.view}`)} · ${i18n.tx('app.title')}`;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);

  const find = (id) => root.querySelector(`[data-fid="${window.CSS.escape(id)}"]`);
  const nextScroller = root.querySelector('[data-scroll]');
  if (nextScroller && sheet === lastSheet) nextScroller.scrollTop = scrollTop;
  let target = fid ? find(fid) : null;
  if (sheet && sheet !== lastSheet) target = root.querySelector('.sheet-close');
  if (!sheet && lastSheet) target = find(lastSheet === 'settings' ? 'settings::' : `room:${lastSheet.split('/')[0]}:`) || target;
  if (focusNext) {
    target = find(focusNext) || target;
    focusNext = null;
    if (target && target.select) target.select();
  }
  if (target) target.focus({ preventScroll: true });
  lastSheet = sheet;

  measure();
}

/** The network map is laid out for its real pixel width; re-render once if that changed. */
function measure() {
  const map = document.getElementById('netmap');
  if (!map) return;
  const width = Math.round(map.parentElement.clientWidth - 2 * parseFloat(window.getComputedStyle(map.parentElement).paddingLeft));
  if (width > 0 && Math.abs(width - s.netWidth) > 4) {
    s.netWidth = width;
    render();
  }
}

function route() {
  const match = /^#\/(home|energy|network)(?:\/(room_\d+|settings))?(?:\/(config))?$/.exec(window.location.hash);
  s.view = match ? match[1] : 'home';
  if (s.view === 'network' && !netViews(cfg).length) s.view = 'home'; // no source, no network screen
  const sub = match ? match[2] : null;
  s.settings = sub === 'settings';
  s.room = sub && !s.settings && s.view === 'home' && d.rooms[sub] ? sub : null;
  s.roomCfg = Boolean(s.room && match[3]);
  if (s.room) s.floor = d.rooms[s.room].floor;
  if (!d.floors.some((fl) => fl.id === s.floor)) s.floor = d.floors[0].id;
  if (!netViews(cfg).includes(s.netView)) s.netView = 'all';
  s.menu = null;
  s.confirm = null;
}

/** Store the configuration and rebuild everything derived from it. */
function commit() {
  saveJson(CONFIG_KEY, serializeConfig(cfg));
  applyConfig(d, cfg);
  route();
}

const go = (hash) => {
  if (window.location.hash === hash) return true;
  window.location.hash = hash;
  return false; // the hashchange handler renders
};

function exportConfig() {
  const url = window.URL.createObjectURL(new window.Blob([serializeConfig(cfg)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'dashboard-config.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
  toast('toast.exportDone');
}

/** An import replaces the configuration only when the whole file is valid. */
function importConfig(file) {
  if (!file) return;
  if (file.size > IMPORT_MAX_BYTES) {
    toast('toast.importInvalid');
    return;
  }
  const reader = new window.FileReader();
  reader.onload = () => {
    const next = parseConfig(String(reader.result), d);
    if (next) {
      cfg = next;
      commit();
    }
    render();
    toast(next ? 'toast.importDone' : 'toast.importInvalid');
  };
  reader.onerror = () => toast('toast.importInvalid');
  reader.readAsText(file);
}

/** Destructive actions need a second tap on the same button. Returns true on that second tap. */
function confirmed(key) {
  if (s.confirm === key) return true;
  s.confirm = key;
  return false;
}

// Each action returns false when a later event (hashchange) will render instead.
const actions = {
  menu(arg) {
    s.menu = s.menu === arg ? null : arg;
  },
  lang(arg) {
    if (!LANGS.includes(arg)) return;
    s.lang = arg;
    i18n = createI18n(arg);
    savePrefs();
  },
  'theme-mode'(arg) {
    if (!MODES.includes(arg)) return;
    s.theme.mode = arg;
    savePrefs();
  },
  'theme-manual'(arg) {
    s.theme.manual = arg === 'dark' ? 'dark' : 'light';
    savePrefs();
  },
  sun(arg) {
    if (SUN_STATES.includes(arg)) s.sun = arg;
  },
  floor(arg) {
    if (d.floors.some((fl) => fl.id === arg)) s.floor = arg;
  },
  room: (arg) => (d.rooms[arg] ? go(`#/home/${arg}`) : true),
  'close-sheet': () => go(`#/${s.view}`),
  settings: () => go(`#/${s.view}/settings`),
  climate: (arg) => commands.toggleClimate(d, arg),
  'ac-mode': (arg, val) => commands.setAcMode(d, arg, val),
  'ac-fan': (arg, val) => commands.setAcFan(d, arg, val),
  'ac-preset': (arg, val) => commands.toggleAcPreset(d, arg, val),
  switch: (arg) => commands.toggleSwitch(d, arg),
  'power-on'(arg) {
    d.switches[arg].on = true;
  },
  light(arg) {
    if (!commands.toggleLight(d, arg)) toast('toast.unreachable');
  },
  'lights-all'(arg, val, el) {
    commands.setRoomLights(d, arg, el.getAttribute('aria-checked') !== 'true');
  },
  more: () => toast('toast.phase2'),
  details: () => toast('toast.phase2'),
  bell: () => toast('toast.noNotifications'),
  flow(arg) {
    const target = arg === 'battery' ? document.getElementById('card-battery') : null;
    if (target) target.scrollIntoView({ block: 'center' });
    else toast('toast.mock');
    return false;
  },
  'net-tab'(arg) {
    s.netTab = arg === 'availability' ? 'availability' : 'network';
  },
  'net-view'(arg) {
    if (!netViews(cfg).includes(arg)) return;
    s.netView = arg;
    s.device = null;
  },
  site(arg) {
    if (d.network.bySite[arg]) {
      s.site = arg;
      s.device = null;
    }
  },
  device(arg) {
    s.device = s.device === arg ? null : arg;
  },
  zone: (arg) => commands.toggleZone(d, arg),
  music(arg) {
    if (arg === 'toggle') d.music.playing = !d.music.playing;
    else if (arg === 'loudness') d.music.loudness = !d.music.loudness;
    else toast('toast.mock');
  },
  scene(arg) {
    if (arg === 'all-off') commands.allLightsOff(d);
    if (arg === 'ac-off') commands.setClimateKind(d, 'ac', false);
    if (arg === 'heating-off') commands.setClimateKind(d, 'heating', false);
    if (arg === 'outside-on') commands.setOutside(d, true);
    if (arg === 'outside-off') commands.setOutside(d, false);
    if (arg === 'string-lights') d.tonight.stringLights = !d.tonight.stringLights;
    if (arg === 'evening') {
      commands.setOutside(d, true);
      d.tonight.stringLights = true;
      toast('toast.evening');
    }
  },
  'ev-period'(arg) {
    if (EV_PERIODS.includes(arg)) s.evPeriod = arg;
  },

  // ----- Card layout -----
  'edit-layout'() {
    s.edit = !s.edit;
  },
  'card-move'(id, dir) {
    if (edit.moveCard(cfg, s.view, id, dir)) commit();
  },
  'card-hide'(id) {
    if (edit.hideCard(cfg, s.view, id)) commit();
  },
  'card-show'(id) {
    if (edit.showCard(cfg, s.view, id)) commit();
  },
  /** Switch an optional card on or off from the settings, whatever screen is open. */
  'card-toggle'(id) {
    const view = Object.keys(CARDS).find((v) => CARDS[v].includes(id));
    if (!view) return;
    if (!edit.hideCard(cfg, view, id)) edit.showCard(cfg, view, id);
    commit();
  },
  'layout-reset'() {
    edit.resetCards(cfg, d);
    commit();
    toast('toast.layoutReset');
  },

  // ----- Floors and rooms -----
  'plan-edit'() {
    s.planEdit = !s.planEdit;
  },
  'floor-add'() {
    const id = edit.addFloor(cfg, i18n.tx('edit.newFloor'));
    if (!id) return;
    commit();
    s.floor = id;
    focusNext = `floor-label:${id}`;
  },
  'floor-move'(id, dir) {
    if (edit.moveFloor(cfg, id, dir)) commit();
  },
  'floor-remove'(id) {
    if (edit.removeFloor(cfg, id)) commit();
    else toast(cfg.floors.length < 2 ? 'toast.lastFloor' : 'toast.floorNotEmpty');
  },
  'room-add'(floorId) {
    const id = edit.addRoom(cfg, floorId, i18n.tx('edit.newRoom'));
    if (!id) return true;
    commit();
    focusNext = `room-label:${id}`;
    return go(`#/home/${id}/config`);
  },
  'room-move'(id, dir) {
    if (edit.moveRoom(cfg, id, dir)) commit();
  },
  'room-config': (id) => (d.rooms[id] ? go(`#/home/${id}/config`) : true),
  'room-back': (id) => go(`#/home/${id}`),
  'room-remove'(id) {
    if (!confirmed(`room:${id}`)) return true;
    edit.removeRoom(cfg, id);
    commit();
    toast('toast.roomRemoved');
    return go('#/home');
  },
  'area-unlink'(roomId, areaId) {
    if (edit.unlinkArea(cfg, roomId, areaId)) commit();
  },
  'entity-toggle'(roomId, entityId) {
    if (edit.toggleEntity(cfg, roomId, entityId)) commit();
  },
  'entity-drop'(roomId, entityId) {
    if (edit.dropEntity(cfg, roomId, entityId)) commit();
  },

  // ----- Optional features, data sources, backup -----
  'ev-stat'(slot) {
    if (edit.toggleEvStat(cfg, slot)) commit();
  },
  'net-source'(src) {
    if (edit.toggleNetSource(cfg, src)) commit();
  },
  'config-export'() {
    exportConfig();
    return false;
  },
  'config-reset'() {
    if (!confirmed('config')) return;
    cfg = defaultConfig(d);
    commit();
    toast('toast.configReset');
  },
};

// Text fields and selects of the editors. Each runs when the value is committed.
const inputs = {
  'floor-label'(id, value) {
    const def = d.floorDefs[id];
    const builtIn = def && value.trim() === i18n.tx(def.nameKey);
    if (!edit.renameFloor(cfg, d, id, builtIn ? '' : value)) toast('toast.nameRequired');
    commit();
  },
  'room-label'(id, value) {
    const def = d.roomDefs[id];
    const builtIn = def && value.trim() === i18n.tx(def.nameKey);
    if (!edit.renameRoom(cfg, d, id, builtIn ? '' : value)) toast('toast.nameRequired');
    commit();
  },
  'room-floor'(id, floorId) {
    if (edit.setRoomFloor(cfg, id, floorId)) commit();
  },
  'area-pick'(roomId, areaId) {
    if (areaId && edit.linkArea(cfg, roomId, areaId)) commit();
  },
  'entity-pick'(roomId, entityId) {
    if (entityId && edit.includeEntity(cfg, roomId, entityId)) commit();
  },
  'ev-map'(slot, entityId) {
    if (edit.setEvEntity(cfg, slot, entityId)) commit();
  },
};

root.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  const hadMenu = Boolean(s.menu);
  const hadConfirm = s.confirm;
  if (hadMenu && !event.target.closest('[data-menu-root]')) s.menu = null;
  if (!el) {
    if (hadMenu && !s.menu) render();
    return;
  }
  const fn = actions[el.getAttribute('data-action')];
  if (!fn) return;
  const result = fn(el.getAttribute('data-arg') || '', el.getAttribute('data-val') || '', el);
  if (hadConfirm && s.confirm === hadConfirm) s.confirm = null; // any other tap disarms a pending confirmation
  if (result !== false) render();
});

// Range inputs update only the parts that change, so a drag is never interrupted.
root.addEventListener('input', (event) => {
  const el = event.target;
  const kind = el.getAttribute && el.getAttribute('data-input');
  if (kind === 'volume') {
    commands.setVolume(d, el.value);
    const out = root.querySelector('[data-bind="volume"]');
    if (out) out.textContent = i18n.num(d.music.volume);
  }
  if (kind === 'climate-target') {
    const id = el.getAttribute('data-arg');
    commands.setTarget(d, id, el.value);
    const c = context(s, d, i18n, cfg);
    const visual = root.querySelector(`[data-bind="climate-visual:${id}"]`);
    const status = root.querySelector(`[data-bind="climate-status:${id}"]`);
    if (visual) visual.innerHTML = climateVisual(c, id);
    if (status) status.innerHTML = climateStatus(c, d.climate[id]); // already escaped by t()
    el.setAttribute('aria-valuetext', i18n.temp(d.climate[id].target));
  }
});

root.addEventListener('change', (event) => {
  const el = event.target;
  const kind = el.getAttribute && el.getAttribute('data-input');
  if (kind === 'climate-target') render();
  if (kind === 'config-import') importConfig(el.files && el.files[0]);
  if (!inputs[kind]) return;
  inputs[kind](el.getAttribute('data-arg') || '', el.value);
  render();
});

document.addEventListener('keydown', (event) => {
  const open = sheetKey();
  if (event.key === 'Escape') {
    if (s.menu) {
      s.menu = null;
      render();
    } else if (open) {
      actions['close-sheet']();
    }
    return;
  }
  if (event.key === 'Enter' && event.target.matches && event.target.matches('input[type="text"]')) {
    event.target.blur(); // commits the value through the change event
    return;
  }
  if (event.key !== 'Tab' || !open) return;
  const sheet = root.querySelector('.sheet');
  const items = sheet ? sheet.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select') : [];
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (!sheet.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

window.addEventListener('hashchange', () => {
  const before = s.view;
  route();
  render();
  if (s.view !== before) window.scrollTo(0, 0);
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    const layout = currentLayout();
    if (layout !== s.layout) {
      s.layout = layout;
      render();
    } else {
      measure();
    }
  }, 120);
});

s.layout = currentLayout();
route();
render();
