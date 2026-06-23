// Key-hint rail. A one-row Box tinted as the rail; each shortcut is a raised
// key-cap (bold gold glyph on a lighter tile) then a dimmed label.
import { Box, Text, bg, bold, fg, idx } from "yeet:tui";

const RAIL = idx(235);
const CAP = idx(238);
const GLYPH = idx(222);
const LABEL = idx(247);

const hint = (keys, label) => [
  bg(CAP)(bold(fg(GLYPH)(` ${keys} `))),
  fg(LABEL)(` ${label}   `),
];

export default () => (
  <Box height="1" direction="row" bg={RAIL}>
    <Text break="none">
      {[
        "  ",
        ...hint("↑/↓", "select"),
        ...hint("⏎", "expand"),
        ...hint("r", "reset"),
        ...hint("q", "quit"),
      ]}
    </Text>
  </Box>
);
