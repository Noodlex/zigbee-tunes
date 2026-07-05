# syntax=docker/dockerfile:1.7
#
# Standalone Zigbee Tunes image (for `docker compose up` on any host).
# The HA Add-on has its own Dockerfile under addon/zigbee-tunes/Dockerfile.

# ---- Stage 1: build backend (TS -> JS) ----
FROM node:24-bookworm-slim AS backend-build

WORKDIR /app
RUN corepack enable

COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

COPY tsconfig.json ./
COPY src ./src
RUN yarn build

# ---- Stage 2: build UI (Vite -> static assets) ----
FROM node:24-bookworm-slim AS ui-build

# .git is not part of the build context, so Vite's `git rev-parse`
# fallback can't work here. Pass the SHA explicitly:
#   docker build --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) .
# (docker-compose.yml does this for you). Defaults to "unknown".
ARG COMMIT_SHA=unknown
ENV ZIGBEE_TUNES_COMMIT_SHA=${COMMIT_SHA}

WORKDIR /ui
RUN corepack enable

COPY ui/package.json ui/yarn.lock* ui/.yarnrc.yml* ./
RUN yarn install --immutable || yarn install

COPY ui/ ./
RUN yarn build

# ---- Stage 3: runtime ----
FROM node:24-bookworm-slim AS runtime

WORKDIR /app

RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Production deps only (Yarn 4 PnP-friendly: `workspaces focus --production`
# falls back to a regular install if the project isn't a workspace).
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn workspaces focus --production 2>/dev/null || yarn install --immutable

COPY --from=backend-build /app/dist ./dist
COPY --from=backend-build /app/src/db/schema.sql ./dist/db/schema.sql
COPY --from=ui-build /ui/dist ./ui/dist

ENV NODE_ENV=production
ENV ZIGBEE_TUNES_CONFIG=/config/config.yaml

VOLUME ["/config", "/data"]
EXPOSE 8099

ENTRYPOINT ["tini", "--"]
CMD ["node", "dist/index.js"]
