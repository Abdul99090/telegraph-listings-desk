#!/usr/bin/env python3
"""
Render a `script` typescript (with timing) into video/demo.mp4.

Usage:
  script -qec "bash scripts/demo-session.sh" \
         --log-out video/demo.typescript --log-timing video/demo.timing
  python3 scripts/render-demo-video.py

The typescript is replayed through a simple terminal model (scrollback
of wrapped lines, ANSI stripped), sampled at 10 fps, time-compressed
only if needed to land inside the 2-5 minute demo window, drawn with
PIL in a terminal style, and encoded with ffmpeg/libx264. A silent
audio track is added for portal compatibility. The content is the
real session output - rendering changes pacing, never the text.
"""
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
TS = ROOT / "video" / "demo.typescript"
TIMING = ROOT / "video" / "demo.timing"
OUT = ROOT / "video" / "demo.mp4"

W, H = 1600, 900
COLS, ROWS = 118, 35
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
FONT_SIZE = 21
LINE_H = 25
PAD_X, PAD_Y = 28, 18
FPS = 10
MIN_SECONDS, MAX_SECONDS = 150, 285

BG = (13, 17, 23)
FG = (230, 237, 243)
DIM = (139, 148, 158)
ACCENT = (126, 231, 135)
HEAD = (255, 198, 109)

ANSI = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[()][0-9A-B]")


def load_events():
    """[(delay_seconds, bytes)] from the timing file + typescript."""
    data = TS.read_bytes()
    events = []
    pos = 0
    for line in TIMING.read_text().splitlines():
        parts = line.split()
        if len(parts) < 2:
            continue
        delay, count = float(parts[0]), int(parts[1])
        chunk = data[pos : pos + count]
        pos += count
        events.append((delay, chunk))
    return events


class Screen:
    def __init__(self):
        self.lines = []  # wrapped, completed lines
        self.cur = ""  # current partial line
        self._pending_cr = False  # last char was \r (maybe half of \r\n)

    def feed(self, text):
        text = ANSI.sub("", text)
        for ch in text:
            if self._pending_cr:
                self._pending_cr = False
                if ch == "\n":
                    self._push(self.cur)
                    self.cur = ""
                    continue
                # a lone \r is a true overwrite: restart the line
                self.cur = ""
            if ch == "\n":
                self._push(self.cur)
                self.cur = ""
            elif ch == "\r":
                self._pending_cr = True
            elif ch == "\x08":
                self.cur = self.cur[:-1]
            elif ch >= " " or ch == "\t":
                self.cur += " " if ch == "\t" else ch
                if len(self.cur) >= COLS:
                    self._push(self.cur)
                    self.cur = ""

    def _push(self, line):
        # `script` writes its own header/trailer into the log; not content.
        if line.startswith("Script started on") or line.startswith("Script done on"):
            return
        while len(line) > COLS:
            self.lines.append(line[:COLS])
            line = line[COLS:]
        self.lines.append(line)

    def view(self):
        all_lines = self.lines + ([self.cur] if self.cur else [])
        return all_lines[-ROWS:]


def line_color(line):
    s = line.strip()
    if s.startswith("===") or s.startswith("---"):
        return DIM
    if s.startswith("#") or s.startswith("**"):
        return HEAD
    if "Verdict:" in line or "receipt 0x" in line:
        return ACCENT
    if line.startswith("wallet") or line.startswith("escrow") or line.startswith("limits"):
        return DIM
    return FG


def main():
    events = load_events()
    total = sum(d for d, _ in events)
    target = min(max(total, MIN_SECONDS), MAX_SECONDS) if total < MIN_SECONDS else min(total, MAX_SECONDS)
    scale = total / target if total else 1.0
    n_frames = int(target * FPS)
    print(f"session {total:.1f}s -> video {target:.1f}s (scale {scale:.2f}x), {n_frames} frames")

    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
    font_b = ImageFont.truetype(FONT_BOLD, FONT_SIZE)

    ffmpeg = subprocess.Popen(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
            "-i", "-",
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium",
            "-c:a", "aac", "-shortest", "-movflags", "+faststart",
            str(OUT),
        ],
        stdin=subprocess.PIPE,
    )

    screen = Screen()
    ev_idx = 0
    ev_time = 0.0  # session time consumed
    pending_delay = events[0][0] if events else 0.0
    for frame in range(n_frames):
        t_session = (frame / FPS) * scale
        # advance replay to t_session
        while ev_idx < len(events) and ev_time + pending_delay <= t_session:
            ev_time += pending_delay
            screen.feed(events[ev_idx][1].decode("utf-8", "replace"))
            ev_idx += 1
            pending_delay = events[ev_idx][0] if ev_idx < len(events) else float("inf")
        img = Image.new("RGB", (W, H), BG)
        draw = ImageDraw.Draw(img)
        y = PAD_Y
        for line in screen.view():
            f = font_b if line.strip().startswith("#") else font
            draw.text((PAD_X, y), line, font=f, fill=line_color(line))
            y += LINE_H
        ffmpeg.stdin.write(img.tobytes())
    ffmpeg.stdin.close()
    ffmpeg.wait()
    print(f"wrote {OUT}")


if __name__ == "__main__":
    sys.exit(main())
