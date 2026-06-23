#!/usr/bin/env bash
# THE HERO. SCAN does the same job as KEYS * — walk the whole keyspace — but
# cursor-based and incremental: each SCAN call returns a small batch in
# microseconds and yields the server between calls, so it NEVER blocks. Run
# this while workload.sh is going and watch redissnoop: SCAN stays green, the
# command rate keeps flowing, no stall.
#
# Same result as demo/wreck.sh, none of the damage. This is the before/after.
set -uo pipefail
HOST="${REDIS_HOST:-127.0.0.1}"
COUNT="${1:-100}" # keys hinted per SCAN step

echo "✅ walking the keyspace with SCAN (COUNT $COUNT, non-blocking)..."
start=$(date +%s%N)
cursor=0
total=0
while :; do
  # SCAN returns: line 1 = next cursor, remaining lines = keys in this batch.
  out=$(redis-cli -h "$HOST" SCAN "$cursor" COUNT "$COUNT")
  cursor=$(printf '%s\n' "$out" | head -1)
  batch=$(( $(printf '%s\n' "$out" | wc -l) - 1 ))
  total=$(( total + batch ))
  [ "$cursor" = "0" ] && break
done
end=$(date +%s%N)
echo "   walked ~$total keys in $(( (end - start) / 1000000 )) ms of wall time,"
echo "   in hundreds of tiny non-blocking steps — the server stayed responsive throughout."
