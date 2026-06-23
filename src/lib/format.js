// Pure presentation helpers — strings and color, no signals or BPF.
import { fg, idx } from "yeet:tui";

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

// A horizontal share bar (0..100 percent) of fixed width, drawn with block
// glyphs. Used to make the dominant key patterns pop visually.
const FULL = "█";
const PARTS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
export const bar = (pct, width) => {
  const frac = Math.max(0, Math.min(1, pct / 100)) * width;
  const whole = Math.floor(frac);
  const rem = Math.floor((frac - whole) * 8);
  return (FULL.repeat(whole) + PARTS[rem]).padEnd(width, " ");
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
export const srcBadge = (src) => {
  const tls = src && src.includes("tls");
  const wire = src && src.includes("wire");
  if (tls && wire) return fg(idx(213))("🔒∿"); // both
  if (tls) return fg(idx(212))("🔒 ");          // encrypted only
  return fg(idx(244))("∿ ");                    // plaintext wire
};

// Ramp a 0..100 share onto a cool→warm color so a dominant pattern reads hot.
const SHARE_RAMP = [39, 38, 81, 220, 215, 208, 196].map(idx);
export const shareColor = (pct) => {
  const i = Math.min(SHARE_RAMP.length - 1, Math.floor((pct / 100) * SHARE_RAMP.length));
  return SHARE_RAMP[i];
};
