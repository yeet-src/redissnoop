# redissnoop

A yeet script: a reactive JSX TUI bundled with esbuild, an `@/` source
alias, and a BPF program — all driven by one `make`.

The starter is **cpusched**: a live scheduler dashboard. The top is a
cores × time heatmap of context-switch rate (one row per CPU, newest column
on the right); pick a CPU (arrows or click) to watch its `prev → next` task
feed; and a log2 histogram tracks run-queue latency. It's a small but
complete tour of the layout and of yeet's reactive BPF.

## Reactive, both ways + both egress patterns

- **kernel → user, streamed** — `probes/cpusched.js` builds the `cpus`
  signal with `from(state => { …events.subscribe…; return cleanup })`: a
  ring-buffer subscription expressed as a reactive signal whose lifecycle is
  tied to the UI watching it. A window timer turns the stream into per-CPU
  rates, histories, and feeds.
- **kernel → user, polled** — `probes/runqlat.js` reads a histogram the
  kernel aggregates in an array map (`ArrayMap.lookup` on a timer) — the
  other egress pattern. Its program lives in a second `.bpf.c`.
- **user → kernel** — `+`/`-` call `setMinSlice()`, which `DataSec.patch()`es
  the `min_slice_ns` global in the *running* program's `.data` section. The
  kernel then only emits switches whose outgoing task ran that long — a filter
  you cannot do in userspace, since JS only sees events the kernel emitted.

## Two BPF programs, one object

`src/bpf/*.bpf.c` are independent units that `bpftool gen object` links into
one `bin/probe.bpf.o`: `cpusched.bpf.c` (the sched_switch stream + the knob)
and `runqlat.bpf.c` (wakeup→on-CPU latency). Add another `.bpf.c` and it's
linked in automatically — keep `char LICENSE[]` in exactly one unit, and
give each program a unique name. `probes/probe.js` loads the object once and
shares its `control`; each probe module attaches its own maps.

## Layout

```
Makefile              build frontend — orchestrates the two compilers
build/bpf.mk          clang + bpftool rules: src/bpf/*.bpf.c -> bin/probe.bpf.o
build/gen-vmlinux.sh  generates src/bpf/include/vmlinux.h from kernel BTF
package.json          esbuild bundle script + npm deps
tsconfig.json         `#/` -> project root, `@/` -> ./src path aliases
src/main.jsx          entry — composition root: input + mount
src/probes/probe.js   loads the shared BPF object (binds maps, start())
src/probes/cpusched.js  sched_switch stream → signals + the DataSec knob
src/probes/runqlat.js   polls the run-queue-latency histogram map
src/components/*.jsx   pure UI: titlebar, heatmap, detail, histogram, footer
src/lib/format.js     pure render helpers (rate, duration, heat color)
src/bpf/cpusched.bpf.c  sched_switch program + the runtime knob
src/bpf/runqlat.bpf.c   wakeup→on-CPU latency histogram
bin/                  the linked BPF object lands here
```

The JS is layered: `probes/` is the only BPF-aware code (it owns the object
and exposes plain signals), `components/` is pure presentation that reads
those signals, and `lib/` is pure helpers. They reference each other through
the `@/` alias; `main.jsx` wires them together and owns input.

## Build & run

```sh
make           # compile BPF (clang + bpftool) + bundle JS (esbuild)
yeet run .     # runs the bundled src/index.jsx (needs root for BPF)
```

`make` runs two independent compilers: **clang + bpftool** compile
`src/bpf/*.bpf.c` and link them into one loadable object `bin/probe.bpf.o`;
**esbuild** bundles `src/main.jsx` into `src/index.jsx`, inlining npm deps and
the `@/` alias and leaving `yeet:*` builtins external.

The data layer loads the object at runtime:

```js
const probe = new BpfObject({ exe: "../bin/probe.bpf.o", base: import.meta.dirname });
const control = await probe
  .bind("events", { kind: "ring_buf", btf_struct: "sched_event" })
  .bind("probe.data", { kind: "data" })   // the .data section that holds the knob
  .start();                                // the tracepoint auto-attaches
```

`base: import.meta.dirname` resolves the path against the running bundle.
`probe.data` is libbpf's name for this object's `.data` section (confirm with
`bpftool btf dump file bin/probe.bpf.o` if you rename things).

`#/` (project root) and `@/` (source root) are **bundle-time aliases** that
esbuild resolves via tsconfig `paths`; the runtime resolver doesn't know them,
which is why the BPF object is located with `import.meta.dirname`.

## npm / jsr packages

Add dependencies to `package.json` and import them normally; esbuild inlines
them at bundle time. Only packages that run in bare V8 work — no Node builtins
(`fs`, `net`, …), and no `Intl` / `TextEncoder` / `TextDecoder`.

## Pure-JS scripts

Don't need BPF? Delete `src/bpf/`, `bin/`, and `src/probes/cpusched.js`, then
feed the components from any source that exposes the same signals.

## Prerequisites

- `clang` and `bpftool` (for the BPF leg; `bpftool` generates
  `src/bpf/include/vmlinux.h` from the host kernel, which needs `CONFIG_DEBUG_INFO_BTF`)
- `node` + `npm` at build time for esbuild (authoring only — not needed on
  hosts that merely *run* the built project)
