#!/bin/sh
# Runs lint, tests and the privacy check exactly as CI does, in a container.
# Usage: scripts/verify.sh   (needs podman; set ENGINE=docker to use docker)
set -eu

ENGINE="${ENGINE:-podman}"
IMAGE="docker.io/library/node:$(cat "$(dirname "$0")/../.node-version")-alpine"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

exec "$ENGINE" run --rm -v "$ROOT":/work -w /work "$IMAGE" sh -c 'npm ci --no-audit --no-fund --loglevel=error && npm run --silent verify'
