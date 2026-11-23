# Testing

## Run

```bash
scripts/verify.sh
```

Runs in a container, the same way CI does. CI runs on every pull request and on manual dispatch.

| Step | Command | What it checks |
|---|---|---|
| JavaScript lint | `npm run lint:js` | ESLint, ES2021 syntax ceiling, browser APIs against Safari 15 |
| CSS lint | `npm run lint:css` | Stylelint, CSS features against Safari 15 |
| Unit tests | `npm test` | See below |
| Privacy | `npm run privacy` | No addresses, credentials, private host names or em dashes in any file |

## Unit tests

The views are string renderers, so the tests render the whole UI in Node.

| File | Covers |
|---|---|
| `i18n.test.js` | English and Dutch have the same keys and placeholders; no German left; every screen, sheet, menu and edit mode renders in both languages and all three layouts with no missing key, no broken value and no inline style |
| `config.test.js` | Defaults; malformed or hostile input always becomes a valid configuration; every edit operation; a floor is removed only when empty; export and import round trip; the "Attic" acceptance scenario |
| `model.test.js` | Theme resolver; entities through areas and devices; inclusion, exclusion and missing references; heating target control; network views and the shared coordinator; EV statistics and unit conversion |
| `layout.test.js` | The generated floor plan and the network map never overlap, including 200 random floors |
| `render.test.js` | No artwork on phones; button positions; "not configured is hidden, missing is an error"; card editing; network sources; typed names are escaped; every action the views emit has a handler |
| `contrast.test.js` | WCAG AA contrast of text pairs in both themes |
| `lock.test.js` | Child lock: what each level blocks, unknown actions are blocked, every action the app emits is classified, PIN handling, the locked top bar, the lock is not in the exported configuration; diagnostics; build information |

For checks on a real device, see [device-testing.md](device-testing.md).

## Music with several speakers, 2026-11-16

`scripts/verify.sh`: lint clean, 75 of 75 tests pass, privacy check passes.

Mock only, on synthetic speakers. Covered by unit tests: a playing group stands for its members unless a member plays something else; several active targets get tabs or, when chosen in the settings, a list, never both; stopping or grouping one target changes no other player (checked for every speaker and group); only supported controls are rendered; temporary groups accept only speakers with the grouping capability and never touch a permanent group; rooms come from the existing room configuration; the settings survive export and import; the child lock allows looking and blocks control.

Checked in a browser at 1440x1000, 1024x768 dark and 390x844, in English and Dutch: switching tabs, stopping a speaker and a group, the card falling back to one speaker, making and dissolving a temporary group, group volume, the room status on the floor plan, and the settings (rename, unmanage, group members, preferred speaker, hidden artist). No horizontal overflow, no control under 40 px.

Not tested: real speakers, Home Assistant, the iPad Air 2 and iPhone 13. Three facts about Home Assistant that shape the feature were read in its source and are recorded in plan section 2.12; none was tried against a running instance.

## Wall tablet readiness, 2026-11-16

`scripts/verify.sh`: lint clean, 60 of 60 tests pass, privacy check passes.

Checked by hand in the desktop app's built-in browser at 1024 x 768, served by `scripts/serve.py`:

| Check | Result |
|---|---|
| Settings opens from the gear; About shows version, commit, "with changes on top" and the build date | Pass |
| Diagnostics: ten checks, all pass in this browser | Pass |
| Lock now: back to Home, only the lock in the top bar, a light does not toggle, the settings address is refused | Pass |
| Hold: released after 1.2 seconds stays locked, held for 3 seconds unlocks | Pass |
| PIN: two digits refused when setting, the digits are not in storage, a wrong PIN is refused, the right one unlocks | Pass |
| Automatic lock after the 1 minute setting | Pass |
| A thrown script error appears as a red bar | Pass |
| The test server sends `Cache-Control: no-store` and live build information | Pass |

Hold was tested with synthetic pointer events, not with a finger on glass.

## Phase 1 test report, 2026-11-15

`scripts/verify.sh`: lint clean, 46 of 46 tests pass, privacy check passes.

Checked by hand in the desktop app's built-in browser (Chromium), with emulated viewports:

| Viewport | Theme, language | Checked | Result |
|---|---|---|---|
| 1440 x 1000 | Light, Dutch | All screens, room sheet, room settings, data sources, EV card, three network views, floors and rooms editor, card editing | Pass |
| 1024 x 768 | Dark, Dutch | Home, floor plan, editor | Pass |
| 768 x 1024 | Light, Dutch and English | Home, top bar, add a floor named "Attic" with a room linked to an area, reload, move a room between floors, card reorder, remove, restore and reset, network with one source and with none, export and import, keyboard focus trap and Escape | Pass, after fixing a top bar overflow found here |
| 390 x 844 | Light, Dutch | Home, network, room settings; no artwork rendered, no sideways scroll | Pass |

No console or Content-Security-Policy errors in any of these.

## Not tested

- A real iPad Air 2 or iPhone 13. Everything above is an emulated viewport on a desktop.
- Safari 15 itself. Compatibility is enforced by lint rules, not by running that browser.
- Touch input, and a screen reader.
- Performance on old hardware.

These belong to the device checks in the plan and need the hardware.

## Read-only integration acceptance

Status 2026-11-23. "Mocked" is the automated suite against the fake Home Assistant; "real" is the live instance, read-only. There is no separate development instance, so a real check reads the house.

| Case | Mocked | Real instance |
|---|---|---|
| Authentication failure | Tested: a refused token is reported, retried after 5 minutes, never logged | Not tested |
| Missing or unavailable entities | Tested: shown as unavailable; a configured entity that does not exist is reported | Not tested |
| WebSocket disconnect and reconnect | Tested: reconnect with backoff, registry and every state sent again | Seen once in the preview's log (lost, then connected); the resync itself not observed |
| Registry changes | Tested: a registry event reloads the registry once per burst and sends every state again; a renamed area appeared in a browser without a reload (2026-11-23) | Not tested |
| Stale configuration writes | Tested: a save based on an older revision is refused with the current state | Reported: browser check against the real backend (progress log, 2026-11-18 to 22) |
| Session revocation | Tested: a removed device is refused at once, and its open live stream ends (#35) | Not tested |
| Unauthorized requests | Tested: every API path without a session answers 401; a device cannot write the configuration or manage devices | Not tested |
| Several devices in sync | Tested: first sign-in moves the browser's configuration once, a device only reads, the next check brings another device's save, a stale save is refused and shown, saves go one at a time and the last wins (`sync.test.js`) | Reported: a fresh browser showed the stored configuration; not on the real devices |

No device command exists in the code, so none of these checks can switch anything.

## Device and theme acceptance

Status 2026-11-23. Nothing below has been run on a real device. Emulated viewports and lint rules do not count as device evidence.

| Area | iPad Air 2, Safari 15 | iPhone 13 | Desktop |
|---|---|---|---|
| OIDC sign-in and cookie after a Safari restart | Opened after login once (2026-11-16, reported); persistence not tested | Not tested | Reported working in the browser |
| Pairing after a Safari restart and after 7 days | Not tested | n/a | n/a |
| Live updates and reconnect | Not tested | Not tested | Fake Home Assistant only |
| Floor plan, touch, scrolling, sheets | Not tested | Not tested | Emulated viewports only |
| Memory and performance over an hour | Not tested | Not tested | Not tested |
| Light and dark on every screen | Not tested | Not tested | Emulated, mock data (2026-11-15); not with live data |

Theme facts:

- Contrast: WCAG AA for the text pairs of both themes is a unit test and passes.
- Manual choice: stored on the device; not yet checked on a device after a reload or a Safari restart.
- Automatic follows the sun state, as the plan defines it (2.5), not the system's light or dark setting. In live mode it follows Home Assistant's sun entity; anything but up or down keeps the light theme. Checked in a browser against the fake Home Assistant (dark while down, light after it rises, 2026-11-23); not on a device.
- The live frontend was not compared screen by screen with the mock design in the dark theme.
