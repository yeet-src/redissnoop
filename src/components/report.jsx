// Report tab — the opinionated summary. Runs the report heuristics over the
// live aggregates and shows a ranked list of findings: what the developer is
// probably looking for, with severity icons. Prose wraps to the panel width
// (the tables don't wrap; this does).
//
// Pure presentation: reads patterns + commandMix + stats signals, runs the
// pure analyze() over them.
import { Box, Text, bold, fg, idx } from "yeet:tui";
import { analyze } from "@/lib/report.js";
import { wrap } from "@/lib/format.js";

const WARN = idx(208);
const INFO = idx(75);
const OK = idx(40);
const DIM = idx(245);
const TITLE = idx(252);

const ICON = { warn: "⚠", info: "•", ok: "✓" };
const COLOR = { warn: WARN, info: INFO, ok: OK };

const TITLE_INDENT = 4; // "  ⚠ "
const DETAIL_INDENT = 6;

// Render one finding into an array of single-row Boxes, wrapping both the
// title and the detail to the panel width so nothing runs off the edge.
const findingRows = (f, width) => {
  const rows = [];
  const color = COLOR[f.sev];

  const titleLines = wrap(f.title, Math.max(8, width - TITLE_INDENT));
  titleLines.forEach((ln, i) => {
    rows.push(
      <Box height="1" direction="row">
        <Text break="none">
          {i === 0
            ? [fg(color)(`  ${ICON[f.sev]} `), bold(fg(TITLE)(ln))]
            : [fg(TITLE)(" ".repeat(TITLE_INDENT)), bold(fg(TITLE)(ln))]}
        </Text>
      </Box>,
    );
  });

  for (const ln of wrap(f.detail, Math.max(8, width - DETAIL_INDENT))) {
    rows.push(
      <Box height="1" direction="row">
        <Text break="none">{fg(DIM)(" ".repeat(DETAIL_INDENT) + ln)}</Text>
      </Box>,
    );
  }

  return rows;
};

export default ({ patterns, commandMix, stats, maxRows, width }) => (
  <Box height="1fr" direction="column">
    <Box height="1" direction="row" bg={idx(236)}>
      <Text break="none">{fg(DIM)("  what to look at  —  ranked by what's most likely to matter")}</Text>
    </Box>
    <Box height="1fr" direction="column" overflow="hidden">
      {() => {
        const findings = analyze(patterns.get(), commandMix.get(), stats.get());
        const out = [];
        let used = 0;
        for (const f of findings) {
          for (const row of findingRows(f, width)) {
            if (used >= maxRows) break;
            out.push(row);
            used++;
          }
          if (used >= maxRows) break;
        }
        return out;
      }}
    </Box>
  </Box>
);
