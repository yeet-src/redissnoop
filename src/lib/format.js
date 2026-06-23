// Pure presentation helpers — strings and color, no signals or BPF.
import { fg, idx } from "yeet:tui";
import { C, heatColor } from "@/lib/theme.js";

export const pad = (s, n) => (String(s) + " ".repeat(n)).slice(0, n);
export const lpad = (s, n) => (" ".repeat(n) + String(s)).slice(-n);

// A commands/sec rate as a short string: 12, 4.2K, 1.1M.
export const fmtRate = (perSec) => {
  if (perSec < 1000) return `${Math.round(perSec)}`;
  if (perSec < 1e6) return `${(perSec / 1e3).toFixed(1)}K`;
  return `${(perSec / 1e6).toFixed(1)}M`;
};

// A count as a short string: 530, 1.2K, 3.4M.
export const fmtCount = (n) => {
  if (n < 1000) return `${n}`;
  if (n < 1e6) return `${(n / 1e3).toFixed(1)}K`;
  return `${(n / 1e6).toFixed(1)}M`;
};

// A horizontal share bar (0..100 percent) of fixed width. The filled portion
// is heat-colored; the remainder is a DIM track (░) so the bar always has a
// crisp, fixed length — far more legible than trailing blanks, and it reads
// as a real gauge. Returns a pre-colored run.
const FULL = "█";
const PARTS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
const TRACK = "░";
export const bar = (pct, width) => {
  const frac = Math.max(0, Math.min(1, pct / 100)) * width;
  const whole = Math.floor(frac);
  const rem = Math.floor((frac - whole) * 8);
  const filled = FULL.repeat(whole) + PARTS[rem];
  const track = TRACK.repeat(Math.max(0, width - filled.length));
  // Two runs (filled heat + dim track). Returned as an array — callers spread
  // it into their run list (styled runs can't be string-concatenated).
  return [fg(heatColor(pct))(filled), fg(C.dim)(track)];
};

// Word-wrap a string to `width` columns, returning an array of lines. Greedy:
// breaks on spaces; a word longer than the width is hard-split so nothing
// overflows. Used by the Report tab to wrap prose findings.
export const wrap = (text, width) => {
  const w = Math.max(1, width);
  const lines = [];
  let line = "";
  for (const word of String(text).split(/\s+/)) {
    if (!word) continue;
    if (word.length > w) {
      // Hard-split an over-long token.
      if (line) { lines.push(line); line = ""; }
      let rest = word;
      while (rest.length > w) { lines.push(rest.slice(0, w)); rest = rest.slice(w); }
      line = rest;
    } else if (!line) {
      line = word;
    } else if (line.length + 1 + word.length <= w) {
      line += " " + word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
};

// Source badge for a row, given its observed sources (["wire"], ["tls"], or
// both). 🔒 = seen inside encrypted (TLS) traffic; ∿ = seen on the plaintext
// wire. Both = we caught it either way. This is the visual proof, per-row,
// that the tool reads encrypted AND unencrypted.
// Source → row color. Encrypted wins: any TLS traffic colors the row pink
// (the encrypted story is the point); pure-plaintext rows are blue. This is
// how a viewer reads "we see both" — by the color, no glyphs, perfect column
// alignment.
export const srcColor = (src) => ((src && src.includes("tls")) ? C.tls : C.wire);

// Ramp a 0..100 share onto a cool→warm color so a dominant pattern reads hot.
export const shareColor = (pct) => heatColor(pct);
