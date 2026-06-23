// Layout model. The body between the 1-row titlebar and 1-row footer holds
// one full-height view at a time (Tab switches between Patterns and Command
// mix). Pure: given {cols, rows} it hands the active view its column widths
// and visible-row budget.

const clamp = (lo, v, hi) => Math.max(lo, Math.min(hi, v));

export const layoutFor = ({ cols, rows }) => {
  const body = Math.max(2, rows - 3); // tab bar + title + footer
  const maxRows = Math.max(1, body - 1); // minus the header row

  // Patterns view columns: pattern | share | bar(16) | ops | r/w | commands.
  // Pattern gets a third of the width; commands take the remaining slack.
  const patW = clamp(12, Math.round(cols * 0.3), 40);
  const fixedP = 6 + 16 + 7 + 11 + 5; // share + bar + ops + r/w + gaps
  const cmdsW = clamp(8, cols - patW - fixedP, 120);

  // Command-mix columns: command | share | bar(14) | ops | footgun note.
  const cmdW = 12;
  const fixedC = 6 + 14 + 7 + 4; // share + bar + ops + gaps
  const noteW = clamp(8, cols - cmdW - fixedC, 200);

  // Report is prose: it wraps to the panel width (less a small margin so the
  // detail's 6-space indent never pushes against the edge).
  const reportW = clamp(20, cols - 2, 120);

  return {
    maxRows,
    cols,
    patterns: { pat: patW, cmds: cmdsW },
    commandMix: { cmd: cmdW, note: noteW },
    report: { width: reportW },
  };
};
