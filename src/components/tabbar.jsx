// Visible tab bar. Shows all tabs, highlights the active one, and hints the
// switch key. The active tab is a raised, bright tile; inactive tabs are
// dim. A one-row Box tinted as a rail via its own bg.
import { Box, Text, bg, bold, fg } from "yeet:tui";
import { C, idx } from "@/lib/theme.js";

const ACTIVE_BG = idx(31);  // teal tile for the current tab
const ACTIVE_FG = idx(231); // near-white on it

// Tabs in cycle order — must match the keys in main.jsx's VIEWS / cycle.
export const TABS = [
  { id: "patterns", label: "Key Patterns" },
  { id: "mix", label: "Command Mix" },
  { id: "flagged", label: "Flagged" },
  { id: "report", label: "Report" },
];

// Mouse hit-testing for the bar (used by main.jsx to make tabs clickable).
// The bar renders, in row order: a leading space, then each tab as a tile
// `<space><n><space><label><space>` — the same width whether active or not
// (the active tile only paints a background over it) — with a ` · ` separator
// after each. These constants MIRROR the render below; keep them in sync if
// the layout changes. Columns are zero-based, matching the tty mouse coords.
const LEAD = 1; // the leading " "
const SEP = 3;  // the " · " separator after each tile

// [start, end) screen columns of each tab's tile, in render order.
export function tabHitRanges() {
  let col = LEAD;
  return TABS.map((t, i) => {
    const width = String(i + 1).length + t.label.length + 3; // " n " + label + " "
    const range = { id: t.id, start: col, end: col + width };
    col += width + SEP;
    return range;
  });
}

// The tab id at screen column x (zero-based), or null if x lands in a gap.
export function tabAtColumn(x) {
  const hit = tabHitRanges().find((r) => x >= r.start && x < r.end);
  return hit ? hit.id : null;
}

export default ({ view }) => (
  <Box height="1" direction="row" bg={C.rail}>
    <Text break="none">
      {() => {
        const cur = view.get();
        const runs = [" "];
        TABS.forEach((t, i) => {
          const n = i + 1;
          if (t.id === cur) {
            runs.push(bg(ACTIVE_BG)(bold(fg(ACTIVE_FG)(` ${n} ${t.label} `))));
          } else {
            runs.push(fg(C.label)(` ${n} `));
            runs.push(fg(C.dim)(`${t.label} `));
          }
          runs.push(fg(C.dim)(" · "));
        });
        return runs;
      }}
    </Text>
  </Box>
);
