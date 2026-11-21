// Music over several speakers: which players are managed, what is playing
// where, and the commands on one target. A target is a speaker, a permanent
// speaker group (its own media player in Home Assistant) or a temporary group
// made here.
//
// Everything is pure and works on the normalized data, so Phase 2 only has to
// fill d.speakers and d.tempGroups from Home Assistant.
import { clamp } from './util.js';

export const ACTIVE_STATES = ['playing', 'paused'];
/** At least this many speakers make a group. */
export const GROUP_MIN = 2;

const isActive = (p) => Boolean(p) && ACTIVE_STATES.includes(p.state);
// Keys are translation keys in the demo and literal names ({ text }) when live.
const keyOf = (k) => (k && typeof k === 'object' ? `=${k.text}` : k);
const sameMedia = (a, b) => keyOf(a.titleKey) === keyOf(b.titleKey) && keyOf(a.artistKey) === keyOf(b.artistKey);

/** Whether a player offers a control right now. An unavailable player offers none. */
export const can = (p, feature) => Boolean(p) && p.state !== 'unavailable' && p.features.includes(feature);

export const tempGroup = (d, id) => d.tempGroups.find((g) => g.id === id) || null;

/**
 * Resolve an id to a target: { id, kind, player, members }. For a temporary
 * group the player is its first member, which leads the group.
 */
export function target(d, cfg, id) {
  const temp = tempGroup(d, id);
  if (temp) return { id, kind: 'temp', player: d.speakers[temp.members[0]] || null, members: temp.members };
  const p = d.speakers[id];
  if (!p || !cfg.music.players.includes(id)) return null;
  const members = p.kind === 'group' ? (cfg.music.members[id] || []).filter((m) => d.speakers[m]) : [];
  return { id, kind: p.kind, player: p, members };
}

/** Managed players that exist, in the user's order, and the configured ones that do not. */
export function managed(d, cfg) {
  return {
    list: cfg.music.players.filter((id) => d.speakers[id]),
    missing: cfg.music.players.filter((id) => !d.speakers[id]),
  };
}

/** The player shown when nothing chose otherwise: the preferred one, else the first managed. */
export function defaultPlayer(d, cfg) {
  const { list } = managed(d, cfg);
  return list.includes(cfg.music.preferred) ? cfg.music.preferred : list[0] || null;
}

/**
 * Everything that is playing or paused, one entry per target. A member of a
 * group is left out while it plays what the group plays; a member doing
 * something of its own stays. With multi-speaker support off, only the default
 * player counts.
 */
export function sessions(d, cfg) {
  const { list } = managed(d, cfg);
  if (!cfg.music.multi) {
    const only = defaultPlayer(d, cfg);
    return only && isActive(d.speakers[only]) ? [only] : [];
  }
  const hidden = new Set();
  const leaders = {};
  d.tempGroups.forEach((g) => {
    g.members.forEach((m) => hidden.add(m));
    leaders[g.members[0]] = g.id;
  });
  list.forEach((id) => {
    const p = d.speakers[id];
    if (p.kind !== 'group' || !isActive(p)) return;
    (cfg.music.members[id] || []).forEach((m) => {
      if (isActive(d.speakers[m]) && sameMedia(d.speakers[m], p)) hidden.add(m);
    });
  });
  const out = [];
  list.forEach((id) => {
    if (leaders[id] && isActive(d.speakers[id])) out.push(leaders[id]);
    else if (!hidden.has(id) && isActive(d.speakers[id])) out.push(id);
  });
  return out;
}

/** Which session the card shows: the one asked for, else the default player, else one that plays. */
export function selected(d, cfg, wanted) {
  const list = sessions(d, cfg);
  if (list.includes(wanted)) return wanted;
  const preferred = defaultPlayer(d, cfg);
  if (list.includes(preferred)) return preferred;
  return list.find((id) => target(d, cfg, id).player.state === 'playing') || list[0] || null;
}

/** The dashboard rooms a target plays in: where its entity is shown, or its members' rooms. */
export function playerRooms(d, cfg, id) {
  const t = target(d, cfg, id);
  const own = t && t.members.length ? t.members : [id];
  return Object.keys(d.rooms).filter((roomId) => own.some((m) => (d.rooms[roomId].speakers || []).includes(m)));
}

/** Rooms in which a managed speaker is playing right now. */
export function playingRooms(d, cfg) {
  const playing = managed(d, cfg).list.filter((id) => d.speakers[id].state === 'playing');
  return Object.keys(d.rooms).filter((roomId) => (d.rooms[roomId].speakers || []).some((id) => playing.includes(id)));
}

/** Managed single speakers that can join a temporary group, and why the others cannot. */
export function groupable(d, cfg) {
  const taken = new Set();
  d.tempGroups.forEach((g) => g.members.forEach((m) => taken.add(m)));
  return managed(d, cfg).list.filter((id) => d.speakers[id].kind === 'speaker').map((id) => {
    const p = d.speakers[id];
    let reason = null;
    if (p.state === 'unavailable') reason = 'unavailable';
    else if (!p.features.includes('group')) reason = 'unsupported';
    else if (taken.has(id)) reason = 'grouped';
    return { id, reason };
  });
}

/** Temporary grouping is offered only when enough speakers report the capability. */
export const canGroup = (d, cfg) => cfg.music.multi
  && managed(d, cfg).list.filter((id) => d.speakers[id].kind === 'speaker' && d.speakers[id].features.includes('group')).length >= GROUP_MIN;

function setState(d, ids, state) {
  ids.forEach((id) => {
    d.speakers[id].state = state;
  });
}

/** The players a command on this target reaches, and never any other. */
function reach(d, t) {
  if (t.kind === 'temp') return t.members;
  if (t.kind === 'group') return [t.id, ...t.members.filter((m) => sameMedia(d.speakers[m], t.player) && isActive(d.speakers[m]))];
  return [t.id];
}

// Each command returns false when the target cannot do it, so the caller can say so.
export const musicCommands = {
  toggle(d, cfg, id) {
    const t = target(d, cfg, id);
    if (!t || !can(t.player, 'play')) return false;
    const next = t.player.state === 'playing' ? 'paused' : 'playing';
    if (t.kind === 'group' && !isActive(t.player)) {
      // Starting a group puts its media on every member that is free.
      t.members.forEach((m) => {
        const p = d.speakers[m];
        if (p.state === 'unavailable' || isActive(p)) return;
        Object.assign(p, { titleKey: t.player.titleKey, artistKey: t.player.artistKey, art: t.player.art });
      });
      setState(d, [t.id, ...t.members.filter((m) => sameMedia(d.speakers[m], t.player) && d.speakers[m].state !== 'unavailable')], next);
      return true;
    }
    setState(d, reach(d, t), next);
    return true;
  },
  /** Stop casting: ends the session on this target only. */
  stop(d, cfg, id) {
    const t = target(d, cfg, id);
    if (!t || !can(t.player, 'stop')) return false;
    setState(d, reach(d, t), 'off');
    return true;
  },
  setVolume(d, cfg, id, value) {
    const t = target(d, cfg, id);
    const v = Math.round(Number(value));
    if (!t || !Number.isFinite(v)) return false;
    const ids = (t.kind === 'temp' ? t.members : [t.id]).filter((m) => can(d.speakers[m], 'volume'));
    ids.forEach((m) => {
      d.speakers[m].volume = clamp(v, 0, 100);
    });
    return ids.length > 0;
  },
  toggleLoudness(d, cfg, id) {
    const t = target(d, cfg, id);
    if (!t || !can(t.player, 'sound')) return false;
    t.player.loudness = !t.player.loudness;
    return true;
  },
  /**
   * Make a temporary group and start playing on it. Speakers that cannot be
   * grouped are ignored; fewer than two usable speakers make no group.
   */
  group(d, cfg, ids) {
    const ok = groupable(d, cfg).filter((x) => !x.reason).map((x) => x.id);
    const members = [...new Set(ids)].filter((id) => ok.includes(id));
    if (members.length < GROUP_MIN) return null;
    let n = 1;
    while (tempGroup(d, `temp_${String(n).padStart(2, '0')}`)) n += 1;
    const id = `temp_${String(n).padStart(2, '0')}`;
    const lead = d.speakers[members[0]];
    members.forEach((m) => {
      Object.assign(d.speakers[m], { titleKey: lead.titleKey, artistKey: lead.artistKey, art: lead.art, state: 'playing' });
    });
    d.tempGroups.push({ id, members });
    return id;
  },
  /** Dissolve a temporary group: the first speaker keeps playing, the others stop. */
  dissolve(d, id) {
    const g = tempGroup(d, id);
    if (!g) return false;
    setState(d, g.members.slice(1).filter((m) => d.speakers[m].state !== 'unavailable'), 'off');
    d.tempGroups.splice(d.tempGroups.indexOf(g), 1);
    return true;
  },
};
