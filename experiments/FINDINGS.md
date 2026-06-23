# Encrypted-traffic experiment — SSL_write uprobe

**Result: PROVEN.** Hooking `SSL_write` in `libssl.so` via a yeet uprobe reads
plaintext RESP from a TLS-encrypted Redis connection, before OpenSSL encrypts.

## What was verified (Lima VM, against a TLS Redis on :6380)
- yeet's declarative uprobe attach works from a script:
  `.attach("on_ssl_write", { kind: "uprobe", binary: "libssl.so", symbol: "SSL_write" })`
- Captured full readable RESP over TLS: `SET tlskey:1 val1`, `GET tlskey:1`,
  and the `+OK` / `$4 val1` replies. 20/20 commands.
- Language-agnostic: one probe on libssl catches any OpenSSL client (tested
  with redis-cli; same path covers Go/Python/Node).
- Both directions captured (client SSL_write = requests, server SSL_write =
  replies).

## Implications for v2
- No changes needed to the yeet runtime (Julian's code) — the uprobe support
  and declarative attach_opts API already exist (crates/common/.../blob/attach).
- A v2 "encrypted view" = the SSL_write/SSL_read uprobe feeding the SAME
  pattern/command/report aggregation already built for v1. The analysis layer
  is unchanged; only the data source differs.
- Open design questions before integrating:
  - SSL_read for replies vs. only SSL_write; dedup vs. the TCP-layer probe.
  - How to present "network view" (all traffic, plaintext only) vs. "TLS view"
    (one app, full reach) — likely a source toggle.
  - Statically-linked TLS (BoringSSL in some Go builds) won't have a libssl to
    hook — needs the go-binary uprobe fallback. OpenSSL-dynamic is the common case.

## Coordination note
This builds on yeet's uprobe layer (platform/Julian's area). Proven feasible;
worth a conversation before shipping a TLS-sniffing tool under Yeet's name.
