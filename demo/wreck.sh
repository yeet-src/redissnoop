#!/usr/bin/env bash
# THE VILLAIN. `KEYS *` scans the entire keyspace in one shot and BLOCKS the
# single-threaded Redis server for the whole duration (~170ms on 1M keys).
# Every other client stalls behind it. Run this while workload.sh is going and
# watch redissnoop: the command rate collapses and KEYS lights up red with a
# huge p99/max while everything else freezes.
#
# This is the "don't run this in prod" footgun. The fix is demo/proper.sh.
set -uo pipefail
HOST="${REDIS_HOST:-127.0.0.1}"

echo "💥 firing KEYS *  (this BLOCKS the whole server)..."
start=$(date +%s%N)
redis-cli -h "$HOST" KEYS '*' >/dev/null
end=$(date +%s%N)
echo "   KEYS * blocked the server for $(( (end - start) / 1000000 )) ms"
echo "   (every concurrent client was stalled for that entire window)"
