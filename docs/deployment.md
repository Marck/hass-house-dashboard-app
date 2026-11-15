# Deployment

**Nothing is deployable yet.** Phase 1 is a static mock. Deployment is Phase 3 and starts only after Phase 2 is approved and done. There is no container image and no Helm chart in this repository so far.

To look at the dashboard today, run it locally as described in the [README](../README.md).

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
