# Multi-stage build for any app/package in this pnpm workspace.
# Usage: docker build --build-arg APP_PATH=apps/api-server -t ratify/api-server .
FROM node:22-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
RUN pnpm -r --filter=./packages/* run build && pnpm -r --filter=./apps/* run build

FROM node:22-slim AS runtime
ARG APP_PATH
ENV NODE_ENV=production
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps ./apps
WORKDIR /repo/${APP_PATH}
CMD ["node", "dist/index.js"]
