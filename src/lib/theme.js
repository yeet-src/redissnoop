// Central palette — one disciplined color system, used consistently so the
// UI reads as a product, not a script. Aimed at btop/k9s-grade legibility:
// dim chrome, bright data, one accent for the headline idea (encrypted).
//
// Rules of the road:
//  - CHROME (borders, labels, hints) stays DIM — it must recede.
//  - DATA (values, names, counts) stays BRIGHT — the eye lands here.
//  - Reserve strong color for MEANING: tls accent, warnings, share heat.
import { bg, bold, fg, idx } from "yeet:tui";

export const C = {
  // Surfaces
  rail: idx(234),        // header/footer rail bg (near-black)
  headerBg: idx(236),    // column-header row bg
  selBg: idx(238),       // selected row bg
  // Chrome / text
  dim: idx(240),         // separators, faint chrome
  label: idx(245),       // column labels, hints
  text: idx(252),        // primary data text (bright)
  textBold: idx(255),    // emphasized data (near-white)
  // Accents (meaning only)
  tls: idx(213),         // ENCRYPTED — the hero accent (magenta/pink)
  wire: idx(75),         // plaintext wire (cool blue)
  name: idx(252),        // pattern/verb names
  warn: idx(203),        // footgun red — alarming but not neon
  ok: idx(78),           // healthy green
  // Share-heat ramp (cool -> hot) for bars/percentages
  heat: [39, 38, 80, 114, 220, 215, 208, 203].map(idx),
};

export { bg, bold, fg, idx };

// Heat color for a 0..100 share.
export const heatColor = (pct) => {
  const r = C.heat;
  return r[Math.min(r.length - 1, Math.max(0, Math.floor((pct / 100) * r.length)))];
};
