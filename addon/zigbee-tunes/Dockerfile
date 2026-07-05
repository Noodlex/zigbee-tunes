# syntax=docker/dockerfile:1.7
#
# Home Assistant Add-on build.
#
# Two design notes that bit us in v0.1.0:
#
# 1) The HA Supervisor sets the Docker build context to THIS folder
#    (addon/zigbee-tunes/), not the repo root. So we cannot `COPY` files
#    from src/, ui/, package.json, etc. — those live one level up. We work
#    around this by cloning the Zigbee Tunes source from GitHub inside the
#    build, the same pattern Z2M's own add-on uses.
#
# 2) HA Supervisor 2026.x ignores our build.yaml's `build_from` and
#    forces ghcr.io/home-assistant/base:latest (Alpine) as BUILD_FROM.
#    That base has no Node.js. We bypass that entirely by hard-coding
#    `FROM node:24-bookworm-slim` — Docker pulls the right arch variant
#    from the multi-arch manifest, so amd64 + aarch64 work.

# ---- Stage 1: fetch source ----
FROM node:24-bookworm-slim AS source
ARG ZIGBEE_TUNES_REF=main
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Cache buster: BuildKit revalidates this ADD on every build, and the
# response body changes whenever `main` advances. That invalidates every
# layer below (including `git clone`), so a fresh push always produces a
# fresh image. Without this, BuildKit happily reuses the cloned snapshot
# from the previous build — exactly the bug that made 0.2.0 "install"
# without actually shipping new code.
# We use the public atom feed rather than api.github.com: the API is
# rate-limited to 60 unauthenticated requests/hour per IP, and a 403 there
# would fail the whole build.
ADD https://github.com/Noodlex/zigbee-tunes/commits/${ZIGBEE_TUNES_REF}.atom /tmp/source-revision.atom

RUN git clone --depth 1 --branch ${ZIGBEE_TUNES_REF} \
      https://github.com/Noodlex/zigbee-tunes /src \
  && git -C /src rev-parse --short HEAD > /src/.commit-sha \
  && rm -rf /src/.git

# ---- Stage 2: build backend (TS -> JS) ----
FROM node:24-bookworm-slim AS backend-build
WORKDIR /app
RUN corepack enable
COPY --from=source /src/package.json /src/yarn.lock /src/.yarnrc.yml ./
RUN yarn install --immutable
COPY --from=source /src/tsconfig.json ./
COPY --from=source /src/src ./src
RUN yarn build

# ---- Stage 3: build UI (Vite -> static) ----
FROM node:24-bookworm-slim AS ui-build
WORKDIR /ui
RUN corepack enable
COPY --from=source /src/ui ./
COPY --from=source /src/.commit-sha /commit-sha
RUN yarn install --immutable || yarn install
RUN ZIGBEE_TUNES_COMMIT_SHA="$(cat /commit-sha)" yarn build

# ---- Stage 4: runtime ----
FROM node:24-bookworm-slim AS runtime
WORKDIR /app

ARG BASHIO_VERSION=v0.16.2
RUN corepack enable \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
       tini jq curl bash ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL "https://github.com/hassio-addons/bashio/archive/refs/tags/${BASHIO_VERSION}.tar.gz" \
       | tar -xz -C /tmp \
  && mv "/tmp/bashio-${BASHIO_VERSION#v}/lib" /usr/lib/bashio \
  && ln -sf /usr/lib/bashio/bashio /usr/bin/bashio \
  && rm -rf /tmp/bashio-*

# Production deps only.
COPY --from=source /src/package.json /src/yarn.lock /src/.yarnrc.yml ./
RUN yarn workspaces focus --production 2>/dev/null || yarn install --immutable

# Built artifacts.
COPY --from=backend-build /app/dist ./dist
COPY --from=source /src/src/db/schema.sql ./dist/db/schema.sql
COPY --from=ui-build /ui/dist ./ui/dist

# Add-on glue (these files ARE in the build context).
COPY run.sh /run.sh
COPY config.template.yaml /etc/zigbee-tunes/config.template.yaml
RUN chmod +x /run.sh

ENV NODE_ENV=production
ENV ZIGBEE_TUNES_CONFIG=/tmp/zigbee-tunes.config.yaml

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/run.sh"]

LABEL \
  io.hass.name="Zigbee Tunes" \
  io.hass.description="Z2M Discovery Manager" \
  io.hass.type="addon" \
  io.hass.version="1.0.0" \
  io.hass.arch="amd64|aarch64" \
  maintainer="Noodlex <14205390+Noodlex@users.noreply.github.com>"
