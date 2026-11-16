import test from 'node:test';
import assert from 'node:assert/strict';
import { edit, normalizeConfig, serializeConfig, parseConfig, MUSIC_SHOW } from '../../app/frontend/js/config.js';
import { sessions, selected, target, managed, playerRooms, playingRooms, groupable, canGroup, can, musicCommands } from '../../app/frontend/js/music.js';
import { isBlocked, defaultLock } from '../../app/frontend/js/lock.js';
import { LANGS } from '../../app/frontend/js/i18n/index.js';
import { render, setup, LAYOUTS } from './helpers.js';

const states = (d) => Object.fromEntries(Object.keys(d.speakers).map((id) => [id, d.speakers[id].state]));
const tabs = (html) => (html.match(/data-action="speaker-tab" data-arg="[\w]+" data-fid="speaker-tab:[\w]+:"/g) || []).length;
const quiet = (cfg, d) => Object.keys(d.speakers).forEach((id) => {
  if (d.speakers[id].state !== 'unavailable') d.speakers[id].state = 'idle';
});

test('a playing group stands for its members; a member doing its own thing does not hide', () => {
  const { d, cfg } = setup();
  const group = Object.keys(d.speakers).find((id) => d.speakers[id].kind === 'group');
  const members = cfg.music.members[group];
  const active = sessions(d, cfg);
  assert.ok(active.includes(group));
  members.forEach((m) => assert.ok(!active.includes(m), `${m} is listed next to its group`));
  assert.equal(new Set(active).size, active.length);

  // One member starts something else: it is a session of its own again.
  d.speakers[members[0]].titleKey = 'music.radio';
  assert.ok(sessions(d, cfg).includes(members[0]));
  assert.ok(!sessions(d, cfg).includes(members[1]));

  // The group stops being managed: its members are ordinary speakers.
  d.speakers[members[0]].titleKey = d.speakers[group].titleKey;
  edit.togglePlayer(cfg, group);
  members.forEach((m) => assert.ok(sessions(d, cfg).includes(m)));
});

test('the card has tabs and an overview only while several targets are active', () => {
  const many = render();
  const count = sessions(setup().d, setup().cfg).length;
  assert.ok(count > 1);
  assert.equal(tabs(many), count);
  assert.match(many, /class="now-list"/);

  const one = render({ tweak: (cfg, d) => {
    quiet(cfg, d);
    d.speakers.media_02.state = 'playing';
  } });
  assert.equal(tabs(one), 0);
  assert.ok(!one.includes('class="now-list"'));
  assert.ok(one.includes('Kitchen speaker'), 'the only active speaker is shown directly');

  const none = render({ tweak: quiet });
  assert.equal(tabs(none), 0);
  assert.match(none, /class="card mini music"/);
  assert.match(none, /Nothing playing/);

  const noOverview = render({ tweak: (cfg) => edit.toggleMusicFlag(cfg, 'overview') });
  assert.equal(tabs(noOverview), count);
  assert.ok(!noOverview.includes('class="now-list"'));
});

test('with multi-speaker support off only the preferred speaker counts', () => {
  const { d, cfg } = setup({ tweak: (c) => {
    edit.toggleMusicFlag(c, 'multi');
    edit.setPreferredPlayer(c, 'media_02');
  } });
  assert.deepEqual(sessions(d, cfg), ['media_02']);
  assert.equal(canGroup(d, cfg), false);
  const html = render({ tweak: (c) => {
    edit.toggleMusicFlag(c, 'multi');
    edit.setPreferredPlayer(c, 'media_02');
  } });
  assert.equal(tabs(html), 0);
  assert.ok(!html.includes('data-action="music-group"'));
});

test('the selected target falls back when it stops, and nothing configured means no card', () => {
  const { d, cfg } = setup();
  assert.equal(selected(d, cfg, 'media_02'), 'media_02');
  musicCommands.stop(d, cfg, 'media_02');
  assert.notEqual(selected(d, cfg, 'media_02'), 'media_02');
  assert.ok(sessions(d, cfg).includes(selected(d, cfg, 'media_02')));
  edit.setPreferredPlayer(cfg, 'media_01');
  assert.equal(selected(d, cfg, 'no_such'), 'media_01');

  const empty = render({ tweak: (c) => {
    c.music.players = [];
  } });
  assert.ok(!empty.includes('class="card mini music"'), 'an unconfigured feature is hidden, not an error');
});

test('a managed speaker that does not exist is reported on the card and in the settings', () => {
  const tweak = (cfg) => cfg.music.players.push('media_99');
  assert.deepEqual(managed(setup({ tweak }).d, setup({ tweak }).cfg).missing, ['media_99']);
  assert.match(render({ tweak }), /Speaker not found: media-99/);
  const settings = render({ tweak, state: { settings: true } });
  assert.match(settings, /Entity not found/);
  assert.match(settings, /data-action="speakers-use" data-arg="media_99"/);
});

test('stopping one target leaves every other player as it was', () => {
  Object.keys(setup().d.speakers).forEach((id) => {
    const { d, cfg } = setup();
    const before = states(d);
    const t = target(d, cfg, id);
    const mine = [id, ...t.members];
    const ok = musicCommands.stop(d, cfg, id);
    assert.equal(ok, can({ ...d.speakers[id], state: before[id] }, 'stop'), id);
    Object.keys(before).filter((other) => !mine.includes(other)).forEach((other) => {
      assert.equal(d.speakers[other].state, before[other], `stopping ${id} changed ${other}`);
    });
    if (ok) assert.ok(!sessions(d, cfg).includes(id));
  });
});

test('stopping a group spares a member that plays something else', () => {
  const { d, cfg } = setup();
  d.speakers.media_03.titleKey = 'music.radio';
  musicCommands.stop(d, cfg, 'media_06');
  assert.equal(d.speakers.media_03.state, 'playing');
  assert.equal(d.speakers.media_04.state, 'off');
  assert.equal(d.speakers.media_06.state, 'off');
});

test('an unavailable speaker refuses every command and shows no controls', () => {
  const { d, cfg } = setup();
  const id = Object.keys(d.speakers).find((x) => d.speakers[x].state === 'unavailable');
  assert.ok(id);
  ['toggle', 'stop'].forEach((cmd) => assert.equal(musicCommands[cmd](d, cfg, id), false));
  assert.equal(musicCommands.setVolume(d, cfg, id, 50), false);
  assert.equal(d.speakers[id].state, 'unavailable');
  const html = render({ tweak: (c) => {
    c.music.players = [id];
  } });
  assert.match(html, /is unavailable/);
  assert.ok(!html.includes('data-input="volume"') && !html.includes('data-action="music" data-arg="toggle"'));
});

test('only controls the selected player supports are shown', () => {
  const { d } = setup();
  Object.keys(d.speakers).filter((id) => d.speakers[id].state !== 'unavailable').forEach((id) => {
    const html = render({ tweak: (c) => {
      c.music.players = [id];
    } });
    const card = html.slice(html.indexOf('class="card mini music"'));
    const music = card.slice(0, card.indexOf('</section>'));
    const p = d.speakers[id];
    [['prev', 'data-arg="prev"'], ['next', 'data-arg="next"'], ['play', 'data-arg="toggle"'], ['volume', 'data-input="volume"'], ['sound', 'data-arg="loudness"'], ['playlist', 'data-arg="playlist"']]
      .forEach(([feature, mark]) => assert.equal(music.includes(mark), p.features.includes(feature), `${id} ${feature}`));
    assert.equal(music.includes('data-arg="stop"'), p.features.includes('stop') && ['playing', 'paused'].includes(p.state), `${id} stop`);
  });
});

test('temporary groups take only speakers that report grouping, and never change a permanent group', () => {
  const { d, cfg } = setup();
  const options = groupable(d, cfg);
  const free = options.filter((o) => !o.reason).map((o) => o.id);
  const blocked = options.filter((o) => o.reason).map((o) => o.id);
  assert.ok(free.length >= 2 && blocked.length >= 1);
  free.forEach((id) => assert.ok(d.speakers[id].features.includes('group')));
  assert.ok(options.every((o) => d.speakers[o.id].kind === 'speaker'), 'a permanent group cannot join another group');
  assert.equal(canGroup(d, cfg), true);

  const permanent = JSON.stringify(cfg.music.members);
  assert.equal(musicCommands.group(d, cfg, [free[0]]), null, 'one speaker is not a group');
  assert.equal(musicCommands.group(d, cfg, [free[0], blocked[0]]), null, 'an unsupported speaker does not count');
  const before = states(d);
  const id = musicCommands.group(d, cfg, [...free, ...blocked]);
  assert.ok(id);
  assert.deepEqual(target(d, cfg, id).members, free);
  assert.equal(JSON.stringify(cfg.music.members), permanent);
  Object.keys(before).filter((x) => !free.includes(x)).forEach((x) => assert.equal(d.speakers[x].state, before[x], `grouping changed ${x}`));

  // One session for the group, none for its members, and nobody can join twice.
  const active = sessions(d, cfg);
  assert.ok(active.includes(id));
  free.forEach((m) => assert.ok(!active.includes(m)));
  assert.ok(groupable(d, cfg).filter((o) => free.includes(o.id)).every((o) => o.reason === 'grouped'));

  // Group volume reaches the members and nobody else.
  const volumes = Object.fromEntries(Object.keys(d.speakers).map((x) => [x, d.speakers[x].volume]));
  assert.equal(musicCommands.setVolume(d, cfg, id, 41), true);
  Object.keys(volumes).forEach((x) => assert.equal(d.speakers[x].volume, free.includes(x) ? 41 : volumes[x], x));

  assert.equal(musicCommands.dissolve(d, id), true);
  assert.equal(d.tempGroups.length, 0);
  assert.equal(d.speakers[free[0]].state, 'playing', 'the first speaker keeps playing');
  free.slice(1).forEach((m) => assert.equal(d.speakers[m].state, 'off'));
});

test('grouping is not offered when too few speakers support it', () => {
  const tweak = (cfg, d) => Object.keys(d.speakers).forEach((id) => {
    d.speakers[id].features = d.speakers[id].features.filter((f) => f !== 'group');
  });
  const { d, cfg } = setup({ tweak });
  assert.equal(canGroup(d, cfg), false);
  assert.ok(!render({ tweak }).includes('data-action="music-group"'));
  assert.match(render({ tweak, state: { grouping: true } }), /Fewer than two speakers/);
});

test('speakers take their room from the existing room configuration', () => {
  const { d, cfg } = setup();
  assert.deepEqual(playerRooms(d, cfg, 'media_02'), ['room_02']);
  assert.ok(playerRooms(d, cfg, 'media_06').length > 1, 'a group spans the rooms of its members');
  assert.ok(playingRooms(d, cfg).includes('room_02'));
  assert.ok(!playingRooms(d, cfg).includes('room_01'), 'a paused speaker is not playing');

  // Excluding the entity from its room, the way any entity is excluded, takes the speaker out of it.
  const moved = setup({ tweak: (c) => {
    edit.toggleEntity(c, 'room_02', 'media_02');
    edit.includeEntity(c, 'room_04', 'media_02');
  } });
  assert.deepEqual(playerRooms(moved.d, moved.cfg, 'media_02'), ['room_04']);

  const sheet = render({ state: { grouping: true } });
  assert.match(sheet, /data-action="music-pick-room"/);
  assert.match(sheet, /Cannot be grouped from here/);
});

test('the music settings survive export and import, and bad input falls back', () => {
  const { d, cfg } = setup();
  edit.renamePlayer(cfg, 'media_02', '  Cooking <b>radio</b>  ');
  edit.toggleMusicShow(cfg, 'artist');
  edit.togglePlayer(cfg, 'media_05');
  edit.setPreferredPlayer(cfg, 'media_02');
  edit.toggleGroupMember(cfg, 'media_06', 'media_02');
  assert.deepEqual(parseConfig(serializeConfig(cfg), d).music, cfg.music);
  assert.match(render({ tweak: (c) => edit.renamePlayer(c, 'media_02', '<b>x</b>') }), /&lt;b&gt;x&lt;\/b&gt;/);

  assert.equal(edit.setPreferredPlayer(cfg, 'media_05'), false, 'an unmanaged player cannot be preferred');
  edit.togglePlayer(cfg, 'media_02');
  assert.equal(cfg.music.preferred, null);

  const old = JSON.parse(serializeConfig(setup().cfg));
  delete old.music;
  assert.deepEqual(normalizeConfig(old, d).music, setup().cfg.music, 'a configuration from before this feature gets the defaults');
  const bad = normalizeConfig({ ...old, music: { players: ['media_01', 'Not An Id', 7], names: { media_01: 5, 'x y': 'n' }, preferred: 'media_09', show: ['artist', 'nonsense'], members: { media_06: ['media_06', 'media_03'] }, multi: 'no' } }, d).music;
  assert.deepEqual(bad.players, ['media_01']);
  assert.deepEqual(bad.names, { media_01: '5' });
  assert.equal(bad.preferred, null);
  assert.deepEqual(bad.show, MUSIC_SHOW.filter((k) => k === 'artist'));
  assert.deepEqual(bad.members, { media_06: ['media_03'] });
  assert.equal(bad.multi, true);
});

test('a locked tablet can look at other speakers but not control or group them', () => {
  const lock = { ...defaultLock(), enabled: true };
  assert.equal(isBlocked(lock, true, 'speaker-tab'), false);
  ['music', 'volume', 'music-group', 'music-pick', 'music-pick-room', 'music-group-start', 'music-dissolve', 'speakers-use', 'speakers-name'].forEach((name) => {
    assert.equal(isBlocked(lock, true, name), true, name);
  });
});

test('music screens render in both languages and every layout', () => {
  const grouped = (cfg, d) => musicCommands.group(d, cfg, ['media_07', 'media_08']);
  LANGS.forEach((lang) => LAYOUTS.forEach((layout) => {
    [{}, { grouping: true }, { settings: true }, { musicSel: 'temp_01' }, { grouping: true, musicPick: ['media_07'] }].forEach((state) => {
      [undefined, grouped, quiet].forEach((tweak) => {
        const html = render({ lang, tweak, state: { ...state, layout } });
        assert.ok(!/\[[a-z]+\.[\w.]+\]|undefined|NaN|\[object/.test(html), `${lang} ${layout} ${JSON.stringify(state)}`);
      });
    });
  }));
  const temp = render({ tweak: grouped, state: { musicSel: 'temp_01' } });
  assert.match(temp, /Group 1/);
  assert.match(temp, /data-action="music-dissolve" data-arg="temp_01"/);
  assert.match(temp, /Speakers: Bathroom speaker, Dining room speaker/);
});
