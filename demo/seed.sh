#!/usr/bin/env bash
# Seed Redis with a big keyspace so KEYS * actually hurts. Run once before a
# demo. Defaults to 1,000,000 keys (~170ms KEYS * on this VM).
set -euo pipefail
HOST="${REDIS_HOST:-127.0.0.1}"
N="${1:-1000000}"

echo "seeding $N keys into redis://$HOST ..."
redis-cli -h "$HOST" ping >/dev/null
redis-cli -h "$HOST" eval \
  "for i=1,tonumber(ARGV[1]) do redis.call('set','k:'..i, i) end return redis.call('dbsize')" \
  0 "$N"
echo "dbsize: $(redis-cli -h "$HOST" dbsize)"
