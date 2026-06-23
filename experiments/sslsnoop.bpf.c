// EXPERIMENT (branch: encrypted-tls-ssl_write) — read plaintext Redis traffic
// at the TLS boundary by hooking SSL_write in libssl, BEFORE the bytes are
// encrypted. Proves the encrypted-traffic approach for a future redissnoop v2.
//
// SSL_write(SSL *ssl, const void *buf, int num): `buf` holds the plaintext the
// app is about to send (the RESP request). We copy the first bytes and emit
// them — if they read as RESP, the approach works regardless of TLS, for any
// app that encrypts through OpenSSL (Go, Python, Node, redis-cli, ...).
//
// This is a standalone proof, not wired into redissnoop. It lives on the
// experiment branch so it's recoverable; main has no SSL code.
#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

char LICENSE[] SEC("license") = "Dual BSD/GPL";

#define PEEK 64

struct ssl_event {
	__u32 pid;
	__u32 len;
	char comm[16];
	char data[PEEK];
};
struct ssl_event *_unused __attribute__((unused));

struct {
	__uint(type, BPF_MAP_TYPE_RINGBUF);
	__uint(max_entries, 256 * 1024);
} events SEC(".maps");

// arg0 = SSL*, arg1 = const void *buf, arg2 = int num
SEC("uprobe/SSL_write")
int BPF_KPROBE(on_ssl_write, void *ssl, const void *buf, int num)
{
	if (!buf || num <= 0) return 0;

	struct ssl_event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
	if (!e) return 0;
	e->pid = bpf_get_current_pid_tgid() >> 32;
	e->len = (__u32)num;
	bpf_get_current_comm(&e->comm, sizeof(e->comm));
	bpf_probe_read_user(&e->data, sizeof(e->data), buf);
	bpf_ringbuf_submit(e, 0);
	return 0;
}
