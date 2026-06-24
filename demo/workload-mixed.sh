#!/usr/bin/env bash
# Mixed-traffic demo driver — generates BOTH plaintext and TLS Redis traffic
# at once, so redissnoop visibly captures encrypted AND unencrypted in one
# view. This is the Reddit-GIF driver: the titlebar's "🔒 N encrypted + ∿ N
# plaintext" both climb, and rows get tagged by source.
#
#   plaintext → 127.0.0.1:6379  (seen by the TCP-layer probe)
#   TLS       → 127.0.0.1:6380  (seen ONLY via the SSL_write uprobe)
#
# Prereqs: a plaintext redis on 6379 and a TLS redis on 6380 (demo/tls-up.sh).
set -uo pipefail
PLAIN_PORT="${PLAIN_PORT:-6379}"
TLS_PORT="${TLS_PORT:-6380}"
CERTS="${CERTS:-$HOME/tls-redis/certs}"

P() { redis-cli -h 127.0.0.1 -p "$PLAIN_PORT" "$@" >/dev/null 2>&1; }
T() { redis-cli --tls --cert "$CERTS/redis.crt" --key "$CERTS/redis.key" --cacert "$CERTS/ca.crt" -h 127.0.0.1 -p "$TLS_PORT" "$@" >/dev/null 2>&1; }

echo "mixed traffic: plaintext :$PLAIN_PORT + TLS :$TLS_PORT  (Ctrl-C to stop)"
trap 'echo; echo stopped; exit 0' INT

rnd() { echo $((RANDOM % $1)); }

while true; do
  # --- plaintext side (the "easy" traffic) ---
  P GET "user:$(rnd 500)"
  P SET "user:$(rnd 500)" "v$RANDOM"
  P INCR "pageviews"
  P HGETALL "session:$(rnd 50)"
  [ $((RANDOM % 5)) -eq 0 ] && P LPUSH "feed:home" "post:$RANDOM"

  # --- TLS side (the "hard" traffic — only the uprobe can read this) ---
  T GET "cart:$(rnd 300)"
  T SADD "cart:$(rnd 300)" "sku:$(rnd 500)"
  T INCR "orders:count"
  T HSET "checkout:$(rnd 80)" step "pay" amt "$((RANDOM % 9999))"
  [ $((RANDOM % 6)) -eq 0 ] && T SMEMBERS "cart:$(rnd 300)"  # footgun, over TLS

  sleep "0.0$((RANDOM % 5))"
done
