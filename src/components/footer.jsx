// Key-hint rail. A one-row Box tinted as the rail; each shortcut is a raised
// key-cap (bold gold glyph on a lighter tile) then a dimmed label.
import { Box, Text, bg, bold, fg, idx } from "yeet:tui";

const RAIL = idx(235);
const CAP = idx(238);
const GLYPH = idx(222);
const LABEL = idx(247);
const PAUSED = idx(203); // matches the warn red used by the feed's PAUSED badge

const hint = (keys, label) => [
  bg(CAP)(bold(fg(GLYPH)(` ${keys} `))),
  fg(LABEL)(` ${label}   `),
];

// Controls vary by tab: the table views navigate + expand, the Flagged feed
// scrolls + pauses, Report has neither. reset/quit are always available. A
// `frozen` signal (the Flagged feed's) drives a right-aligned "(paused)" badge.
export default ({ view, frozen }) => (
  <Box height="1" direction="row" bg={RAIL}>
    <Text break="none">
      {() => {
        const v = view.get();
        const parts = ["  "];
        if (v === "patterns" || v === "mix") {
          parts.push(...hint("↑/↓", "select"), ...hint("⏎", "expand"));
        } else if (v === "flagged") {
          parts.push(...hint("↑/↓", "scroll"), ...hint("P", "pause/play"));
        }
        parts.push(...hint("r", "reset"), ...hint("q", "quit"));
        return parts;
      }}
    </Text>
    <Box width="1fr" />
    <Text break="none">
      {() => (view.get() === "flagged" && frozen.get() ? bold(fg(PAUSED)("(paused)  ")) : "")}
    </Text>
  </Box>
);
