// Status rail: brand, live commands/sec, total observed, footgun count, and
// the active view. A one-row Box tinted as the rail via its own bg.
import { Box, Text, bold, fg, idx } from "yeet:tui";
import { fmtCount, fmtRate } from "@/lib/format.js";

const RAIL = idx(235);

export default ({ stats, view }) => (
  <Box height="1" direction="row" bg={RAIL}>
    <Text break="none">
      {() => {
        const { rate, total, footguns, wire = 0, tls = 0 } = stats.get();
        const sep = fg(idx(240))("  ▏  ");
        const fg_ = footguns > 0 ? idx(208) : idx(245);
        return [
          bold(fg(idx(196))(" ◉ redissnoop ")), sep,
          bold(`${fmtRate(rate)}`), fg(idx(245))(" cmd/s"), sep,
          // The proof line: both sources live, side by side.
          fg(idx(212))(`🔒 ${fmtCount(tls)} encrypted`),
          fg(idx(240))(" + "),
          fg(idx(75))(`∿ ${fmtCount(wire)} plaintext`),
          sep,
          fg(fg_)(footguns > 0 ? `⚠ ${fmtCount(footguns)} footguns` : "no footguns"),
        ];
      }}
    </Text>
  </Box>
);
