// Report analysis — the opinionated layer. Turns the raw aggregates into a
// ranked list of findings: the things a developer opening this tool is
// probably looking for. Pure: takes the patterns + command-mix snapshots and
// returns findings; no signals, no BPF.
//
// A finding only earns a place if it's a JUDGMENT, not a restatement of the
// data the other tabs already show. Each is rated by severity so the most
// actionable sit at the top. Heuristics are deliberately conservative — a
// false alarm costs more trust than a missed nuance.
//
// Finding = { sev: "warn"|"info"|"ok", title, detail }

import { footgunOf } from "@/lib/classify.js";

const SEV = { warn: 0, info: 1, ok: 2 }; // sort order

// Thresholds tuned to be meaningful, not noisy.
const DOMINANT_SHARE = 35;   // one pattern this much of traffic = concentration
const HIGH_CARDINALITY = 200; // distinct keys in a pattern = churn/cache concern
const HOTKEY_SHARE = 60;      // one concrete key this much of its pattern = hot key
const FOOTGUN_SHARE = 1;      // a footgun verb even at 1% is worth flagging

export function analyze(patterns, mix, totals) {
  const findings = [];
  const total = totals.total || 0;

  if (total < 20) {
    findings.push({ sev: "info", title: "Not enough traffic yet", detail: "Send more Redis commands (over TCP) for a meaningful read." });
    return findings;
  }

  // 1) Footgun commands actually in use — the headline risk.
  for (const c of mix) {
    const note = footgunOf(c.cmd);
    if (note && c.share >= FOOTGUN_SHARE) {
      // Enrich with where it's aimed, if the drill-down is present.
      const where = (c.topPats && c.topPats[0]) ? ` mostly on ${c.topPats[0].k}` : "";
      findings.push({
        sev: "warn",
        title: `${c.cmd} in use — ${note}`,
        detail: `${c.share.toFixed(1)}% of traffic (${c.count} ops)${where}.`,
      });
    }
  }

  // 2) A single key pattern dominating traffic — concentration / hot path.
  // Find the max-share pattern rather than trusting input order.
  const top = patterns.reduce((m, p) => (!m || p.share > m.share ? p : m), null);
  if (top && top.share >= DOMINANT_SHARE) {
    findings.push({
      sev: "info",
      title: `${top.pat} is ${top.share.toFixed(0)}% of all Redis traffic`,
      detail: `${top.count} ops via ${top.cmds.slice(0, 4).join(", ")}. This pattern is your hot path — optimize here first.`,
    });
  }

  // 3) High-cardinality patterns — many distinct keys, classic churn / cache
  //    pressure / missing-TTL smell.
  for (const p of patterns) {
    if (p.distinctKeys >= HIGH_CARDINALITY) {
      findings.push({
        sev: "info",
        title: `${p.pat} spans ${p.distinctKeys}${p.keysCapped ? "+" : ""} distinct keys`,
        detail: `High cardinality (${p.cmds.slice(0, 3).join(", ")}). Check eviction/TTL — this can be cache churn or unbounded growth.`,
      });
    }
  }

  // 4) A single concrete key dominating its pattern — a genuine hot key that
  //    pattern-level numbers hide. Only meaningful when the pattern spans
  //    SEVERAL keys: a single-key pattern (a counter like `pageviews`) is
  //    100% "one key" by definition and isn't a hot-key problem.
  for (const p of patterns) {
    const top1 = p.topKeys && p.topKeys[0];
    if (top1 && p.count >= 20 && p.distinctKeys >= 5) {
      const keyShare = (top1.v / p.count) * 100;
      if (keyShare >= HOTKEY_SHARE) {
        findings.push({
          sev: "warn",
          title: `Hot key: ${top1.k}`,
          detail: `${keyShare.toFixed(0)}% of all ${p.pat} ops hit this one key (${top1.v} ops). A single hot key can bottleneck a shard.`,
        });
      }
    }
  }

  // 5) Write-heavy counter patterns — candidates for batching / write-back.
  for (const p of patterns) {
    const t = p.reads + p.writes || 1;
    if (p.writes / t > 0.9 && p.count >= 30 && p.distinctKeys <= 3) {
      findings.push({
        sev: "info",
        title: `${p.pat} is write-only (${p.count} writes)`,
        detail: `Concentrated writes to few keys — consider batching/pipelining or a write-back buffer to cut round trips.`,
      });
    }
  }

  // If nothing fired, say so plainly — silence reads as "broken".
  if (!findings.length) {
    findings.push({ sev: "ok", title: "Nothing alarming", detail: "No footguns, hot keys, or runaway patterns in this window. Traffic looks healthy." });
  }

  return findings.sort((a, b) => SEV[a.sev] - SEV[b.sev]);
}
