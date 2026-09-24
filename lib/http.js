'use strict';

const { fetchTimeoutMs } = require('./config');

// Some upstreams (SACHET's WAF, GDELT) reject requests without a browser-ish User-Agent.
const USER_AGENT = 'Mozilla/5.0 (compatible; CitySync/1.0; civic data dashboard)';

/**
 * GET a URL and return the body as text. Every failure mode (network error, timeout,
 * non-200) becomes a thrown Error with a short readable message; callers never see raw
 * fetch internals. For a non-200, a short snippet of the body is kept in the message
 * because several upstreams explain themselves there (e.g. Open-Meteo's
 * "Daily API request limit exceeded").
 */
async function fetchText(url, { timeoutMs = fetchTimeoutMs, accept = '*/*' } = {}) {
  let res;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: accept, 'User-Agent': USER_AGENT },
    });
    const body = await res.text();
    if (res.status !== 200) {
      const reason = body.replace(/\s+/g, ' ').trim().slice(0, 140);
      throw new Error(`HTTP ${res.status} ${res.statusText}${reason ? ` - ${reason}` : ''}`.trim());
    }
    return body;
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw new Error(`timed out after ${timeoutMs}ms`);
    }
    if (err instanceof TypeError) {
      // undici wraps DNS / connection errors as TypeError("fetch failed") with a cause.
      throw new Error(`network error: ${err.cause?.code || err.cause?.message || err.message}`);
    }
    throw err;
  }
}

/** GET a URL and parse JSON. Same error contract as fetchText. */
async function fetchJson(url, options = {}) {
  const body = await fetchText(url, { ...options, accept: 'application/json' });
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`response body was not valid JSON: ${body.replace(/\s+/g, ' ').trim().slice(0, 100)}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Map over `items` with at most `limit` calls in flight. Never rejects: failures become null. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      try {
        results[i] = await fn(items[i], i);
      } catch {
        results[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

module.exports = { fetchJson, fetchText, sleep, mapLimit };
