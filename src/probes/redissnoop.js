// BPF data layer — the only BPF-aware module. It loads the program,
// subscribes to the completed-command ring buffer, and exposes plain reactive
// signals. The job this tool serves: show what an app is actually doing to
// Redis — hot key patterns, command mix, and footguns — so it aggregates the
// stream rather than just listing it.
//
//   kernel -> user : one ring-buffer subscription (in `agg`) feeds every
//                    aggregate; window timers publish snapshots. Built with
//                    from() so the subscription's lifecycle follows the UI.
import { RingBuf } from "yeet:bpf";
import { from } from "yeet:tui";
import { _ } from "yeet:helpers";
import { control } from "@/probes/probe.js";
import { NOISE, footgunOf, isRealVerb, isWrite, keyPattern } from "@/lib/classify.js";

const WINDOW_MS = 1000; // rate window
const FEED = 300; // recent commands kept for the live feed view
const KEYS_PER_PATTERN_CAP = 2000; // distinct concrete keys tracked per pattern
const TOP_N = 8; // top commands / keys surfaced in a drill-down

const ring = new RingBuf(control, "events");

// A kernel char[] arrives as a JS string or a byte array; trim at first NUL.
const cstr = (c) => {
  if (typeof c === "string") return c.replace(/\0.*$/s, "");
  if (!c) return "";
  let s = "";
  for (const b of c) { if (b === 0) break; s += String.fromCharCode(b); }
  return s;
};

// Shared mutable aggregation state, all fed by the single subscription below.
// Components read the published signals, never this.
const byPattern = new Map(); // pattern -> { count, reads, writes, cmds:Set }
const byCmd = new Map();     // verb    -> { count }
const feed = [];             // recent raw commands, newest first
let seq = 0;                 // monotonic row id + total accepted count
let rateMark = 0;            // seq at the last rate tick
let curRate = 0;             // commands/sec from the last window

// Published signals.
export const patterns = from((state) => bindAgg(state, "patterns"), []);
export const commandMix = from((state) => bindAgg(state, "commandMix"), []);
export const stats = from((state) => bindAgg(state, "stats"), { rate: 0, total: 0, footguns: 0 });
export const commands = from((state) => bindAgg(state, "commands"), []);

// One subscription, many watchers. Each from() registers a publisher; the
// first to be watched starts the shared ring subscription, the last to be
// unwatched stops it. We keep a refcount so the stream lives exactly as long
// as something is on screen.
let sub = null;
let refs = 0;
const publishers = { patterns: null, commandMix: null, stats: null, commands: null };

function recompute() {
  const total = seq || 1;
  const topN = (map, n) =>
    [...map.entries()]
      .map(([k, v]) => ({ k, v }))
      .sort((a, b) => b.v - a.v)
      .slice(0, n);
  publishers.patterns?.set(
    [...byPattern.entries()]
      .map(([pat, p]) => ({
        pat,
        count: p.count,
        share: (p.count / total) * 100,
        reads: p.reads,
        writes: p.writes,
        cmds: [...p.cmds.keys()],
        // Drill-down payload (cheap to carry; the UI shows it only when the
        // row is expanded).
        topCmds: topN(p.cmds, TOP_N),
        topKeys: topN(p.keys, TOP_N),
        distinctKeys: p.keys.size + (p.keysOverflow ? p.keysOverflow : 0),
        keysCapped: !!p.keysOverflow,
      }))
      .sort((a, b) => b.count - a.count),
  );
  let footguns = 0;
  const mix = [...byCmd.entries()]
    .map(([cmd, c]) => {
      const note = footgunOf(cmd);
      if (note) footguns += c.count;
      return {
        cmd,
        count: c.count,
        share: (c.count / total) * 100,
        footgun: note,
        // Drill-down: which patterns/keys this verb hits.
        topPats: topN(c.pats, TOP_N),
        topKeys: topN(c.keys, TOP_N),
      };
    })
    .sort((a, b) => b.count - a.count);
  publishers.commandMix?.set(mix);
  publishers.stats?.set({ rate: curRate, total: seq, footguns });
}

function bindAgg(state, which) {
  publishers[which] = state;
  refs++;
  if (!sub) {
    sub = ring.subscribe((w) => {
      const e = w?.redis_event ?? w;
      if (!e) return;
      const cmd = cstr(e.cmd) || "?";
      if (!isRealVerb(cmd) || NOISE.has(cmd)) return; // drop noise + bad frames
      const key = cstr(e.key);
      seq++;

      const pat = keyPattern(key);
      let p = byPattern.get(pat);
      if (!p) {
        p = { count: 0, reads: 0, writes: 0, cmds: new Map(), keys: new Map() };
        byPattern.set(pat, p);
      }
      p.count++;
      if (isWrite(cmd)) p.writes++; else p.reads++;
      // Per-command tally within this pattern (for the drill-down).
      p.cmds.set(cmd, (p.cmds.get(cmd) || 0) + 1);
      // Top concrete keys within this pattern. Bound the distinct-key map so a
      // high-cardinality pattern (user:*) can't grow without limit: once full,
      // only count keys we're already tracking.
      if (key) {
        if (p.keys.has(key)) p.keys.set(key, p.keys.get(key) + 1);
        else if (p.keys.size < KEYS_PER_PATTERN_CAP) p.keys.set(key, 1);
        else p.keysOverflow = (p.keysOverflow || 0) + 1;
      }

      let c = byCmd.get(cmd);
      if (!c) { c = { count: 0, pats: new Map(), keys: new Map() }; byCmd.set(cmd, c); }
      c.count++;
      // Which key patterns / concrete keys this verb runs against — the
      // inverse of the patterns drill-down. Bound the key map like above.
      c.pats.set(pat, (c.pats.get(pat) || 0) + 1);
      if (key) {
        if (c.keys.has(key)) c.keys.set(key, c.keys.get(key) + 1);
        else if (c.keys.size < KEYS_PER_PATTERN_CAP) c.keys.set(key, 1);
      }

      feed.unshift({ id: seq, cmd, key, comm: cstr(e.comm), pid: Number(e.pid) });
      if (feed.length > FEED) feed.pop();
      publishers.commands?.set(feed.slice());
    });
  }

  // Window timer drives the rate and republishes the aggregates. One timer
  // per watcher is fine (cheap), and each cleans itself up.
  const h = setInterval(() => {
    if (which === "stats") {
      curRate = (seq - rateMark) / (WINDOW_MS / 1000);
      rateMark = seq;
    }
    recompute();
  }, which === "stats" ? WINDOW_MS : 500);

  return () => {
    clearInterval(h);
    publishers[which] = null;
    if (--refs === 0 && sub) { sub.then(_.unsubscribe()); sub = null; }
  };
}

// Reset accumulated aggregates (bound to a key in the UI) so an engineer can
// clear the slate and watch a specific operation's footprint from zero.
export function reset() {
  byPattern.clear();
  byCmd.clear();
  feed.length = 0;
  seq = 0;
  rateMark = 0;
  recompute();
}
