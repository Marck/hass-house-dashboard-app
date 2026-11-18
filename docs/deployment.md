# Deployment

Only the **early preview** is approved: the demo in the cluster, so the dashboard can be tested on the real tablet. The rest of Phase 3 waits for Phase 2.

## Early preview

| Part | Where | State |
|---|---|---|
| Image | `Containerfile` and `app/backend` here; published by the Image workflow to the GitHub container registry | Published 2026-11-16: public, amd64 and arm64 |
| Chart | `apps/house-dashboard` in the owner's Helm repository | Written, waiting for the owner's merge |
| Rollout | A merge there, synced by the cluster's GitOps tooling | Nothing is deployed |

The image runs the Node backend (`app/backend`), which serves the frontend and the demo data. In demo mode (the default) it refuses to start when any `HASS_` or `HOME_ASSISTANT_` setting is present. In live mode it reads Home Assistant, read-only (see below). It runs as a non-root user with a read-only root filesystem and writes nothing; the chart's `/tmp` `emptyDir` is harmless and kept. It listens on port 8080 and answers `/healthz` for probes. Since 2026-11-17 the preview signs people in itself with OIDC against authentik (`AUTH_MODE=oidc`); there is no forward-auth at the ingress any more. Its only outbound connections are DNS and authentik.

The chart runs it in its own namespace: Pod Security `restricted`, inbound from the ingress controller and the uptime monitor only, no egress, the image pinned by digest. Its test boots the pinned image the way the pod runs it.

To publish: Actions, Image, Run workflow. It builds for amd64 and arm64 and pushes the commit SHA and the channel name as tags. The package is public, so the cluster needs no pull secret. A new build is deployed by putting its digest in the chart.

Check it locally:

```bash
podman build -t dashboard:dev .
```

```bash
podman run --rm --read-only --read-only-tmpfs=false --user 101:101 -p 8080:8080 dashboard:dev
```

`--read-only-tmpfs=false` matters: without it podman adds writable `/run` and `/var/tmp` of its own, which a pod does not have.

Settings, About in the running dashboard shows the commit the image was built from.

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Listening port |
| `HOST` | all interfaces | Listening address; `127.0.0.1` for local development |
| `DASHBOARD_MODE` | `demo` | `demo`, or `live` to read Home Assistant. `live` needs `AUTH_MODE=oidc`, or `HOST=127.0.0.1` |
| `HASS_URL` | | Live: the http(s) address of Home Assistant, for example its Service inside the cluster. Never sent to the browser |
| `HASS_TOKEN_FILE` | | Live: file holding the long-lived token (a mounted Secret). Preferred over `HASS_TOKEN`; set exactly one. Re-read on every reconnect |
| `AUTH_MODE` | `none` | `oidc` turns on the backend's own sign-in; everything but `/healthz` then needs a session |
| `OIDC_ISSUER` | | Issuer URL of the identity provider, https only. For authentik: `https://<authentik host>/application/o/<slug>/` |
| `OIDC_CLIENT_ID` | | Client id of the provider |
| `OIDC_CLIENT_SECRET` | | Client secret; from a Secret, never in values |
| `PUBLIC_URL` | | The dashboard's own https URL; the redirect URI is `PUBLIC_URL/auth/callback` |
| `SESSION_HOURS` | `12` | Length of a person session |
| `DATA_DIR` | `/data` | The paired devices (`devices.json`) and the household's configuration (`config.json`). Needs a writable volume; losing it means pairing the tablets again and restoring the configuration from an export |

Any variable starting with `HASS_` or `HOME_ASSISTANT_` stops the demo from starting.

### Live mode: the Home Assistant user and token

1. In Home Assistant, Settings, People, add a person with "Can log in" on and "Administrator" off. A non-admin user is enough: listing floors, areas, devices and entities needs no admin rights (checked in the 2026.11.1 source).
2. Log in as that user, open its profile, Security, and create a long-lived access token. Copy it once; it is not shown again.
3. Seal it straight from the clipboard, so it never lands in a file or the shell history (macOS shown):

   ```bash
   pbpaste | tr -d '\n' | kubeseal --raw --controller-name sealed-secrets --controller-namespace kubeseal --scope namespace-wide --namespace <dashboard namespace>
   ```

4. Put the output in the chart's sealed Secret and mount it; point `HASS_TOKEN_FILE` at the mounted file.

The backend connects over Home Assistant's WebSocket API and can send only the authentication, a keep-alive ping and the four registry list commands (`READ` in `app/backend/ha.js`); anything else is refused before it is sent. Signed-in people and paired devices get the state at `/api/ha` and the registry at `/api/ha/registry`; Settings shows the state. The pod needs egress to the Home Assistant API port, and Home Assistant's namespace must admit the dashboard's.

For local development: `DASHBOARD_MODE=live HOST=127.0.0.1 HASS_URL=http://<address>:8123 HASS_TOKEN_FILE=<file outside the repo> node app/backend/main.js`.

In authentik, create an OAuth2/OpenID provider (confidential client, authorization code, redirect URI as above, scopes `openid profile`) and an application bound to the group that may use the dashboard. The pod needs egress to the identity provider.

## Intended design

For the live backend (stage 2). Decided on 2026-11-15, to be detailed and reviewed before any cluster change:

- A separate Deployment and Service, not a sidecar in the Home Assistant pod. The plan says the Home Assistant namespace; the preview showed that the Helm repository gives every chart its own default-deny namespace, so staying separate with one NetworkPolicy to the Home Assistant API port is the alternative. Open decision for the owner.
- Non-root, read-only root filesystem, no service account token.
- Reachable on the local network and through VPN only. Sign-in by the backend itself, with OIDC against the existing identity provider (decided 2026-11-17, replacing forward auth).
- A NetworkPolicy: only the ingress controller reaches the dashboard, and the dashboard reaches only DNS, the identity provider and the Home Assistant API port.
- The Home Assistant token lives in a Secret that only the backend reads. It is never sent to the browser and never committed.
- The user's configuration is stored by the backend on a small volume.

## What you will need then

- A Home Assistant long-lived access token for a dedicated user, created in Home Assistant and stored as a sealed Secret.
- An application and provider in the identity provider for the dashboard's host name.
- A host name and TLS certificate through the cluster's existing ingress setup.

## To verify before rollout

- That the cluster enforces NetworkPolicy.
- Whether Home Assistant runs with host networking. A policy does not protect such a pod, which changes the design.
- That the identity provider's login page works in Safari 15 on the iPad Air 2, and what session length suits a wall tablet.
- Rollback: the previous image tag and the previous configuration volume snapshot.
