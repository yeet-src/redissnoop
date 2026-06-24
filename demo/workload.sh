#!/usr/bin/env bash
# Realistic, multi-service Redis traffic — enough distinct key patterns and
# command variety that redissnoop's pattern list and per-pattern drill-downs
# have real depth. Models several app concerns at once: a web/session tier, a
# cache, counters, a cart/checkout flow, a social feed, rate-limiting, a job
# queue, and a leaderboard. Hot keys are deliberately hot so the share bars
# and "top keys" drill-down show a real skew.
#
# Run in its own shell while redissnoop watches; Ctrl-C to stop.
#
# IMPORTANT: -h 127.0.0.1 forces TCP (what redissnoop hooks). A bare
# `redis-cli` may use a Unix socket the kernel probes can't see.
set -uo pipefail
HOST="${REDIS_HOST:-127.0.0.1}"
R() { redis-cli -h "$HOST" "$@" >/dev/null 2>&1; }

echo "generating multi-service traffic to redis://$HOST  (Ctrl-C to stop)"
trap 'echo; echo stopped; exit 0' INT

# A pool of "hot" entities so a handful of concrete keys dominate their
# pattern (realistic: a few power users, one trending post, etc.).
HOT_USERS=(1 2 3 7 42)
HOT_POSTS=(post:1001 post:1002 post:9999)

rnd() { echo $((RANDOM % $1)); }
pick() { local arr=("$@"); echo "${arr[$((RANDOM % ${#arr[@]}))]}"; }

while true; do
  # --- session / auth tier ---
  sid="session:$(rnd 80)"
  R HGETALL "$sid"
  [ $((RANDOM % 3)) -eq 0 ] && R HSET "$sid" last_seen "$RANDOM" ua "chrome"
  [ $((RANDOM % 9)) -eq 0 ] && R EXPIRE "$sid" 1800

  # --- user cache (hot users skew the distribution) ---
  if [ $((RANDOM % 2)) -eq 0 ]; then u=$(pick "${HOT_USERS[@]}"); else u=$(rnd 5000); fi
  R GET "user:$u"
  [ $((RANDOM % 4)) -eq 0 ] && R SET "user:$u" "{\"n\":\"u$u\"}"
  R GET "user:profile:$u"

  # --- product catalog reads ---
  R GET "product:$(rnd 2000)"
  R HGETALL "product:meta:$(rnd 2000)"

  # --- counters / analytics ---
  R INCR "pageviews"
  R INCR "views:product:$(rnd 50)"
  R INCRBY "bytes:served" "$((RANDOM % 9000))"

  # --- cart / checkout flow ---
  cart="cart:$(rnd 300)"
  R SADD "$cart" "sku:$(rnd 500)"
  [ $((RANDOM % 5)) -eq 0 ] && R SMEMBERS "$cart"          # footgun-ish on big carts
  [ $((RANDOM % 7)) -eq 0 ] && R DEL "$cart"

  # --- social feed (hot posts) ---
  post=$(pick "${HOT_POSTS[@]}")
  R LPUSH "feed:home" "$post"
  R LRANGE "feed:home" 0 9
  R INCR "likes:$post"

  # --- rate limiting ---
  rl="ratelimit:ip:$(rnd 200)"
  R INCR "$rl"
  R EXPIRE "$rl" 60

  # --- job queue ---
  R LPUSH "queue:emails" "job:$RANDOM"
  [ $((RANDOM % 6)) -eq 0 ] && R RPOP "queue:emails"

  # --- leaderboard ---
  R ZADD "leaderboard:global" "$((RANDOM % 10000))" "user:$(rnd 5000)"
  [ $((RANDOM % 8)) -eq 0 ] && R ZRANGEBYSCORE "leaderboard:global" 0 1000

  # --- locks (short-lived) ---
  [ $((RANDOM % 10)) -eq 0 ] && R SET "lock:order:$(rnd 100)" 1

  # Jittered pacing so it bursts then breathes — looks human-driven.
  sleep "0.0$((RANDOM % 6))"
done
