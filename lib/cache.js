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

module.exports = { cached };
