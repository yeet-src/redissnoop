/* redissnoop — see what your app is actually doing to Redis.
 *
 * A live, zero-config, zero-impact profiler for Redis access patterns, built
 * on eBPF: it watches the RESP wire protocol at the socket layer (no MONITOR,
 * no app changes, no load on the server) and aggregates it into the two views
 * an engineer actually needs when Redis is misbehaving:
 *
 *   key patterns — which key patterns (user:*, session:*) are most of your
 *                  traffic, with read/write split. Surfaces hot keys and
 *                  fan-out. (Tab)
 *   command mix  — per-verb share, with footgun flags on dangerous commands
 *                  (KEYS, FLUSHALL, HGETALL on big hashes, ...).
 *
 * Layout: probes/ (BPF-aware) → components/ (pure UI) → lib/ (pure helpers).
 *
 * Caveats (honest): sees UNENCRYPTED Redis over TCP only — TLS hides the
 * payload at this layer (future uprobe work). Per-command latency is NOT
 * shown in this build; the access-pattern job doesn't need it and the
 * kernel-side latency pairing is still being made accurate.
 */
import { Box, mount, signal } from "yeet:tui";
import { commandMix, flaggedCmds, patterns, reset, stats } from "@/probes/redissnoop.js";
import { layoutFor } from "@/lib/layout.js";
import TabBar, { TABS, tabAtColumn } from "@/components/tabbar.jsx";
import TitleBar from "@/components/titlebar.jsx";
import Report from "@/components/report.jsx";
import Patterns from "@/components/patterns.jsx";
import CommandMix from "@/components/commandmix.jsx";
import Flagged from "@/components/flagged.jsx";
import Footer from "@/components/footer.jsx";

const view = signal("report"); // "report" | "patterns" | "mix" — opens on Report

// The two table views own a cursor + expanded row each, so switching tabs
// doesn't scramble the other's state. Report has no accordion. `id` extracts
// a row's identity (pattern string / verb) for the expand toggle.
const VIEWS = {
  patterns: { rows: patterns, selected: signal(0), expanded: signal(null), hovered: signal(null), id: (r) => r.pat },
  mix: { rows: commandMix, selected: signal(0), expanded: signal(null), id: (r) => r.cmd },
  // Flagged is a live tail, not an accordion: instead of `expanded` it carries
  // `frozen` — null while tailing live, a snapshot array while paused so a row
  // holds still to be read. move()/toggle() special-case it.
  flagged: { rows: flaggedCmds, selected: signal(0), frozen: signal(null), hovered: signal(null) },
};
const active = () => VIEWS[view.get()]; // undefined for the report tab
const order = TABS.map((t) => t.id); // cycle order matches the tab bar

const move = (d) => {
  const v = active();
  if (!v) return; // report tab — nothing to move
  if (v.frozen) return moveFeed(v, d);
  const rows = v.rows.get();
  if (!rows.length) return;
  v.selected.set(Math.max(0, Math.min(rows.length - 1, v.selected.get() + d)));
};

// A live feed (the Flagged tail) runs live; the first ↓ pauses it on a frozen
// snapshot so a row can be read, and arrowing back above the top resumes it.
const moveFeed = (v, d) => {
  const live = v.rows.get();
  if (!live.length) return;
  if (!v.frozen.get() && d > 0) v.frozen.set(live); // pause on first ↓
  const list = v.frozen.get();
  if (!list) return; // still live — an ↑ at the top is a no-op
  const next = v.selected.get() + d;
  if (next <= 0) { v.selected.set(0); v.frozen.set(null); } // resume the tail
  else v.selected.set(Math.min(list.length - 1, next));
};

const toggle = () => {
  const v = active();
  if (!v) return;
  if (v.frozen) { // Flagged feed: Enter/Space pauses/resumes the live tail
    v.frozen.set(v.frozen.get() ? null : v.rows.get());
    v.selected.set(0);
    return;
  }
  const row = v.rows.get()[v.selected.get()];
  if (!row) return;
  const id = v.id(row);
  v.expanded.set(v.expanded.get() === id ? null : id);
};

// Pause/resume a live feed (the Flagged tail) — the `P` key. A no-op on the
// aggregate tabs, which have nothing to pause. Pausing snapshots the current
// feed and parks the cursor at the top so ↑/↓ can scroll the frozen rows.
const togglePause = () => {
  const v = active();
  if (!v?.frozen) return;
  v.frozen.set(v.frozen.get() ? null : v.rows.get());
  v.selected.set(0);
};

const cycle = (d) => {
  const i = order.indexOf(view.get());
  view.set(order[(i + d + order.length) % order.length]);
};

// Keyboard input is best-effort: when there's no attached TTY (piped output,
// no PTY), the `tty` global may be absent — the dashboard must still render,
// just without interactivity. Guard every registration so a missing `tty`
// never crashes module evaluation.
const onKey = (fn) => {
  try {
    if (typeof tty !== "undefined" && tty.on) tty.on("keydown", fn);
  } catch {}
};

onKey((e) => {
  const code = e.code;
  const k = (e.key ?? "").toLowerCase();
  if (code === "Escape" || k === "q") return yeet.exit();
  // Tab cycles forward, Shift+Tab back; number keys jump straight to a tab.
  if (code === "Tab" || k === "tab") return cycle(e.shiftKey ? -1 : 1);
  if (k === "1") return view.set("report");
  if (k === "2") return view.set("patterns");
  if (k === "3") return view.set("mix");
  if (k === "4") return view.set("flagged");
  if (k === "p") return togglePause();
  if (k === "r") return reset();
  // Accordion navigation applies to whichever table view is active.
  if (code === "ArrowUp" || k === "k") move(-1);
  else if (code === "ArrowDown" || k === "j") move(1);
  else if (code === "Enter" || code === "Space" || k === " " || k === "enter") toggle();
});

// Mouse: clicking a tab in the top row switches to it. Same best-effort TTY
// guard as the keyboard handlers — no PTY (piped output) means no mouse, and
// the dashboard still renders, just without click-to-switch. enableMouse turns
// on the terminal's mouse reporting; the runtime disables it again on teardown.
try {
  if (typeof tty !== "undefined" && tty.enableMouse) tty.enableMouse();
} catch {}

const onMouse = (fn) => {
  try {
    if (typeof tty !== "undefined" && tty.on) tty.on("mousedown", fn);
  } catch {}
};

onMouse((e) => {
  if (e.button !== 0) return; // left button only
  if (e.clientY !== 0) return; // the tab bar is the top row (y === 0)
  const id = tabAtColumn(e.clientX);
  if (id) view.set(id);
});

// Intercept Ctrl-C: a left-open monitor shouldn't die on a reflexive ^C.
// First press arms a confirm; a second within the window exits.
let armed = false;
onKey((e) => {
  if (!(e.ctrlKey && (e.key === "c" || e.code === "KeyC"))) return;
  if (typeof e.preventDefault === "function") e.preventDefault();
  if (armed) return yeet.exit();
  armed = true;
  setTimeout(() => { armed = false; }, 1500);
});

const Root = (size) => (
  <Box>
    <TabBar view={view} />
    <TitleBar stats={stats} view={view} />
    <Box height="1fr" overflow="hidden">
      {() => {
        const lay = layoutFor(size.get());
        const v = view.get();
        if (v === "report") {
          return <Report patterns={patterns} commandMix={commandMix} stats={stats} maxRows={lay.maxRows} width={lay.report.width} />;
        }
        if (v === "mix") {
          return (
            <CommandMix
              commandMix={commandMix}
              selected={VIEWS.mix.selected}
              expanded={VIEWS.mix.expanded}
              maxRows={lay.maxRows}
              widths={lay.commandMix}
            />
          );
        }
        if (v === "flagged") {
          return (
            <Flagged
              flaggedCmds={flaggedCmds}
              selected={VIEWS.flagged.selected}
              frozen={VIEWS.flagged.frozen}
              hovered={VIEWS.flagged.hovered}
              maxRows={lay.maxRows}
              widths={lay.flagged}
            />
          );
        }
        return (
          <Patterns
            patterns={patterns}
            selected={VIEWS.patterns.selected}
            expanded={VIEWS.patterns.expanded}
            hovered={VIEWS.patterns.hovered}
            maxRows={lay.maxRows}
            widths={lay.patterns}
          />
        );
      }}
    </Box>
    <Footer view={view} frozen={VIEWS.flagged.frozen} />
  </Box>
);

mount(Root);
await new Promise(() => {}); // keep the script alive; the TUI owns the screen
