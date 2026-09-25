/**
 * Render a Whisper transcript ({ segments: [{ start, end, text }] }) into the
 * downloadable formats the Transcribe page offers. Pure functions — no I/O.
 */

const pad = (n, width = 2) => String(n).padStart(width, "0");

/** Seconds → "HH:MM:SS<sep>mmm" (SRT uses ",", WebVTT uses "."). */
function formatTimestamp(seconds, sep = ",") {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(totalMs % 1000, 3)}`;
}

/** Seconds → "M:SS" or "H:MM:SS" for human-readable paragraph markers. */
function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function cleanSegments(transcript) {
  return (transcript?.segments ?? []).filter((seg) => seg.text && seg.text.trim().length > 0);
}

/**
 * Group segments into readable paragraphs: break on a pause of at least
 * `pauseSeconds`, or once a paragraph runs past `maxSeconds`, but only at a
 * sentence end so paragraphs never split mid-sentence (unless the speaker
 * never finishes one, in which case `maxSeconds * 2` forces the break).
 */
function toParagraphs(transcript, { pauseSeconds = 2, maxSeconds = 60 } = {}) {
  const paragraphs = [];
  let current = null;
  for (const seg of cleanSegments(transcript)) {
    const text = seg.text.trim();
    if (current) {
      const gap = seg.start - current.end;
      const length = seg.start - current.start;
      const sentenceEnded = /[.!?…]["')\]]?$/.test(current.text);
      if (gap >= pauseSeconds || (length >= maxSeconds && sentenceEnded) || length >= maxSeconds * 2) {
        paragraphs.push(current);
        current = null;
      }
    }
    if (current) {
      current.text += ` ${text}`;
      current.end = seg.end;
    } else {
      current = { start: seg.start, end: seg.end, text };
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

/** Plain text: timestamped paragraphs (or bare prose with timestamps=false). */
function toTxt(transcript, { timestamps = true } = {}) {
  const paragraphs = toParagraphs(transcript);
  return (
    paragraphs.map((p) => (timestamps ? `[${formatClock(p.start)}] ${p.text}` : p.text)).join("\n\n") + "\n"
  );
}

function toSrt(transcript) {
  return (
    cleanSegments(transcript)
      .map(
        (seg, i) =>
          `${i + 1}\n${formatTimestamp(seg.start, ",")} --> ${formatTimestamp(seg.end, ",")}\n${seg.text.trim()}\n`
      )
      .join("\n")
  );
}

function toVtt(transcript) {
  const cues = cleanSegments(transcript).map(
    (seg) => `${formatTimestamp(seg.start, ".")} --> ${formatTimestamp(seg.end, ".")}\n${seg.text.trim()}\n`
  );
  return `WEBVTT\n\n${cues.join("\n")}`;
}

const FORMATS = {
  txt: { render: (t) => toTxt(t), contentType: "text/plain; charset=utf-8" },
  srt: { render: toSrt, contentType: "application/x-subrip; charset=utf-8" },
  vtt: { render: toVtt, contentType: "text/vtt; charset=utf-8" },
  json: { render: (t) => JSON.stringify(t, null, 2), contentType: "application/json; charset=utf-8" },
};

module.exports = { formatTimestamp, formatClock, toParagraphs, toTxt, toSrt, toVtt, FORMATS };
