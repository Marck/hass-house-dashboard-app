# Deployment

Only the **early preview** is approved: the demo in the cluster, so the dashboard can be tested on the real tablet. The rest of Phase 3 waits for Phase 2.

## Early preview

| Part | Where | State |
|---|---|---|
| Image | `Containerfile` and `deploy/nginx.conf` here; published by the Image workflow to the GitHub container registry | Builds and runs locally; first publish pending |
| Chart | The owner's Helm repository | Not written yet |
| Rollout | A merge there, synced by the cluster's GitOps tooling | Nothing is deployed |

The image holds the static files and the demo data. It has no backend and no token. It runs as a non-root user with a read-only root filesystem; `/tmp` is its only writable path, so the pod needs an `emptyDir` there. It listens on port 8080 and answers `/healthz` for probes. Authentication is not in the image: the ingress sends every request through the identity provider.

To publish: Actions, Image, Run workflow. It builds for amd64 and arm64 and pushes the commit SHA and the channel name as tags. A new package in the registry is private; make it public (the repository is) or give the cluster a pull secret.

Check it locally:

```bash
podman build -t dashboard:dev .
podman run --rm --read-only --tmpfs /tmp -p 8080:8080 dashboard:dev
```

Settings, About in the running dashboard shows the commit the image was built from.

## Intended design

Decided on 2026-11-15, to be detailed and reviewed before any cluster change:

- A separate Deployment and Service in the Home Assistant namespace, not a sidecar in the Home Assistant pod.
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
