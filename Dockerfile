# Vertical Video Auto-Editor — production image with FFmpeg baked in.
# Works as-is on Railway, Render, Fly.io, or any Docker host.

# ---- deps: install node_modules once, cached by lockfile ----
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile the Next.js standalone server ----
FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime: slim image with ffmpeg + the standalone bundle ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Standalone server + static assets
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Runtime data the app reads from process.cwd(): brand configs + caption fonts,
# plus writable dirs for uploads and rendered output.
COPY --from=build /app/config ./config
RUN mkdir -p uploads output && chown -R node:node /app

USER node
EXPOSE 3000
CMD ["node", "server.js"]
