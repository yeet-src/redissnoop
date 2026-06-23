// Shared BPF object. The single src/bpf/redissnoop.bpf.c unit is linked into
// bin/probe.bpf.o and loaded once here; the redissnoop data layer imports
// this `control` and attaches its maps. All binds must happen before the
// single start(), so they live together here.
import { BpfObject } from "yeet:bpf";

// `base: import.meta.dirname` resolves against the running bundle.
const probe = new BpfObject({ exe: "../bin/probe.bpf.o", base: import.meta.dirname });

export const control = await probe
  .bind("events", { kind: "ring_buf", btf_struct: "redis_event" }) // completed-command stream
  .bind("probe.data", { kind: "data" }) // min_latency_us knob (.data section)
  .start(); // the kprobes auto-attach

export const numCpus = system.numCpus;
