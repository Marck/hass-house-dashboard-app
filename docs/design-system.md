# Design system

All values live in `app/frontend/css/tokens.css`; components are in `app/frontend/css/app.css`.

## Tokens

| Group | Tokens | Use |
|---|---|---|
| Surfaces | `--bg`, `--surface`, `--tile`, `--raised` | Page, cards, tiles inside cards, controls and menus |
| Text | `--text`, `--text-2`, `--text-3` | Primary, secondary, muted |
| Lines | `--line`, `--line-strong` | Dividers, control borders |
| Accents | `--teal`, `--blue`, `--amber`, `--orange`, `--purple`, `--red` | Each with `-fill` (shapes) and `-soft` (tinted background) |
| Shape | `--r-card`, `--r-tile`, `--r-pill` | 28 px, 18 px, pill |
| Type | `--font`, `--mono` | System fonts only; ids are shown in mono |

Meaning of the accents: teal is healthy or active, amber is light and warnings, orange needs attention, blue is doors and wired links, purple is motion and Zigbee, red is offline.

## Themes

Light and dark define the same tokens. The theme has three modes: Manual (your choice), Automatic (dark only while the sun is known to be down, otherwise light) and Off (always light).

## Layouts

| Layout | When | Artwork |
|---|---|---|
| Phone | Up to 699 px wide, or up to 499 px high | None. Room list, flow tiles and device list instead |
| Tablet | 700 to 1099 px | Floor plan, property illustration, network map |
| Desktop | From 1100 px | The same, with wider grids |

Below 900 px the top bar keeps its icons and drops secondary labels.

## Components

Card, tile, chip, button (default, solid, gold, dashed, danger), icon button, segmented control, toggle, range, text field, select, banner, sheet, menu, toast. Buttons, fields and list rows are at least 44 px high; a toggle is 62 x 36 px.

Editing patterns:

- A destructive action needs a second tap on the same button.
- Reordering uses move buttons. Nothing depends on dragging.
- A missing reference uses the dashed amber tile with the id in mono.

## Icons and artwork

Icons are inline 24 px stroke SVG in `js/icons.js`. The floor plan, the property illustration and the network map are generated SVG and positioned HTML. They are schematic and do not depict a real building or network.

## Accessibility

- Text pairs meet WCAG AA (4.5:1) in both themes; `tests/unit/contrast.test.js` checks them.
- Visible focus ring, focus trap and Escape in sheets, focus returns to the control that opened a sheet.
- State is never shown by colour alone: labels, icons or line styles carry it too.
- Animation is limited to the energy flow and stops with reduced motion.

Known gap: white icons on accent fills (for example the mode icon on a climate card) are below 3:1 in places. They always sit next to a text label, so they are not the only carrier of meaning.

## Browser support

Safari 15 is the floor, because the iPad Air 2 ends at iPadOS 15.8. No CSS nesting, `:has()`, container queries or range media syntax, and ES2021 syntax at most. Lint enforces this against `.browserslistrc`.
