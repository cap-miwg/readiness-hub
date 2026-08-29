# Readiness Hub v2. Build context is the repo root.

FROM node:22-alpine AS web-build
ARG APP_VERSION=2.0.0-dev
ENV VITE_APP_VERSION=$APP_VERSION
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
# The shared contracts type-import from server/src/domain, so the web
# typecheck needs the full server source tree (types only; nothing is bundled).
COPY server/src /build/server/src
COPY web/ ./
RUN npm run build

FROM node:22-alpine AS server-build
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=server-build /build/server/node_modules ./node_modules
COPY --from=server-build /build/server/dist ./dist
COPY --from=server-build /build/server/migrations ./migrations
COPY --from=server-build /build/server/package.json ./package.json
COPY --from=web-build /build/web/dist ./public
USER app
EXPOSE 8080
CMD ["node", "dist/index.js"]
