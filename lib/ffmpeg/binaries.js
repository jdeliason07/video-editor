const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ffmpeg = require("fluent-ffmpeg");

// The pipeline shells out to a real ffmpeg/ffprobe install (fluent-ffmpeg
// resolves both from $PATH by default). Point FFMPEG_PATH/FFPROBE_PATH at
// specific binaries if they aren't on PATH — see README "Requirements".
// On Windows we also look in the usual install locations (see below), since
// winget/choco/scoop installs often aren't on the PATH a server inherited.

const INSTALL_HINT =
  "Install FFmpeg (Debian/Ubuntu: `apt-get install -y ffmpeg`, macOS: `brew install ffmpeg`, " +
  "Windows: `winget install ffmpeg`) or set FFMPEG_PATH / FFPROBE_PATH, then restart the server.";

let cachedStatus = null;

function binaryWorks(binary) {
  try {
    execFileSync(binary, ["-version"], { stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/** Subdirectories of `dir` (empty if it doesn't exist). */
function subdirs(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(dir, d.name));
  } catch {
    return [];
  }
}

/**
 * Windows-only: directories where FFmpeg typically lands, plus the current
 * user/machine PATH read fresh from the registry (a server started from a
 * terminal opened before the install inherits a stale PATH).
 */
function windowsCandidateDirs() {
  const local = process.env.LOCALAPPDATA || "";
  const dirs = [
    path.join(local, "Microsoft", "WinGet", "Links"),
    // winget portable installs: Packages\Gyan.FFmpeg_...\ffmpeg-<ver>-full_build\bin
    ...subdirs(path.join(local, "Microsoft", "WinGet", "Packages"))
      .filter((d) => /ffmpeg/i.test(path.basename(d)))
      .flatMap((d) => [path.join(d, "bin"), ...subdirs(d).map((sub) => path.join(sub, "bin"))]),
    path.join(process.env.ProgramData || "C:\\ProgramData", "chocolatey", "bin"),
    path.join(process.env.USERPROFILE || "", "scoop", "shims"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "ffmpeg", "bin"),
    "C:\\ffmpeg\\bin",
  ];
  try {
    const freshPath = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        "[Environment]::GetEnvironmentVariable('Path','User') + ';' + [Environment]::GetEnvironmentVariable('Path','Machine')",
      ],
      { encoding: "utf8", windowsHide: true, timeout: 10000 }
    );
    dirs.push(...freshPath.split(";").map((d) => d.trim()).filter(Boolean));
  } catch {
    /* no PowerShell — the fixed locations above still apply */
  }
  return dirs;
}

/**
 * Find a working binary: explicit env override, then PATH, then (Windows)
 * the usual install locations. Returns the command to run, or null.
 */
function resolveBinary(name, envVar) {
  if (process.env[envVar]) return binaryWorks(process.env[envVar]) ? process.env[envVar] : null;
  if (binaryWorks(name)) return name;
  if (process.platform !== "win32") return null;
  for (const dir of windowsCandidateDirs()) {
    const candidate = path.join(dir, `${name}.exe`);
    if (fs.existsSync(candidate) && binaryWorks(candidate)) return candidate;
  }
  return null;
}

/** Point fluent-ffmpeg (and FFMPEG_PATH readers like filters.js) at a found binary. */
function applyResolved(ffmpegBin, ffprobeBin) {
  if (ffmpegBin && ffmpegBin !== "ffmpeg") {
    process.env.FFMPEG_PATH = ffmpegBin;
    ffmpeg.setFfmpegPath(ffmpegBin);
  }
  if (ffprobeBin && ffprobeBin !== "ffprobe") {
    process.env.FFPROBE_PATH = ffprobeBin;
    ffmpeg.setFfprobePath(ffprobeBin);
  }
}

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

/**
 * Non-throwing availability report for both binaries. Cached after the
 * first success (missing binaries are re-checked so an install fixes the
 * app without a restart, even though the hint suggests one to be safe).
 */
function checkBinaries() {
  if (cachedStatus && cachedStatus.ok) return cachedStatus;
  const ffmpegBin = resolveBinary("ffmpeg", "FFMPEG_PATH");
  const ffprobeBin = resolveBinary("ffprobe", "FFPROBE_PATH");
  applyResolved(ffmpegBin, ffprobeBin);
  const ffmpegOk = Boolean(ffmpegBin);
  const ffprobeOk = Boolean(ffprobeBin);
  cachedStatus = {
    ok: ffmpegOk && ffprobeOk,
    ffmpeg: ffmpegOk,
    ffprobe: ffprobeOk,
    hint: ffmpegOk && ffprobeOk ? null : INSTALL_HINT,
  };
  return cachedStatus;
}

/** Fail fast with an actionable message instead of a mid-render ENOENT. */
function assertFfmpegAvailable() {
  const status = checkBinaries();
  if (status.ok) return;
  const missing = [!status.ffmpeg && "ffmpeg", !status.ffprobe && "ffprobe"].filter(Boolean).join(" and ");
  throw new Error(`${missing} not found on this machine. ${INSTALL_HINT}`);
}

// Resolve once at load so modules that spawn ffmpeg before any explicit
// check (probe, loudness, …) still get the located binary.
checkBinaries();

module.exports = { ffmpeg, checkBinaries, assertFfmpegAvailable };
