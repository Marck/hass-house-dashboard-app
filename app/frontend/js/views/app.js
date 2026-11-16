import { shell } from './shell.js';
import { homeView } from './home.js';
import { energyView } from './energy.js';
import { networkView } from './network.js';
import { roomSheet } from './room.js';
import { roomConfigSheet, settingsSheet } from './editor.js';
import { pinPad } from './lock.js';

export const VIEWS = { home: homeView, energy: energyView, network: networkView };

/** Render the whole app for a context { s, d, cfg, t, tx, tn, rich, f }. */
export function appView(c) {
  const { s, d } = c;
  let overlay = '';
  if (s.pinPad) overlay = pinPad(c);
  else if (s.settings && !s.locked) overlay = settingsSheet(c);
  else if (s.room && d.rooms[s.room]) overlay = s.roomCfg && !s.locked ? roomConfigSheet(c, s.room) : roomSheet(c, s.room);
  return shell(c, VIEWS[s.view](c), overlay);
}

/** Build the render context from state, data, an i18n instance and the configuration. */
export const context = (s, d, i18n, cfg) => ({ s, d, cfg, t: i18n.t, tx: i18n.tx, tn: i18n.tn, rich: i18n.rich, f: i18n });
