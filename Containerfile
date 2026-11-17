# The dashboard: the Node backend serving the frontend. Phase 2 step 1 has the
# demo mode only, so the image holds synthetic data and no way to reach Home Assistant.
#
#   podman build -t dashboard:dev --build-arg GIT_SHA="$(git rev-parse HEAD)" .
#   podman run --rm --read-only -p 8080:8080 dashboard:dev

# Stage 1 records which commit this is. It runs on the build machine's own
# architecture; its output is plain files, so nothing has to be emulated.
FROM --platform=$BUILDPLATFORM docker.io/library/node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS info
WORKDIR /src
COPY package.json ./
COPY scripts/build-info.mjs scripts/
COPY app/frontend app/frontend
ARG GIT_SHA=""
ARG GIT_TAG=""
ARG GIT_MODIFIED="false"
ARG BUILD_CHANNEL="preview"
ARG BUILT_ON=""
RUN GIT_SHA="$GIT_SHA" GIT_TAG="$GIT_TAG" GIT_MODIFIED="$GIT_MODIFIED" BUILD_CHANNEL="$BUILD_CHANNEL" BUILT_ON="$BUILT_ON" \
    node scripts/build-info.mjs

# Stage 2 has no RUN step, so it builds for every architecture without emulation.
# The backend has no dependencies outside Node itself, so there is no npm install.
# It writes nothing, so the root filesystem can be read-only. User 101 matches the
# chart's securityContext; it only needs to read the files.
FROM docker.io/library/node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
WORKDIR /app
COPY app/backend backend
COPY --from=info /src/app/frontend frontend
ENV NODE_ENV=production PORT=8080 DASHBOARD_MODE=demo
USER 101:101
EXPOSE 8080
CMD ["node", "backend/main.js"]
