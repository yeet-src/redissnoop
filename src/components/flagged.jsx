// Flagged view — a live tail of only the commands a lint rule flags (footguns:
// KEYS, FLUSHALL, SMEMBERS on big sets, …), newest at the top. It's the
// evidence behind the Report's findings: when Report says "KEYS is 3% of
// traffic," this shows the actual offending calls, in order, and which client
// issued them. Unlike a raw stream this is curated — quiet when traffic is
// clean, which for a linter is the good outcome.
//
// Every row is a footgun, so the verb is always warn-red with a ▲ marker; the
// `why` column carries the rule's note (the "use SCAN instead" guidance). The
// feed is bounded to the most recent N flags.
//
// A live feed is hard to read while it scrolls, so it can be paused on a frozen
// snapshot (P, or ↓, or a click — main.jsx owns that state); the header badge
// shows ● LIVE / ⏸ PAUSED. It's also mouse-driven: rows highlight on hover, and
// clicking a row freezes the feed on it so a flying entry can be stabbed and
// read. Hover is tracked by screen position (index), not row identity, so a
// still pointer keeps highlighting the line it's physically over as rows
// scroll under it.
import { Box, Text, bold, fg } from "yeet:tui";
import { pad } from "@/lib/format.js";
import { C } from "@/lib/theme.js";

const COL = { mark: 2 };

const headerRow = (w, paused) => (
  <Box height="1" direction="row" bg={C.headerBg}>
    <Text break="none">
      {[
        fg(C.label)(pad("  command", COL.mark + w.cmd)), " ",
        fg(C.label)(pad("key", w.key)), " ",
        fg(C.label)(pad("client", w.client)), " ",
        fg(C.label)(pad("why", w.why)), " ",
        paused ? bold(fg(C.warn)("⏸ PAUSED")) : bold(fg(C.ok)("● LIVE")),
      ]}
    </Text>
  </Box>
);

const flaggedRow = (r, w, { isSel, isHover, onClick, onHover }) => {
  const rowBg = isSel ? C.selBg : isHover ? C.hoverBg : undefined;
  return (
    <Box height="1" direction="row" bg={rowBg} onClick={onClick} setHover={onHover}>
      <Text break="none">
        {[
          fg(C.warn)(pad("▲", COL.mark)),
          bold(fg(C.warn)(pad(r.cmd, w.cmd))), " ",
          fg(C.text)(pad(r.key || "—", w.key)), " ",
          fg(C.dim)(pad(r.comm || "?", w.client)), " ",
          fg(C.label)(pad(r.note || "", w.why)),
        ]}
      </Text>
    </Box>
  );
};

export default ({ flaggedCmds, selected, frozen, hovered, maxRows, widths }) => (
  <Box direction="column">
    <Box height="1fr" direction="column" overflow="hidden">
      {() => {
        const paused = !!frozen.get();
        const rows = (paused ? frozen.get() : flaggedCmds.get()) || [];
        const out = [headerRow(widths, paused)];
        if (!rows.length) {
          out.push(
            <Box height="1"><Text>{[fg(C.ok)("  ✓ no flagged commands"), fg(C.dim)(" — traffic looks clean")]}</Text></Box>
          );
          return out;
        }
        const sel = selected.get();
        const hov = hovered.get(); // screen-row index under the pointer
        for (let i = 0; i < rows.length && i < maxRows; i++) {
          out.push(flaggedRow(rows[i], widths, {
            isSel: paused && i === sel, // the keyboard cursor only shows while paused
            isHover: i === hov,
            // Click freezes the feed (on what's shown now) and selects the row,
            // so a command flying past can be stabbed and inspected.
            onClick: () => {
              if (!frozen.get()) frozen.set(rows);
              selected.set(i);
            },
            onHover: (h) => {
              if (h) hovered.set(i);
              else if (hovered.get() === i) hovered.set(null);
            },
          }));
        }
        return out;
      }}
    </Box>
  </Box>
);
