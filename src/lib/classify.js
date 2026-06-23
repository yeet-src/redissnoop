// Pure classification helpers: key-pattern inference and command metadata.
// No signals, no BPF — just functions over strings. Tested against live
// capture before wiring into the UI.

// Verbs that are connection/health noise rather than application traffic.
// Filtered out so the views reflect what the app is actually doing to Redis.
export const NOISE = new Set([
  "PING", "AUTH", "HELLO", "SELECT", "COMMAND", "INFO", "CLIENT",
  "SUBSCRIBE", "PSUBSCRIBE", "RESET", "QUIT",
  // Server/introspection chatter, not application data access.
  "TIME", "TS", "CONFIG", "DEBUG", "DBSIZE", "MEMORY", "SLOWLOG", "WAIT",
]);

// Write commands — everything else captured is treated as a read. Used for
// the read/write split on each key pattern.
export const WRITES = new Set([
  "SET", "SETEX", "SETNX", "PSETEX", "GETSET", "APPEND", "SETRANGE",
  "INCR", "DECR", "INCRBY", "DECRBY", "INCRBYFLOAT",
  "DEL", "UNLINK", "EXPIRE", "PEXPIRE", "EXPIREAT", "PERSIST", "RENAME",
  "HSET", "HMSET", "HSETNX", "HDEL", "HINCRBY", "HINCRBYFLOAT",
  "LPUSH", "RPUSH", "LPUSHX", "RPUSHX", "LSET", "LREM", "LPOP", "RPOP", "LTRIM",
  "SADD", "SREM", "SPOP", "SMOVE",
  "ZADD", "ZREM", "ZINCRBY", "ZPOPMIN", "ZPOPMAX",
  "MSET", "MSETNX", "SETBIT", "FLUSHALL", "FLUSHDB",
]);

// Footgun verbs: things that can block the single-threaded server or pull
// huge payloads. The note is what we show the engineer. Keep these honest —
// a false alarm erodes trust faster than a missed one.
export const FOOTGUNS = {
  KEYS: "O(N) scan blocks the server — use SCAN",
  FLUSHALL: "wipes ALL databases",
  FLUSHDB: "wipes the current database",
  SMEMBERS: "returns the whole set — use SSCAN if large",
  HGETALL: "returns the whole hash — use HSCAN if large",
  SORT: "can be O(N log N) and blocking",
  SAVE: "blocks the server during snapshot",
  SUNION: "can be O(N) across sets",
  SINTERSTORE: "can be O(N*M)",
  ZRANGEBYSCORE: "can return a large range",
};

// Collapse the variable parts of a key into a pattern so an engineer sees
// "user:* — 28% of traffic" instead of ten thousand distinct user ids.
// A segment becomes "*" when it looks like an id: all-digits, a long hex
// string, or a token of decent length containing a digit (e.g. uuids,
// "a1b2c3d4"). Pure-word segments (user, session, cart) are kept verbatim.
export function keyPattern(key) {
  if (!key) return "(no key)";
  return key
    .split(/[:/.]/)
    .map((s) => {
      if (/^\d+$/.test(s)) return "*";
      if (/^[0-9a-fA-F]{8,}$/.test(s)) return "*";
      if (/\d/.test(s) && s.length >= 6) return "*";
      return s;
    })
    .join(":");
}

export const isWrite = (cmd) => WRITES.has(cmd);
export const footgunOf = (cmd) => FOOTGUNS[cmd] || null;
// A captured verb is real only if it's all-uppercase letters (the BPF side
// uppercases and guards, but double-check here so a stray frame never shows).
export const isRealVerb = (cmd) => /^[A-Z]+$/.test(cmd);
