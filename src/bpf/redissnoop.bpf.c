// redissnoop — "tcpdump for your Redis queries".
//
// Watches the Redis wire protocol (RESP) at the socket layer with zero
// application instrumentation, and measures per-command latency.
//
// How it works, both kprobes on the same socket:
//   tcp_sendmsg(sk, msg, size)   — a command goes out. We copy the first
//                                  bytes of the outgoing buffer, parse the
//                                  RESP command name, and stash {ts, cmd}
//                                  keyed by the `sock *`.
//   tcp_cleanup_rbuf(sk, copied) — the reply has been consumed. We look up
//                                  the stashed request on this socket, take
//                                  now - ts as the round-trip latency, emit
//                                  one event, and clear the entry.
//
// RESP is plaintext and length-prefixed, so the first frame of a request is
// parseable in BPF without reassembling the stream. This is the v1 tradeoff:
// it sees UNENCRYPTED Redis traffic (the common local/VPC case). TLS hides
// the payload at this layer — that's the uprobe story for a later version.
//
// The runtime knob `min_latency_us` is the kernel-side filter: userspace
// patches it (via DataSec) and we only emit commands at least that slow —
// the "slow query" floor, done in the kernel so the ring buffer stays calm.
#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_core_read.h>
#include <bpf/bpf_tracing.h>

char LICENSE[] SEC("license") = "Dual BSD/GPL";

#define TASK_COMM_LEN 16
#define CMD_LEN       16 // longest Redis verb we keep (e.g. "GETRANGE")
#define KEY_LEN       32 // first argument (the key), truncated
#define PEEK_LEN      64 // bytes of the request buffer we copy to parse

// Slow-query floor in microseconds, patched live from the UI. Default 0:
// emit everything until the user raises the bar. Kept in .data (volatile,
// referenced) so the bound section stays `<obj>.data`. Must match
// `minLatency`'s initial value in probes/redissnoop.js.
volatile __u64 min_latency_us = 0;

// How a command was observed. The whole point of the demo: we capture both.
#define SRC_WIRE 0 // TCP-layer probe — sees all plaintext traffic, any client
#define SRC_TLS  1 // SSL_write uprobe — reads INSIDE encrypted connections

// One observed Redis command, streamed to userspace.
struct redis_event {
	__u32 pid;
	__u32 lat_us;             // request -> reply round trip (wire path only)
	__u32 req_bytes;          // request size
	__u32 source;             // SRC_WIRE | SRC_TLS
	char comm[TASK_COMM_LEN]; // client process
	char cmd[CMD_LEN];        // RESP command verb, uppercased
	char key[KEY_LEN];        // first argument, best-effort
};

// Force BTF emission so the daemon resolves btf_struct: "redis_event".
struct redis_event *_unused_event __attribute__((unused));

struct {
	__uint(type, BPF_MAP_TYPE_RINGBUF);
	__uint(max_entries, 256 * 1024);
} events SEC(".maps");

// In-flight request per socket: the verb, key, and the timestamp we'll
// subtract from the reply. Keyed by the kernel `sock *` pointer.
struct inflight {
	__u64 ts;
	__u32 pid;
	__u32 req_bytes;
	char comm[TASK_COMM_LEN];
	char cmd[CMD_LEN];
	char key[KEY_LEN];
};

struct {
	__uint(type, BPF_MAP_TYPE_HASH);
	__uint(max_entries, 16384);
	__type(key, __u64);   // (__u64)sock *
	__type(value, struct inflight);
} inflight SEC(".maps");

// Uppercase an ASCII byte in place; leaves non-letters untouched.
static __always_inline char upper(char c)
{
	return (c >= 'a' && c <= 'z') ? (char)(c - 32) : c;
}

// Parse a RESP request preamble into cmd/key.
//
// A Redis client request is an array of bulk strings:
//   *2\r\n$3\r\nGET\r\n$3\r\nfoo\r\n
// We don't fully tokenize in the kernel — we walk just far enough to lift
// the first bulk string (the verb) and, if present, the second (the key).
// The caller guarantees buf starts with the array header '*'.
static __always_inline void parse_resp(const char *buf, int len, struct inflight *fl)
{
	int i = 0;

	// Skip the array header `*<n>\r\n` if present.
	if (len > 0 && buf[0] == '*') {
		#pragma unroll
		for (int s = 0; s < 8; s++) {
			if (i >= len) return;
			char c = buf[i++];
			if (c == '\n') break;
		}
	}

	// Skip a bulk-string header `$<n>\r\n`.
	if (i < len && buf[i] == '$') {
		#pragma unroll
		for (int s = 0; s < 8; s++) {
			if (i >= len) return;
			char c = buf[i++];
			if (c == '\n') break;
		}
	}

	// Copy the verb (until CR/LF or CMD_LEN), uppercased.
	#pragma unroll
	for (int j = 0; j < CMD_LEN - 1; j++) {
		if (i >= len) break;
		char c = buf[i];
		if (c == '\r' || c == '\n') break;
		fl->cmd[j] = upper(c);
		i++;
	}

	// Step over the verb's trailing CRLF.
	#pragma unroll
	for (int s = 0; s < 2; s++) {
		if (i < len && (buf[i] == '\r' || buf[i] == '\n')) i++;
	}

	// Skip the key's bulk-string header `$<n>\r\n`.
	if (i < len && buf[i] == '$') {
		#pragma unroll
		for (int s = 0; s < 8; s++) {
			if (i >= len) return;
			char c = buf[i++];
			if (c == '\n') break;
		}
	}

	// Copy the key (first argument), best-effort.
	#pragma unroll
	for (int j = 0; j < KEY_LEN - 1; j++) {
		if (i >= len) break;
		char c = buf[i];
		if (c == '\r' || c == '\n') break;
		fl->key[j] = c;
		i++;
	}
}

SEC("kprobe/tcp_sendmsg")
int BPF_KPROBE(on_sendmsg, struct sock *sk, struct msghdr *msg, size_t size)
{
	// Pull the first PEEK_LEN bytes of the outgoing buffer out of the
	// iov_iter. Modern kernels store a single user buffer inline as
	// ITER_UBUF (ptr in `ubuf`); a classic iovec array is ITER_IOVEC
	// (ptr in `__iov->iov_base`). redis-cli's write() lands as UBUF, so
	// we must handle both. This is the one fragile read in v1.
	__u8 itype = BPF_CORE_READ(msg, msg_iter.iter_type);
	const void *base = NULL;
	if (itype == ITER_UBUF) {
		base = BPF_CORE_READ(msg, msg_iter.ubuf);
	} else if (itype == ITER_IOVEC) {
		const struct iovec *iov = BPF_CORE_READ(msg, msg_iter.__iov);
		if (iov) base = BPF_CORE_READ(iov, iov_base);
	}
	if (!base) return 0;

	char buf[PEEK_LEN] = {};
	long n = bpf_probe_read_user(buf, sizeof(buf), base);
	if (n != 0) return 0;

	// Only track a proper RESP array request (`*<n>\r\n$...`). Every real
	// client library and redis-cli sends this form. We deliberately DON'T
	// accept the inline form (a bare leading letter): a TCP segment that
	// splits mid-request can start with a letter, and parsing that as a
	// command produces garbage rows (e.g. a key fragment shown as a verb).
	// Requiring `*` is the single most important correctness guard here.
	if (buf[0] != '*') return 0;

	struct inflight fl = {};
	fl.ts = bpf_ktime_get_ns();
	fl.pid = bpf_get_current_pid_tgid() >> 32;
	fl.req_bytes = (__u32)size;
	bpf_get_current_comm(&fl.comm, sizeof(fl.comm));
	parse_resp(buf, PEEK_LEN, &fl);

	// Drop unless we lifted an all-alphabetic verb — a real Redis command is
	// letters only, so this rejects anything the parser misread.
	char v0 = fl.cmd[0];
	if (!((v0 >= 'A' && v0 <= 'Z'))) return 0;

	__u64 key = (__u64)sk;
	bpf_map_update_elem(&inflight, &key, &fl, BPF_ANY);
	return 0;
}

// The reply is "seen" on the first tcp_cleanup_rbuf with copied > 0. The
// kernel also calls tcp_cleanup_rbuf with copied == 0 right after the send
// (on the ACK), which we must skip — otherwise a blocking command (KEYS *,
// DEBUG SLEEP) mis-measures as microseconds instead of its true round trip.
// The inflight entry is deleted on this first real reply, so the many
// follow-on cleanups for a large reply don't double-count.
SEC("kprobe/tcp_cleanup_rbuf")
int BPF_KPROBE(on_recv, struct sock *sk, int copied)
{
	if (copied <= 0) return 0; // ACK-time cleanup, no payload — not the reply

	__u64 key = (__u64)sk;
	struct inflight *fl = bpf_map_lookup_elem(&inflight, &key);
	if (!fl) return 0; // reply with no request we tracked

	__u64 lat_ns = bpf_ktime_get_ns() - fl->ts;
	__u64 lat_us = lat_ns / 1000;

	if (lat_us < min_latency_us) {
		bpf_map_delete_elem(&inflight, &key);
		return 0;
	}

	struct redis_event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
	if (!e) {
		bpf_map_delete_elem(&inflight, &key);
		return 0; // ring full — drop is the backpressure
	}
	e->pid = fl->pid;
	e->lat_us = (__u32)lat_us;
	e->req_bytes = fl->req_bytes;
	e->source = SRC_WIRE;
	__builtin_memcpy(e->comm, fl->comm, sizeof(e->comm));
	__builtin_memcpy(e->cmd, fl->cmd, sizeof(e->cmd));
	__builtin_memcpy(e->key, fl->key, sizeof(e->key));
	bpf_ringbuf_submit(e, 0);

	bpf_map_delete_elem(&inflight, &key);
	return 0;
}

// --- TLS path: read plaintext RESP at SSL_write, before encryption. -------
// Same parse as the wire path, but the buffer comes straight from the app via
// the uprobe, so it works through TLS. Requests only (client SSL_write); we
// tag them SRC_TLS and emit immediately (no round-trip latency on this path).
// Proven against a live TLS Redis — see experiments/FINDINGS.md.
SEC("uprobe/SSL_write")
int BPF_KPROBE(on_ssl_write, void *ssl, const void *buf, int num)
{
	if (!buf || num <= 0) return 0;

	char tmp[PEEK_LEN] = {};
	if (bpf_probe_read_user(tmp, sizeof(tmp), buf) != 0) return 0;
	if (tmp[0] != '*') return 0; // only RESP array requests (skip replies)

	struct inflight fl = {};
	fl.pid = bpf_get_current_pid_tgid() >> 32;
	fl.req_bytes = (__u32)num;
	bpf_get_current_comm(&fl.comm, sizeof(fl.comm));
	parse_resp(tmp, PEEK_LEN, &fl);

	char v0 = fl.cmd[0];
	if (!(v0 >= 'A' && v0 <= 'Z')) return 0;

	struct redis_event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
	if (!e) return 0;
	e->pid = fl.pid;
	e->lat_us = 0; // not measured on the TLS path in this build
	e->req_bytes = fl.req_bytes;
	e->source = SRC_TLS;
	__builtin_memcpy(e->comm, fl.comm, sizeof(e->comm));
	__builtin_memcpy(e->cmd, fl.cmd, sizeof(e->cmd));
	__builtin_memcpy(e->key, fl.key, sizeof(e->key));
	bpf_ringbuf_submit(e, 0);
	return 0;
}
