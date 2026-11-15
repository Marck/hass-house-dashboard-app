# Home Assistant house dashboard

A custom dashboard for Home Assistant: a whole-home overview with an interactive floor plan, a room detail sheet, an energy screen and a network screen. English and Dutch, light and dark.

**Status: Phase 1.** The UI is complete and runs on synthetic demo data. It does not connect to Home Assistant yet. The roadmap and the approval gates are in [PROJECT_PLAN.md](PROJECT_PLAN.md).

## Run it locally

There is no build step and there are no runtime dependencies. Serve `app/frontend` with any static file server, for example with [uv](https://docs.astral.sh/uv/):

```bash
uv run --no-project python -m http.server 4173 --bind 127.0.0.1 --directory app/frontend
```

Then open <http://localhost:4173>. Nothing else is needed in Phase 1: no account, no API key, no token.

## Using the dashboard

| Where | What it does |
|---|---|
| Language button, top right | Switches between EN and NL at once |
| Theme button | Manual, Automatic (dark while the sun is down) or Off |
| Edit layout, left of the language button | Move, remove and restore cards; reset the layout; open the data sources |
| Edit, in the floor plan card | Add, rename, reorder and remove floors and rooms; move rooms between floors |
| Room settings, in a room | Name, floor, linked Home Assistant areas, and which entities the room shows |
| Data sources | Optional EV charging card with an entity per statistic, the UniFi and Zigbee network sources, export and import |

Rules the UI follows:

- An element with no entity configured is hidden. That is not an error.
- A configured entity that does not exist shows "Entity not found" with its ID.
- All configuration happens in the UI. There is no YAML or file editing. Export and import cover backup and moving to another device.

In Phase 1 the configuration is stored in the browser (`localStorage`), per device.

## Verify

```bash
scripts/verify.sh
```

This runs ESLint, Stylelint, the unit tests and the privacy check in a container (podman by default, `ENGINE=docker` for docker). With Node 26 installed, `npm ci && npm run verify` does the same. Details are in [docs/testing.md](docs/testing.md).

CI runs the same command, only for Renovate branches and on manual dispatch.

## Deploy on Kubernetes

Not available yet. Deployment is Phase 3 and needs Phase 2 first; the intended design is in [docs/deployment.md](docs/deployment.md).

## Documentation

- [Architecture](docs/architecture.md)
- [Design system](docs/design-system.md)
- [Testing](docs/testing.md)
- [Deployment](docs/deployment.md)
- [Security and privacy](docs/security-and-privacy.md)

## Privacy

This repository is public. It contains synthetic labels and generated ids only: no real floor plan, names, addresses, entity ids or credentials. Read [docs/security-and-privacy.md](docs/security-and-privacy.md) before contributing.

## License

[MIT](LICENSE)
