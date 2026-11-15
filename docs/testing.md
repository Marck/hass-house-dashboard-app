# Testing

## Run

```bash
scripts/verify.sh
```

Runs in a container, the same way CI does:

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
