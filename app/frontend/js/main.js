// Phase 1 entry point: mocked data only. This file makes no network requests;
// the page's Content-Security-Policy (connect-src 'none') enforces that.
import { createFixture } from './fixtures/synthetic.js';
import { createI18n, LANGS } from './i18n/index.js';
import { resolveTheme, MODES, SUN_STATES } from './theme.js';
import { commands, applyConfig } from './model.js';
import { musicCommands, groupable, tempGroup } from './music.js';
import { needsOnboarding, startOnboarding, isLastStep, moveStep, toggleRoom, applyOnboarding, normalizeAccess, SIGNIN_MODES } from './onboard.js';
import { CARDS, defaultConfig, normalizeConfig, parseConfig, serializeConfig, edit, netViews } from './config.js';
import { appView, context } from './views/app.js';
import { climateVisual, climateStatus } from './views/room.js';
import { EV_PERIODS } from './views/ev.js';
import {
  LOCK_SCOPES, LOCK_METHODS, LOCK_IDLE_MINUTES, HOLD_MS, PIN_LENGTH, PIN_TRIES, PIN_WAIT_MS,
  normalizeLock, isBlocked, isPin, hashPin, checkPin, unlockMethod,
} from './lock.js';

const PREFS_KEY = 'hhd.prefs';
const CONFIG_KEY = 'hhd.config';
const DEVICE_KEY = 'hhd.device'; // child lock; belongs to this device, never exported
const SETUP_KEY = 'hhd.setup'; // whether the first-run setup was started or finished on this device
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
  lock: normalizeLock((loadJson(DEVICE_KEY) || {}).lock),
  locked: false, // set below: a device with the child lock on starts locked
  pinPad: false,
  pinEntry: '',
  diag: null, // filled while the settings are open
  grouping: false, // the sheet for temporary speaker groups
  musicSel: null, // the speaker or group the music card shows
  musicPick: [], // speakers ticked in that sheet
  onboard: null, // the first-run setup while it is open
  access: normalizeAccess((loadJson(SETUP_KEY) || {}).access), // connection and sign-in choices (designs)
};
s.locked = s.lock.enabled;
const d = createFixture();
// The configuration (names the user typed, links to areas and entities) stays in
// this browser in Phase 1. It is never sent anywhere.
// A clean device starts with the setup. A locked one never does: it was set up before.
if (!s.locked && needsOnboarding(loadJson(CONFIG_KEY), loadJson(SETUP_KEY))) s.onboard = startOnboarding();
let cfg = normalizeConfig(loadJson(CONFIG_KEY), d);
applyConfig(d, cfg);
let i18n = createI18n(s.lang);
let lastSheet = null;
let focusNext = null;
let toastTimer = 0;
let idleTimer = 0;
let holdTimer = 0;
let pinFails = 0;
let pinBlockedUntil = 0;

const savePrefs = () => saveJson(PREFS_KEY, JSON.stringify({ lang: s.lang, mode: s.theme.mode, manual: s.theme.manual }));
const saveDevice = () => saveJson(DEVICE_KEY, JSON.stringify({ lock: s.lock }));
let setupState = s.onboard ? 'started' : 'done';
const saveSetup = (state) => {
  setupState = state || setupState;
  saveJson(SETUP_KEY, JSON.stringify({ [setupState]: true, access: s.access }));
};
if (s.onboard) saveSetup('started');

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

const sheetKey = () => {
  if (s.pinPad) return 'pin';
  if (s.onboard && !s.locked) return `onboard/${s.onboard.step}`;
  if (s.settings) return 'settings';
  if (s.grouping) return 'speakers';
  return s.room ? `${s.room}${s.roomCfg ? '/config' : ''}` : null;
};
// Which control gets the focus back when a sheet closes.
const OPENERS = { settings: 'settings::', pin: 'unlock::', speakers: 'music-group::' };

/** What the browser on this device can do. Shown in the settings, since a tablet has no console. */
function diagnostics() {
  const supports = (prop, value) => Boolean(window.CSS && window.CSS.supports && window.CSS.supports(prop, value));
  const works = (fn) => {
    try {
      return Boolean(fn());
    } catch (err) {
      return false;
    }
  };
  return {
    agent: navigator.userAgent,
    width: window.innerWidth,
    height: window.innerHeight,
    touch: navigator.maxTouchPoints > 0,
    checks: [
      { id: 'storage', ok: works(() => { window.localStorage.setItem('hhd.probe', '1'); window.localStorage.removeItem('hhd.probe'); return true; }) },
      { id: 'plural', ok: works(() => new Intl.PluralRules('nl').select(1)) },
      { id: 'currency', ok: works(() => new Intl.NumberFormat('nl', { style: 'currency', currency: 'EUR' }).format(1)) },
      { id: 'cssEscape', ok: works(() => window.CSS.escape('a:b') === 'a\\:b') },
      { id: 'matchMedia', ok: works(() => window.matchMedia('(min-width: 1px)').matches) },
      { id: 'pointer', ok: 'PointerEvent' in window },
      { id: 'file', ok: 'FileReader' in window && 'Blob' in window && works(() => window.URL.createObjectURL) },
      { id: 'backdrop', ok: supports('backdrop-filter', 'blur(1px)') || supports('-webkit-backdrop-filter', 'blur(1px)') },
      { id: 'clipPath', ok: supports('clip-path', 'inset(50%)') || supports('-webkit-clip-path', 'inset(50%)') },
      { id: 'colorScheme', ok: supports('color-scheme', 'dark') },
    ],
  };
}

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
  html.classList.toggle('is-locked', s.locked);
  document.title = `${i18n.tx(`nav.${s.view}`)} · ${i18n.tx('app.title')}`;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[theme]);

  const find = (id) => root.querySelector(`[data-fid="${window.CSS.escape(id)}"]`);
  const nextScroller = root.querySelector('[data-scroll]');
  if (nextScroller && sheet === lastSheet) nextScroller.scrollTop = scrollTop;
  let target = fid ? find(fid) : null;
  if (sheet && sheet !== lastSheet) target = root.querySelector('.sheet-close');
  if (!sheet && lastSheet) target = find(OPENERS[lastSheet] || `room:${lastSheet.split('/')[0]}:`) || target;
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
  const match = /^#\/(home|energy|network)(?:\/(room_\d+|settings|speakers))?(?:\/(config))?$/.exec(window.location.hash);
  s.view = match ? match[1] : 'home';
  if (s.view === 'network' && !netViews(cfg).length) s.view = 'home'; // no source, no network screen
  const sub = match ? match[2] : null;
  // A locked device shows no settings, whatever the address says.
  s.settings = sub === 'settings' && !s.locked;
  s.grouping = sub === 'speakers' && s.view === 'home';
  if (!s.grouping) s.musicPick = [];
  s.room = sub && sub !== 'settings' && s.view === 'home' && d.rooms[sub] ? sub : null;
  s.roomCfg = Boolean(s.room && match[3]) && !s.locked;
  s.diag = s.settings ? diagnostics() : null;
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

/** Lock the device and go back to the home screen, with sheets and edit modes closed. */
function lockNow() {
  window.clearTimeout(idleTimer);
  s.locked = true;
  s.edit = false;
  s.planEdit = false;
  s.pinPad = false;
  s.pinEntry = '';
  if (go('#/home')) {
    route();
    render();
  }
}

/** Restart the countdown to the automatic lock. Called on every touch and key press. */
function resetIdle() {
  window.clearTimeout(idleTimer);
  if (s.lock.enabled && !s.locked) idleTimer = window.setTimeout(lockNow, s.lock.idle * 60000);
}

function unlock() {
  s.locked = false;
  s.pinPad = false;
  s.pinEntry = '';
  pinFails = 0;
  resetIdle();
  render();
  toast('toast.unlocked');
}

const lockedHint = () => toast(unlockMethod(s.lock) === 'pin' ? 'toast.lockedPin' : 'toast.lockedHold');

function endHold() {
  window.clearTimeout(holdTimer);
  holdTimer = 0;
  const button = root.querySelector('.is-holding');
  if (button) button.classList.remove('is-holding');
}

/** Press and hold: the lock opens only when the press lasts the full time. */
function startHold(button) {
  if (holdTimer || !s.locked || unlockMethod(s.lock) !== 'hold') return;
  button.classList.add('is-holding');
  holdTimer = window.setTimeout(() => {
    endHold();
    unlock();
  }, HOLD_MS);
}

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
  // ----- Music. Every command names its target and reaches nothing else. -----
  music(arg, id) {
    const run = { toggle: musicCommands.toggle, stop: musicCommands.stop, loudness: musicCommands.toggleLoudness }[arg];
    if (!run) toast('toast.mock');
    else if (!run(d, cfg, id)) toast('toast.speakerFailed');
    else if (arg === 'stop') toast('toast.castStopped');
  },
  'speaker-tab'(id) {
    s.musicSel = id;
  },
  'music-group': () => go('#/home/speakers'),
  'music-pick'(id) {
    const at = s.musicPick.indexOf(id);
    if (at < 0) s.musicPick.push(id);
    else s.musicPick.splice(at, 1);
  },
  /** Tick every speaker of a room that can be grouped, or untick them when all are ticked. */
  'music-pick-room'(roomId) {
    const own = groupable(d, cfg).filter((o) => !o.reason && d.rooms[roomId] && d.rooms[roomId].speakers.includes(o.id)).map((o) => o.id);
    const all = own.every((id) => s.musicPick.includes(id));
    s.musicPick = s.musicPick.filter((id) => !own.includes(id)).concat(all ? [] : own);
  },
  'music-group-start'() {
    const id = musicCommands.group(d, cfg, s.musicPick);
    if (!id) {
      toast('toast.groupFailed');
      return true;
    }
    s.musicSel = id;
    s.musicPick = [];
    toast('toast.groupStarted');
    return go('#/home');
  },
  'music-dissolve'(id) {
    const lead = tempGroup(d, id) ? tempGroup(d, id).members[0] : null;
    if (!musicCommands.dissolve(d, id)) return;
    if (s.musicSel === id) s.musicSel = lead;
    toast('toast.groupDissolved');
  },
  'speakers-flag'(flag) {
    if (edit.toggleMusicFlag(cfg, flag)) commit();
  },
  'speakers-show'(key) {
    if (edit.toggleMusicShow(cfg, key)) commit();
  },
  'speakers-use'(id) {
    if (edit.togglePlayer(cfg, id)) commit();
  },
  'speakers-member'(groupId, memberId) {
    if (edit.toggleGroupMember(cfg, groupId, memberId)) commit();
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

  // ----- Child lock (this device only) -----
  unlock() {
    if (!s.locked) return false;
    if (unlockMethod(s.lock) !== 'pin') {
      lockedHint();
      return false;
    }
    if (Date.now() < pinBlockedUntil) {
      toast('toast.pinWait');
      return false;
    }
    s.pinPad = true;
    s.pinEntry = '';
    return true;
  },
  'pin-digit'(digit) {
    if (!s.pinPad || !/^\d$/.test(digit)) return false;
    s.pinEntry += digit;
    if (s.pinEntry.length < PIN_LENGTH) return true;
    if (checkPin(s.lock, s.pinEntry)) {
      unlock();
      return false;
    }
    s.pinEntry = '';
    pinFails += 1;
    if (pinFails >= PIN_TRIES) {
      // Mashing the keys gets a pause, not endless tries.
      pinFails = 0;
      pinBlockedUntil = Date.now() + PIN_WAIT_MS;
      s.pinPad = false;
      toast('toast.pinWait');
    } else {
      toast('toast.pinWrong');
    }
    return true;
  },
  'pin-back'() {
    s.pinEntry = s.pinEntry.slice(0, -1);
  },
  'pin-cancel'() {
    s.pinPad = false;
    s.pinEntry = '';
  },
  'lock-toggle'() {
    s.lock.enabled = !s.lock.enabled;
    saveDevice();
    resetIdle();
  },
  'lock-scope'(value) {
    if (!LOCK_SCOPES.includes(value)) return;
    s.lock.scope = value;
    saveDevice();
  },
  'lock-method'(value) {
    if (!LOCK_METHODS.includes(value)) return;
    s.lock.method = value;
    saveDevice();
  },
  'lock-idle'(value) {
    if (!LOCK_IDLE_MINUTES.includes(Number(value))) return;
    s.lock.idle = Number(value);
    saveDevice();
    resetIdle();
  },
  'lock-now'() {
    if (!s.lock.enabled) return true;
    lockNow();
    return false;
  },

  // ----- Optional features, data sources, backup -----
  // ----- First-run setup -----
  /** From the settings to the floors and rooms editor on the home screen. */
  'rooms-edit'() {
    s.planEdit = true;
    return go('#/home');
  },
  'onboard-back': () => moveStep(s.onboard, 'back'),
  'onboard-next'() {
    if (!isLastStep(s.onboard)) {
      moveStep(s.onboard, 'next');
      return;
    }
    applyOnboarding(cfg, s.onboard);
    actions['onboard-skip']();
  },
  /** Leave the setup. What was chosen so far stays; everything is in the settings too. */
  'onboard-skip'() {
    s.onboard = null;
    saveSetup('done');
    commit();
    toast('toast.setupDone');
  },
  // The next three are designs of what the backend will do. Nothing is contacted.
  'access-connect'() {
    s.access.connected = true;
    saveSetup();
  },
  'access-signin'(mode) {
    if (!SIGNIN_MODES.includes(mode)) return;
    s.access.signin = mode;
    saveSetup();
  },
  'access-pair'() {
    s.access.paired = true;
    saveSetup();
  },
  'onboard-room'(roomId) {
    if (d.rooms[roomId]) toggleRoom(s.onboard, roomId);
  },
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
  'speakers-name'(id, value) {
    const p = d.speakers[id];
    const builtIn = p && value.trim() === i18n.tx(p.nameKey);
    if (edit.renamePlayer(cfg, id, builtIn ? '' : value)) commit();
  },
  'speakers-preferred'(arg, id) {
    if (edit.setPreferredPlayer(cfg, id)) commit();
  },
  'lock-pin'(arg, value) {
    if (!isPin(value)) {
      toast('toast.pinFormat');
      return;
    }
    s.lock.pin = hashPin(value);
    saveDevice();
    toast('toast.pinSaved');
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
  const name = el.getAttribute('data-action');
  const fn = actions[name];
  if (!fn) return;
  if (isBlocked(s.lock, s.locked, name)) {
    lockedHint();
    return;
  }
  const result = fn(el.getAttribute('data-arg') || '', el.getAttribute('data-val') || '', el);
  if (hadConfirm && s.confirm === hadConfirm) s.confirm = null; // any other tap disarms a pending confirmation
  if (result !== false) render();
});

// Range inputs update only the parts that change, so a drag is never interrupted.
root.addEventListener('input', (event) => {
  const el = event.target;
  const kind = el.getAttribute && el.getAttribute('data-input');
  if (kind && isBlocked(s.lock, s.locked, kind)) {
    render(); // puts the slider back where it was
    lockedHint();
    return;
  }
  if (kind === 'volume') {
    musicCommands.setVolume(d, cfg, el.getAttribute('data-arg'), el.value);
    const out = root.querySelector('[data-bind="volume"]');
    if (out) out.textContent = i18n.num(Math.round(Number(el.value)));
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
  if (kind && isBlocked(s.lock, s.locked, kind)) {
    render();
    return;
  }
  if (kind === 'climate-target') render();
  if (kind === 'config-import') importConfig(el.files && el.files[0]);
  if (!inputs[kind]) return;
  inputs[kind](el.getAttribute('data-arg') || '', el.value);
  render();
});

// Hold to unlock, by touch, mouse or keyboard. Letting go early cancels it.
const holdButton = (event) => (event.target.closest ? event.target.closest('[data-hold="unlock"]') : null);
root.addEventListener('pointerdown', (event) => {
  const button = holdButton(event);
  if (button) startHold(button);
});
['pointerup', 'pointercancel', 'pointerout'].forEach((type) => root.addEventListener(type, (event) => {
  if (holdTimer && (type !== 'pointerout' || holdButton(event))) endHold();
}));
root.addEventListener('keyup', endHold);
document.addEventListener('pointerdown', resetIdle, true);

document.addEventListener('keydown', (event) => {
  resetIdle();
  const open = sheetKey();
  if ((event.key === 'Enter' || event.key === ' ') && !event.repeat && holdButton(event)) startHold(holdButton(event));
  if (s.pinPad && /^\d$/.test(event.key)) {
    if (actions['pin-digit'](event.key) !== false) render();
    return;
  }
  if (event.key === 'Escape') {
    if (s.menu) {
      s.menu = null;
      render();
    } else if (s.pinPad) {
      actions['pin-cancel']();
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
resetIdle();
