// Hot key-pattern view — the headline, as a keyboard accordion. One row per
// inferred key pattern (user:*, session:*), ranked by share of traffic. The
// row's NAME color encodes the source: pink = seen in encrypted (TLS)
// traffic, blue = plaintext only. No glyphs — color carries the meaning, and
// every column lines up.
//
// ↑/↓ select · Enter/Space expand. Pure presentation.
import { Box, Text, bold, fg } from "yeet:tui";
import { bar, fmtCount, lpad, pad, shareColor, srcColor } from "@/lib/format.js";
import { C } from "@/lib/theme.js";

const BAR_W = 16;

// Column widths — fixed so headers and rows align exactly.
const COL = { mark: 2, share: 7, ops: 8, rw: 11, keys: 7 };

const rwSplit = (reads, writes) => {
  const t = reads + writes || 1;
  const rp = Math.round((reads / t) * 100);
  return `${rp}r/${100 - rp}w`;
};

const spacer = () => <Box height="1"><Text> </Text></Box>;

const headerRow = (w) => (
  <Box height="1" direction="row" bg={C.headerBg}>
    <Text break="none">
      {[
        fg(C.label)(pad("  key pattern", COL.mark + w.pat)), " ",
        fg(C.label)(lpad("share", COL.share)), " ",
        fg(C.label)(pad("", BAR_W)), " ",
        fg(C.label)(lpad("ops", COL.ops)), " ",
        fg(C.label)(pad("r / w", COL.rw)), " ",
        fg(C.label)(lpad("keys", COL.keys)),
      ]}
    </Text>
  </Box>
);

const patRow = (p, w, isSel, isOpen) => {
  const c = srcColor(p.src); // pink (tls) | blue (wire)
  return (
    <Box height="1" direction="row" bg={isSel ? C.selBg : undefined}>
      <Text break="none">
        {[
          fg(isSel ? C.textBold : C.dim)(pad(isOpen ? "▾" : "▸", COL.mark)),
          bold(fg(c)(pad(p.pat, w.pat))), " ",
          fg(shareColor(p.share))(lpad(`${p.share.toFixed(1)}%`, COL.share)), " ",
          ...bar(p.share, BAR_W), " ",
          fg(c)(lpad(fmtCount(p.count), COL.ops)), " ",
          fg(C.label)(pad(rwSplit(p.reads, p.writes), COL.rw)), " ",
          fg(C.label)(lpad(fmtCount(p.distinctKeys) + (p.keysCapped ? "+" : ""), COL.keys)),
        ]}
      </Text>
    </Box>
  );
};

// Drill-down under an expanded row: top commands and top keys.
const drillRows = (p) => {
  const cmdLine = p.topCmds.map((c) => `${c.k} ${fmtCount(c.v)}`).join("   ");
  const keyLine = p.topKeys.map((k) => `${k.k} ${fmtCount(k.v)}`).join("   ");
  return [
    <Box height="1" direction="row">
      <Text break="none">{[fg(C.dim)("     commands  "), fg(C.text)(cmdLine)]}</Text>
    </Box>,
    <Box height="1" direction="row">
      <Text break="none">{[fg(C.dim)("     top keys  "), fg(C.text)(keyLine || "(none)")]}</Text>
    </Box>,
  ];
};

export default ({ patterns, selected, expanded, maxRows, widths }) => (
  <Box direction="column">
    {headerRow(widths)}
    {spacer()}
    <Box height="1fr" direction="column" overflow="hidden">
      {() => {
        const rows = patterns.get();
        if (!rows.length) {
          return [
            <Box height="1">
              <Text>{fg(C.dim)("  waiting for traffic…  (send Redis commands over TCP)")}</Text>
            </Box>,
          ];
        }
        const sel = selected.get();
        const openPat = expanded.get();
        const out = [];
        let used = 0;
        for (let i = 0; i < rows.length && used < maxRows; i++) {
          const p = rows[i];
          const isOpen = openPat === p.pat;
          out.push(patRow(p, widths, i === sel, isOpen));
          used++;
          if (isOpen) {
            for (const dr of drillRows(p)) {
              if (used >= maxRows) break;
              out.push(dr);
              used++;
            }
          }
          // Breathing room between entries.
          if (used < maxRows) { out.push(spacer()); used++; }
        }
        return out;
      }}
    </Box>
  </Box>
);
