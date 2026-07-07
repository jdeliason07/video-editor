#!/usr/bin/env python3
"""
Local speech-to-text for the podcast clipper, using faster-whisper.

Reads a 16 kHz mono WAV (produced by the Node wrapper via ffmpeg) and prints
a JSON transcript with segment- and word-level timestamps to stdout. Coarse
progress is emitted to stderr as `PROGRESS <fraction>` lines so the Node
side can surface it without parsing the JSON.

No network access is required at run time once the model is cached; the
model is a local Whisper checkpoint (default base.en), so nothing about the
audio leaves the machine.

Usage: transcribe.py <input.wav>
Env:   WHISPER_MODEL (default "base.en"), WHISPER_COMPUTE (default "int8")
"""

import json
import os
import sys


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: transcribe.py <input.wav>", file=sys.stderr)
        return 2

    audio_path = sys.argv[1]
    model_name = os.environ.get("WHISPER_MODEL", "base.en")
    compute_type = os.environ.get("WHISPER_COMPUTE", "int8")

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "faster-whisper is not installed. Run: pip install faster-whisper",
            file=sys.stderr,
        )
        return 3

    model = WhisperModel(model_name, device="cpu", compute_type=compute_type)

    # vad_filter drops long silences, which both speeds things up and keeps
    # word timings tight around actual speech.
    segments_iter, info = model.transcribe(
        audio_path,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )

    total = max(info.duration, 0.001)
    segments = []
    for seg in segments_iter:
        segments.append(
            {
                "start": round(seg.start, 3),
                "end": round(seg.end, 3),
                "text": seg.text.strip(),
                "words": [
                    {"word": w.word, "start": round(w.start, 3), "end": round(w.end, 3)}
                    for w in (seg.words or [])
                    if w.start is not None and w.end is not None
                ],
            }
        )
        # Progress is driven by how far into the audio the latest segment ends.
        print(f"PROGRESS {min(seg.end / total, 0.999):.4f}", file=sys.stderr, flush=True)

    print("PROGRESS 1.0", file=sys.stderr, flush=True)
    json.dump(
        {"duration": round(info.duration, 3), "language": info.language, "segments": segments},
        sys.stdout,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
