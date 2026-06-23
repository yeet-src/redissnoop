// Hot key-pattern view — the headline, as a keyboard accordion. One row per
// inferred key pattern (user:*, session:*), ranked by share of traffic, with
// a share bar and read/write split. The cluttered command list is gone from
// the row; instead the SELECTED row expands (Enter/Space) to a drill-down:
// top commands and top concrete keys within that pattern.
//
// ↑/↓ select · Enter/Space expand-collapse. Pure presentation: reads the
// `patterns` and `selected`/`expanded` signals plus the widths handed down.
import { Box, Text, bold, fg, idx } from "yeet:tui";
import { bar, fmtCount, lpad, pad, shareColor, srcBadge } from "@/lib/format.js";

const HEADER_BG = idx(236);
const SEL_BG = idx(238);
const DIM = idx(245);
const DRILL = idx(244);
const BAR_W = 16;

const rwSplit = (reads, writes) => {
  const t = reads + writes || 1;
  const rp = Math.round((reads / t) * 100);
  return `${rp}r/${100 - rp}w`;
};

const headerRow = (w) => (
  <Box height="1" direction="row" bg={HEADER_BG}>
    <Text break="none">
      {[
        fg(DIM)(pad("  src key pattern", w.pat + 6)), " ",
        fg(DIM)(lpad("share", 6)), " ",
        fg(DIM)(pad("", BAR_W)), " ",
        fg(DIM)(lpad("ops", 7)), " ",
        fg(DIM)(pad("r/w", 11)), " ",
        fg(DIM)(pad("keys", 8)),
      ]}
    </Text>
  </Box>
);

const patRow = (p, w, isSel, isOpen) => (
  <Box height="1" direction="row" bg={isSel ? SEL_BG : undefined}>
    <Text break="none">
      {[
        fg(isSel ? idx(222) : DIM)(isOpen ? "▾ " : "▸ "),
        srcBadge(p.src), " ",
        bold(fg(idx(81))(pad(p.pat, w.pat))), " ",
        fg(shareColor(p.share))(lpad(`${p.share.toFixed(1)}%`, 6)), " ",
        fg(shareColor(p.share))(bar(p.share, BAR_W)), " ",
        fg(idx(252))(lpad(fmtCount(p.count), 7)), " ",
        fg(DIM)(pad(rwSplit(p.reads, p.writes), 11)), " ",
        fg(DIM)(pad(fmtCount(p.distinctKeys) + (p.keysCapped ? "+" : ""), 8)),
      ]}
    </Text>
  </Box>
);

// The drill-down, indented under an expanded row: top commands and top keys.
const drillRows = (p, w) => {
  const out = [];
  const cmdLine = p.topCmds
    .map((c) => `${c.k} ${fmtCount(c.v)}`)
    .join("   ");
  out.push(
    <Box height="1" direction="row">
      <Text break="none">{[fg(DRILL)("    commands: "), fg(idx(180))(cmdLine)]}</Text>
    </Box>,
  );
  // Top concrete keys, a few per line so a hot key is obvious.
  const keyLine = p.topKeys.map((k) => `${k.k}(${fmtCount(k.v)})`).join("   ");
  out.push(
    <Box height="1" direction="row">
      <Text break="none">
        {[fg(DRILL)("    top keys: "), fg(idx(252))(keyLine || "(none)")]}
      </Text>
    </Box>,
  );
  return out;
};

export default ({ patterns, selected, expanded, maxRows, widths }) => (
  <Box direction="column">
    {headerRow(widths)}
    <Box height="1fr" direction="column" overflow="hidden">
      {() => {
        const rows = patterns.get();
        if (!rows.length) {
          return [
            <Box height="1">
              <Text>{fg(DIM)("  waiting for traffic…  (redis-cli -h 127.0.0.1 … — must be TCP)")}</Text>
            </Box>,
          ];
        }
        const sel = selected.get();
        const openPat = expanded.get(); // the pattern string that's expanded, or null
        const out = [];
        let used = 0;
        for (let i = 0; i < rows.length && used < maxRows; i++) {
          const p = rows[i];
          const isOpen = openPat === p.pat;
          out.push(patRow(p, widths, i === sel, isOpen));
          used++;
          if (isOpen) {
            for (const dr of drillRows(p, widths)) {
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
