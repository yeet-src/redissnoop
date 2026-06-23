// Visible tab bar. Shows all tabs, highlights the active one, and hints the
// switch key. The active tab is a raised, bright tile; inactive tabs are
// dim. A one-row Box tinted as a rail via its own bg.
import { Box, Text, bg, bold, fg } from "yeet:tui";
import { C, idx } from "@/lib/theme.js";

const ACTIVE_BG = idx(31);  // teal tile for the current tab
const ACTIVE_FG = idx(231); // near-white on it

// Tabs in cycle order — must match the keys in main.jsx's VIEWS / cycle.
export const TABS = [
  { id: "report", label: "Report" },
  { id: "patterns", label: "Key Patterns" },
  { id: "mix", label: "Command Mix" },
];

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
