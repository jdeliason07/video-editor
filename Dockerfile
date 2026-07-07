# Vertical Video Auto-Editor — production image.
# Bundles FFmpeg (rendering) and Python + faster-whisper + a pre-downloaded
# Whisper model (podcast transcription), so it runs as-is on any Docker host.

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

# ---- runtime: ffmpeg + python/whisper + the standalone bundle ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HF_HOME=/app/.hfcache \
    WHISPER_MODEL=base.en

# System deps: ffmpeg for rendering, python3 + pip for transcription.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Local Whisper transcription stack (CPU, no torch). PEP 668 marks the system
# Python as externally managed, so allow the install explicitly.
RUN pip3 install --no-cache-dir --break-system-packages faster-whisper==1.2.1

# Pre-download the Whisper model at build time so the running container needs
# no network and the first transcription doesn't stall on a download.
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('base.en', device='cpu', compute_type='int8')"

# Standalone server + static assets
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Runtime data read from process.cwd(): brand configs, caption fonts, and the
# Python transcription script (not traced by the Next bundler, so copy it).
COPY --from=build /app/config ./config
COPY --from=build /app/lib/transcribe ./lib/transcribe
RUN mkdir -p uploads output && chown -R node:node /app

USER node
EXPOSE 3000
CMD ["node", "server.js"]
