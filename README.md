# Home Assistant house dashboard

A custom dashboard for Home Assistant: a whole-home overview with an interactive floor plan, a room detail sheet, an energy screen and a network screen. English and Dutch, light and dark.

**Status: Phase 1 is done, Phase 2 is next.** The UI is complete and runs on synthetic demo data. It does not connect to Home Assistant yet.

## Features

- **Home:** people, status chips, a floor plan per floor with lights, motion, doors and warnings, and cards for lights and climate, music, irrigation and the evening.
- **Room sheet:** climate with a target temperature for AC and heating, lights, motion history, switches.
- **Energy:** property overview, battery, daily balance, consumption, and an optional EV charging card.
- **Network:** a map with All, UniFi and Zigbee views, device details and uplink diagnostics.
- **Yours to arrange:** floors, rooms, the areas and entities behind each room, and the cards on every screen, all from the UI.
- **Built for a wall tablet:** works on an iPad Air 2 (Safari 15), a phone layout without the large artwork, and a desktop layout.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Mocked UI on synthetic data | Done |
| 2 | Live Home Assistant through a small backend, run locally | Approved, next |
| 3 | Deployment on Kubernetes | Early preview of the demo only; the rest needs Phase 2 |

Requirements, decisions and the approval log are in [PROJECT_PLAN.md](PROJECT_PLAN.md).

## Requirements

| To | You need |
|---|---|
| Run the dashboard | Any static file server. The example below uses [uv](https://docs.astral.sh/uv/) |
| Run the checks | podman or docker, or Node 26 |
| Use it | Safari 15 or newer, or a current Chrome, Edge or Firefox |

No account, API key or token is needed in Phase 1.

## Run it locally

There is no build step and there are no runtime dependencies. Serve `app/frontend`:

```bash
uv run --no-project scripts/serve.py
```

Then open <http://localhost:4173>. The script also prints an address for a tablet or phone on the same network; see [docs/device-testing.md](docs/device-testing.md). Add `--local` to keep it on your own machine. The demo holds no real data.

## Using the dashboard

| Where | What it does |
|---|---|
| Language button, top right | Switches between EN and NL at once |
| Theme button | Manual, Automatic (dark while the sun is down) or Off |
| Edit layout, left of the language button | Move, remove and restore cards; reset the layout; open the data sources |
| Edit, in the floor plan card | Add, rename, reorder and remove floors and rooms; move rooms between floors |
| Room settings, in a room | Name, floor, linked Home Assistant areas, and which entities the room shows |
| Settings, the gear at the top right | Child lock, the optional EV charging card with an entity per statistic, the UniFi and Zigbee network sources, export and import, diagnostics, and the version and commit that is running |
| Lock, shown while the child lock is on | Press and hold for 3 seconds, or enter the PIN, to unlock |

Rules the UI follows:

- An element with no entity configured is hidden. That is not an error.
- A configured entity that does not exist shows "Entity not found" with its ID.
- All configuration happens in the UI. There is no YAML or file editing. Export and import cover backup and moving to another device.

In Phase 1 the configuration is stored in the browser (`localStorage`), per device.

The child lock is for a wall tablet within reach of small children. It belongs to the device, blocks controls at a level you choose, and locks again by itself. It guards against accidents; it is not a security feature.

## Verify

```bash
scripts/verify.sh
```

This runs ESLint, Stylelint, the unit tests and the privacy check in a container (podman by default, `ENGINE=docker` for docker). With Node 26 installed, `npm ci && npm run verify` does the same. Details are in [docs/testing.md](docs/testing.md).

CI runs the same command on every pull request and on manual dispatch.

## Project layout

```text
app/frontend/        the dashboard: index.html, css/, js/ (no build step)
  js/fixtures/       synthetic demo data
  js/config.js       the user's configuration and every edit operation
  js/model.js        pure helpers between data, configuration and views
  js/views/          one string renderer per screen or sheet
tests/unit/          unit tests, run with node --test
scripts/             verify.sh and the privacy check
docs/                architecture, design system, testing, deployment, privacy
```

## Deploy on Kubernetes

Only the early preview exists: the demo as a container image, with a chart in the owner's Helm repository, for testing on the real tablet. The image, how to run it with podman and the intended design for the live version are in [docs/deployment.md](docs/deployment.md).

## Contributing

1. Branch from `main` and keep the change small.
2. Run `scripts/verify.sh` until it passes.
3. Read your diff against [docs/security-and-privacy.md](docs/security-and-privacy.md): synthetic labels and generated ids only.
4. Open a pull request. CI runs the same checks.

New UI text goes into both `js/i18n/en.js` and `js/i18n/nl.js`; a test fails when they differ.

## Documentation

- [Architecture](docs/architecture.md)
- [Design system](docs/design-system.md)
- [Testing](docs/testing.md)
- [Testing on a real tablet or phone](docs/device-testing.md)
- [Deployment](docs/deployment.md)
- [Security and privacy](docs/security-and-privacy.md)

## Credits

The layout and the idea come from the dashboard that Reddit user [Dry_Eggplant6329](https://www.reddit.com/user/Dry_Eggplant6329) ([superlab-by-supbrt](https://github.com/superlab-by-supbrt) on GitHub) presented in [I will present my dashboard](https://www.reddit.com/r/homeassistant/comments/1xkaysg/i_will_present_my_dashboard/) on r/homeassistant. Thank you for the inspiration. This project is an independent implementation: it contains none of that dashboard's code, images or data.

## Privacy

This repository is public. It contains synthetic labels and generated ids only: no real floor plan, names, addresses, entity ids or credentials. Read [docs/security-and-privacy.md](docs/security-and-privacy.md) before contributing.

## License

[MIT](LICENSE), copyright the hass-house-dashboard-app contributors.
