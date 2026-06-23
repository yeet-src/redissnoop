// Command-mix view — per-verb breakdown with rate and share and a footgun
// flag, as a keyboard accordion. The SELECTED verb expands (Enter/Space) to
// the inverse of the patterns drill-down: which key patterns and concrete
// keys this command runs against. "GET is 40% user:*, 30% product:*."
//
// ↑/↓ select · Enter/Space expand-collapse. Pure presentation.
import { Box, Text, bold, fg, idx } from "yeet:tui";
import { bar, fmtCount, lpad, pad, shareColor } from "@/lib/format.js";

const HEADER_BG = idx(236);
const SEL_BG = idx(238);
const DIM = idx(245);
const DRILL = idx(244);
const WARN = idx(208);
const BAR_W = 14;

const headerRow = (w) => (
  <Box height="1" direction="row" bg={HEADER_BG}>
    <Text break="none">
      {[
        fg(DIM)(pad("  command", w.cmd + 2)), " ",
        fg(DIM)(lpad("share", 6)), " ",
        fg(DIM)(pad("", BAR_W)), " ",
        fg(DIM)(lpad("ops", 7)), "  ",
        fg(DIM)(pad("⚠ footgun", w.note)),
      ]}
    </Text>
  </Box>
);

const cmdRow = (c, w, isSel, isOpen) => (
  <Box height="1" direction="row" bg={isSel ? SEL_BG : undefined}>
    <Text break="none">
      {[
        fg(isSel ? idx(222) : DIM)(isOpen ? "▾ " : "▸ "),
        (c.footgun ? bold(fg(WARN)(pad(c.cmd, w.cmd))) : bold(fg(idx(81))(pad(c.cmd, w.cmd)))), " ",
        fg(shareColor(c.share))(lpad(`${c.share.toFixed(1)}%`, 6)), " ",
        fg(shareColor(c.share))(bar(c.share, BAR_W)), " ",
        fg(idx(252))(lpad(fmtCount(c.count), 7)), "  ",
        c.footgun ? fg(WARN)(pad(`⚠ ${c.footgun}`, w.note)) : fg(DIM)(pad("", w.note)),
      ]}
    </Text>
  </Box>
);

// Drill-down indented under an expanded verb: which patterns and keys it hits.
const drillRows = (c) => {
  const pats = c.topPats.map((p) => `${p.k} ${fmtCount(p.v)}`).join("   ");
  const keys = c.topKeys.map((k) => `${k.k}(${fmtCount(k.v)})`).join("   ");
  return [
    <Box height="1" direction="row">
      <Text break="none">{[fg(DRILL)("    key patterns: "), fg(idx(180))(pats || "(none)")]}</Text>
    </Box>,
    <Box height="1" direction="row">
      <Text break="none">{[fg(DRILL)("    top keys:     "), fg(idx(252))(keys || "(none)")]}</Text>
    </Box>,
  ];
};

export default ({ commandMix, selected, expanded, maxRows, widths }) => (
  <Box direction="column">
    {headerRow(widths)}
    <Box height="1fr" direction="column" overflow="hidden">
      {() => {
        const rows = commandMix.get();
        if (!rows.length) {
          return [<Box height="1"><Text>{fg(DIM)("  waiting for traffic…")}</Text></Box>];
        }
        const sel = selected.get();
        const open = expanded.get(); // the verb string expanded, or null
        const out = [];
        let used = 0;
        for (let i = 0; i < rows.length && used < maxRows; i++) {
          const c = rows[i];
          const isOpen = open === c.cmd;
          out.push(cmdRow(c, widths, i === sel, isOpen));
          used++;
          if (isOpen) {
            for (const dr of drillRows(c)) {
              if (used >= maxRows) break;
              out.push(dr);
              used++;
            }
          }
        }
        return out;
      }}
    </Box>
  </Box>
);
