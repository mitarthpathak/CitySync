'use strict';

const { fetchTimeoutMs } = require('./config');

/**
 * GET a URL and parse JSON. Every failure mode (network error, timeout, non-200,
 * bad JSON) becomes a thrown Error with a short readable message; callers never
 * see raw fetch internals.
 */
async function fetchJson(url, { timeoutMs = fetchTimeoutMs } = {}) {
  let res;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (res.status !== 200) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(`timed out after ${timeoutMs}ms`);
    }
    if (err instanceof SyntaxError) {
      throw new Error('response body was not valid JSON');
    }
    if (err instanceof TypeError) {
      // undici wraps DNS / connection errors as TypeError("fetch failed") with a cause.
      throw new Error(`network error: ${err.cause?.code || err.cause?.message || err.message}`);
    }
    throw err;
  }
}

module.exports = { fetchJson };
