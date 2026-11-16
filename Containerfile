# Preview image: the dashboard's static files behind an unprivileged nginx.
# It serves the demo (synthetic data). There is no backend and no token in it.
#
#   podman build -t dashboard:dev --build-arg GIT_SHA="$(git rev-parse HEAD)" .
#   podman run --rm --read-only --tmpfs /tmp -p 8080:8080 dashboard:dev

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
# The base image runs as user 101 and listens on 8080. Its only writable path is /tmp.
FROM docker.io/nginxinc/nginx-unprivileged:stable-alpine@sha256:f5116ed4606f3eb015dd4a8e28cb9b351476dc0ad4bc6e9f93b19cec130cdf03
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=info /src/app/frontend /usr/share/nginx/html
USER 101
EXPOSE 8080
