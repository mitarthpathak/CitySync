'use strict';

const store = new Map();

/**
 * Memoize an async function's promise under `key`.
 *  - concurrent callers share one in-flight call
 *  - success is reused for `ttlMs`
 *  - failure is reused for only `failureTtlMs`, so an outage is retried soon
 *    but not hammered (and not re-logged) on every request
 */
function cached(key, ttlMs, failureTtlMs, fn) {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.promise;

  const entry = { promise: Promise.resolve().then(fn), expiresAt: Date.now() + ttlMs };
  entry.promise.catch(() => {
    entry.expiresAt = Date.now() + failureTtlMs;
  });
  store.set(key, entry);
  return entry.promise;
}

// --- scheduled-job cache, additive to `cached()` above -----------------------------
//
// `cached()` is request-triggered: the first caller after expiry pays for the
// upstream fetch. The local/globe pipeline wants the opposite - a scheduled job is
// the only writer, and a route is a read-only, non-blocking lookup that never
// triggers a fetch itself. Kept as a second, separate store so the existing
// adapters and their behaviour are untouched.
const snapshots = new Map();

/** Called only by a scheduled job: stores the latest envelope for `key`. */
function writeCache(key, value) {
  snapshots.set(key, value);
}

/** Called only by a route: returns the last envelope written for `key`, or `undefined` before the first job run. */
function readCache(key) {
  return snapshots.get(key);
}

module.exports = { cached, writeCache, readCache };
