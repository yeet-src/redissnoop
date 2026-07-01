// Command-mix view — per-verb breakdown with share and a footgun flag, as a
// keyboard accordion. The SELECTED verb expands to which key patterns/keys it
// runs against. Verb color encodes source: pink = seen encrypted, blue =
// plaintext. Footguns override to the warn color so danger reads first.
//
// ↑/↓ select · Enter/Space expand. Pure presentation.
import { Box, Text, bold, fg } from "yeet:tui";
import { bar, fmtCount, lpad, pad, shareColor, srcColor } from "@/lib/format.js";
import { C } from "@/lib/theme.js";

const BAR_W = 14;
const COL = { mark: 2, share: 7, ops: 8 };

const headerRow = (w) => (
  <Box height="1" direction="row" bg={C.headerBg}>
    <Text break="none">
      {[
        fg(C.label)(pad("  command", COL.mark + w.cmd)), " ",
        fg(C.label)(lpad("share", COL.share)), " ",
        fg(C.label)(pad("", BAR_W)), " ",
        fg(C.label)(lpad("ops", COL.ops)), "  ",
        fg(C.label)(pad("footgun", w.note)),
      ]}
    </Text>
  </Box>
);

const cmdRow = (c, w, isSel, isOpen) => {
  const nameColor = c.footgun ? C.warn : srcColor(c.src);
  return (
    <Box height="1" direction="row" bg={isSel ? C.selBg : undefined}>
      <Text break="none">
        {[
          fg(isSel ? C.textBold : C.dim)(pad(isOpen ? "▾" : "▸", COL.mark)),
          bold(fg(nameColor)(pad(c.cmd, w.cmd))), " ",
          fg(shareColor(c.share))(lpad(`${c.share.toFixed(1)}%`, COL.share)), " ",
          ...bar(c.share, BAR_W), " ",
          fg(srcColor(c.src))(lpad(fmtCount(c.count), COL.ops)), "  ",
          c.footgun ? fg(C.warn)(pad(c.footgun, w.note)) : fg(C.dim)(pad("", w.note)),
        ]}
      </Text>
    </Box>
  );
};

// Drill-down under an expanded verb: which patterns/keys it hits.
const drillRows = (c) => {
  const pats = c.topPats.map((p) => `${p.k} ${fmtCount(p.v)}`).join("   ");
  const keys = c.topKeys.map((k) => `${k.k} ${fmtCount(k.v)}`).join("   ");
  return [
    <Box height="1" direction="row">
      <Text break="none">{[fg(C.dim)("     patterns  "), fg(C.text)(pats || "(none)")]}</Text>
    </Box>,
    <Box height="1" direction="row">
      <Text break="none">{[fg(C.dim)("     top keys  "), fg(C.text)(keys || "(none)")]}</Text>
    </Box>,
  ];
};

export default ({ commandMix, selected, expanded, maxRows, widths }) => (
  <Box height="1fr" direction="column">
    {headerRow(widths)}
    <Box height="1fr" direction="column" overflow="hidden">
      {() => {
        const rows = commandMix.get();
        if (!rows.length) {
          return [<Box height="1"><Text>{fg(C.dim)("  waiting for traffic…")}</Text></Box>];
        }
        const sel = selected.get();
        const open = expanded.get();
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
