// Status rail: brand, live commands/sec, total observed, footgun count, and
// the active view. A one-row Box tinted as the rail via its own bg.
import { Box, Text, bg, bold, fg } from "yeet:tui";
import { fmtCount, fmtRate } from "@/lib/format.js";
import { C } from "@/lib/theme.js";

export default ({ stats }) => (
  <Box height="1" direction="row" bg={C.rail}>
    <Text break="none">
      {() => {
        const { rate, footguns, wire = 0, tls = 0 } = stats.get();
        const sep = fg(C.dim)("   ");
        return [
          // Brand chip — inverse tile so the name reads as a logo, not text.
          bg(C.text)(bold(fg(C.rail)(" redissnoop "))),
          sep,
          bold(fg(C.textBold)(fmtRate(rate))), fg(C.label)(" cmd/s"),
          sep,
          // The proof line — the hero. Encrypted in pink, plaintext in blue.
          bold(fg(C.tls)(`${fmtCount(tls)} encrypted`)),
          fg(C.dim)("  +  "),
          bold(fg(C.wire)(`${fmtCount(wire)} plaintext`)),
          sep,
          footguns > 0
            ? bold(fg(C.warn)(`${fmtCount(footguns)} footguns`))
            : fg(C.ok)("clean"),
        ];
      }}
    </Text>
  </Box>
);
