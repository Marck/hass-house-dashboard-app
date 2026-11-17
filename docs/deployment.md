# Deployment

Only the **early preview** is approved: the demo in the cluster, so the dashboard can be tested on the real tablet. The rest of Phase 3 waits for Phase 2.

## Early preview

| Part | Where | State |
|---|---|---|
| Image | `Containerfile` and `app/backend` here; published by the Image workflow to the GitHub container registry | Published 2026-11-16: public, amd64 and arm64 |
| Chart | `apps/house-dashboard` in the owner's Helm repository | Written, waiting for the owner's merge |
| Rollout | A merge there, synced by the cluster's GitOps tooling | Nothing is deployed |

The image runs the Node backend (`app/backend`), which serves the frontend and the demo data. In this phase it runs in demo mode only: it has no Home Assistant code and refuses to start when any `HASS_` or `HOME_ASSISTANT_` setting is present. It runs as a non-root user with a read-only root filesystem and writes nothing; the chart's `/tmp` `emptyDir` is harmless and kept. It listens on port 8080 and answers `/healthz` for probes. Authentication is not in the image: the ingress sends every request through the identity provider.

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

## Intended design

For the live backend (stage 2). Decided on 2026-11-15, to be detailed and reviewed before any cluster change:

- A separate Deployment and Service, not a sidecar in the Home Assistant pod. The plan says the Home Assistant namespace; the preview showed that the Helm repository gives every chart its own default-deny namespace, so staying separate with one NetworkPolicy to the Home Assistant API port is the alternative. Open decision for the owner.
- Non-root, read-only root filesystem, no service account token.
- Reachable on the local network and through VPN only, behind the existing identity provider with forward auth at the ingress.
- A NetworkPolicy: only the ingress controller reaches the dashboard, and the dashboard reaches only the Home Assistant API port.
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
