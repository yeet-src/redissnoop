// Shared BPF object. The single src/bpf/redissnoop.bpf.c unit is linked into
// bin/probe.bpf.o and loaded once here; the redissnoop data layer imports
// this `control` and attaches its maps. All binds/attaches happen before the
// single start().
//
// Two capture programs feed one ring buffer, each tagging its events:
//   on_recv (kprobe, auto-attached) — TCP-layer, SRC_WIRE: all plaintext.
//   on_ssl_write (uprobe on libssl) — SRC_TLS: reads INSIDE encrypted conns.
// Both types of traffic, the easy and the hard, in one stream.
import { BpfObject } from "yeet:bpf";

// `base: import.meta.dirname` resolves against the running bundle.
const probe = new BpfObject({ exe: "../bin/probe.bpf.o", base: import.meta.dirname });

let builder = probe
  .bind("events", { kind: "ring_buf", btf_struct: "redis_event" }) // unified stream
  .bind("probe.data", { kind: "data" }); // min_latency_us knob (.data section)

// Attach the TLS uprobe to OpenSSL. Best-effort: if libssl isn't present (or
// attach fails), the wire path still works, so the dashboard degrades to
// plaintext-only rather than failing to start.
export let tlsActive = false;
try {
  builder = builder.attach("on_ssl_write", {
    kind: "uprobe",
    binary: "libssl.so",
    symbol: "SSL_write",
  });
  tlsActive = true;
} catch {
  tlsActive = false;
}

export const control = await builder.start(); // kprobe auto-attaches; uprobe per the spec

export const numCpus = system.numCpus;
