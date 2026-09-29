# Audit worker image. Build from the repository root (the worker depends on
# the @cro/shared workspace):
#
#   docker build -f apps/worker/Dockerfile -t cro-worker .
#
# The base image ships Chromium and every system library it needs, so a
# missing browser install cannot happen. Its tag must match the
# playwright-core version in apps/worker/package.json.
ARG PLAYWRIGHT_VERSION=1.62.1

FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN npm ci -w @cro/shared -w @cro/worker --include-workspace-root
COPY packages/shared packages/shared
COPY apps/worker apps/worker
RUN npm run build -w @cro/shared && npm run build -w @cro/worker

FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
RUN npm ci -w @cro/shared -w @cro/worker --omit=dev && npm cache clean --force
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/worker/dist apps/worker/dist

# The base image provides the unprivileged user "pwuser".
USER pwuser
WORKDIR /app/apps/worker
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
