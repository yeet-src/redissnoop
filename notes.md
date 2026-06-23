# redissnoop README — handoff

## ✅ Reviewer action items

- [ ] Apply the About description (see below)
- [ ] Apply the topic tags (see below)
- [ ] Add the demo asset at `assets/redissnoop.gif` (the README references it; the GIF is the planned Reddit demo)
- [ ] Resolve flagged claims:
  - [ ] Confirm the OpenSSL-only / static-TLS-invisible caveat wording (grounding 2) against the implementation
  - [ ] Confirm the "safe in production" FAQ answer (grounding 3) reflects what the team is comfortable claiming publicly
- [ ] Add a LICENSE file — the repo has none, and the README states Dual BSD/GPL for the BPF program; add a matching top-level LICENSE
- [ ] Confirm the GitHub repo path: README quick-start uses `github:yeet-src/redissnoop`, but this is currently a personal project. If it ships under a different org/user, update the `yeet run github:...` line and the UTM `utm_campaign` stays `redissnoop`

## About description

> Live, zero-config Redis traffic profiler built on eBPF. Reads plaintext and TLS, no app changes.

(112 characters — under GitHub's ~120 truncation.)

## Topic tags

```
redis ebpf observability linux tcpdump networking uprobes tls bpf socket-tracing zero-instrumentation key-patterns yeet
```

Category language carried across the corpus: `ebpf`, `observability`, `networking`, `uprobes`, `zero-instrumentation`. The rest (`redis`, `tls`, `tcpdump`, `key-patterns`) are the script-specific retrieval terms.

## Flagged for review (grounding ≥ 2)

- **OpenSSL-only encrypted capture / static-TLS invisible** (Honest caveats, grounding 2). Safe inference from how the uprobe attaches to `libssl`, and the SSL_write experiment proved dynamic-OpenSSL works. The BoringSSL/static-link gap is reasoned, not directly tested. Confirm before publishing.
- **"Safe to run against production"** (FAQ, grounding 3). The passive/no-load claim is grounded (the capture path is read-only eBPF). The "treat output like query metadata" framing is a judgment call about how to position a tool that reads keys. Confirm the public stance.
- **License** (grounding 1, not a flag) — `Dual BSD/GPL` is read directly from the BPF source's `SEC("license")`. Included for completeness; no review needed beyond adding the LICENSE file.

## Template-level observations

- This README went under a **personal** project, not the standard `yeet-src` repo flow. The quick-start `github:yeet-src/redissnoop` and the UTM scheme assume eventual publication under yeet-src; if it stays personal, the install shorthand and the "Built with yeet" footer framing should be revisited.
- The dual-source (plaintext + TLS) capture is unusual versus prior single-source snoops. The badge taxonomy has no `redis`/`database` category; used `networking` (matches the `tcp_*` + socket primitives). If the 30-day series produces several DB-flavored snoops (pgsnoop, memsnoop), consider proposing a `database` category as a deliberate taxonomy edit.
