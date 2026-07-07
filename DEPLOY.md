# Deploying the Vertical Video Auto-Editor

This app needs a **persistent server with FFmpeg, local disk, and
long-running requests** — that's why it ships as a Docker image (FFmpeg is
baked in) rather than targeting serverless platforms.

> **Why not Vercel?** Vercel runs Next.js as short-lived serverless
> functions: no FFmpeg binary, a ~4.5 MB request body cap (phone videos are
> far larger), execution time limits shorter than a typical render, and no
> shared disk between invocations for the upload → render → download flow.
> Any Docker-based host works instead.

The image is completely standard, so any of these work. All three have
CLI-free, click-through flows connected to your GitHub repo — pushing to
`main` redeploys automatically.

## Option A — Railway (simplest, ~$5/mo)

1. Go to [railway.app](https://railway.app) → sign in with GitHub.
2. **New Project → Deploy from GitHub repo** → pick `video-editor`.
3. Railway detects the `Dockerfile` automatically and builds it.
4. In the service → **Settings → Networking → Generate Domain** to get a
   public URL.

That's it — open the URL from any device, including your phone.

## Option B — Render (has a free tier)

1. Go to [render.com](https://render.com) → sign in with GitHub.
2. **New → Web Service** → connect the `video-editor` repo.
3. Runtime: **Docker** (auto-detected). Instance type: free works for
   trying it out; renders are CPU-bound, so paid tiers are noticeably
   faster.
4. Create the service and wait for the first build.

Free-tier caveats: the instance sleeps after ~15 min idle (first request
after that takes ~a minute to wake), and CPU is limited so renders of long
clips will be slow.

## Option C — Fly.io

```bash
fly launch --no-deploy   # accepts the Dockerfile; pick a region near you
fly deploy
```

## Things to know on any host

- **Job state and files are per-instance and ephemeral.** Finished renders
  live on the instance's disk and the job list resets on restart/redeploy —
  download your cut when it finishes. (Fine for a single-user tool; a real
  multi-user deployment wants object storage + a job queue, per README.)
- **Run exactly one instance.** The in-process job store doesn't scale out.
- **Memory**: 4K phone footage renders comfortably within 1–2 GB. The
  Podcast → Clips feature (local Whisper transcription) needs more — give it
  **at least 2 GB, ideally 4 GB**, and note that CPU-only transcription of a
  full episode takes several minutes. The image already bundles Python,
  faster-whisper, and the model, so there's nothing extra to configure.
- **No auth is built in** — anyone with the URL can upload and render. Most
  hosts offer basic access controls, or keep the URL private.
- Verify a deploy is healthy at `https://<your-url>/api/health` — it should
  return `{"ok":true,"ffmpeg":true,"ffprobe":true}`.

## Local production run (optional sanity check)

```bash
docker build -t video-editor .
docker run --rm -p 3000:3000 video-editor
# open http://localhost:3000
```
