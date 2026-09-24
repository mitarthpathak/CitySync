'use strict';

const config = require('../lib/config');
const { fetchText, sleep } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const { matchPlace } = require('../lib/gazetteer');

// GDELT DOC 2.0 article list: real news coverage, keyless.
//
// RATE LIMIT: GDELT allows ~1 request / 5 s per client and answers faster callers with a
// plain-text "Please limit requests" message. Every GDELT request in this process goes
// through `gdeltGet`, which serialises them and keeps them >= config.gdelt.minGapMs apart.
// Only the background scheduler calls fetchGdelt(); an HTTP request to /events never can.
//
// HONESTY: artlist gives no coordinates (only the *publisher's* country, which is not where
// the story happened). An article is placed only when its headline names a place in our
// gazetteer; otherwise it is dropped. The result is "media mentions", never an incident.

const API = 'https://api.gdeltproject.org/api/v2/doc/doc';
const RATE_LIMIT_BACKOFF_MS = 20000;

class RateLimited extends Error {
  constructor() {
    super('rate limited by GDELT');
  }
}

let queue = Promise.resolve();
let lastRequestAt = 0;

/** Serialised, rate-limited GET. */
function gdeltGet(url) {
  const run = async () => {
    const wait = lastRequestAt + config.gdelt.minGapMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    try {
      return await fetchText(url, { timeoutMs: 20000, accept: 'application/json' });
    } finally {
      lastRequestAt = Date.now(); // the gap is measured from when the previous call finished
    }
  };
  const result = queue.then(run, run);
  queue = result.catch(() => {});
  return result;
}

function buildUrl(query) {
  const params = new URLSearchParams({
    query: `${query} sourcelang:english`,
    mode: 'artlist',
    format: 'json',
    maxrecords: String(config.gdelt.maxRecords),
    timespan: config.gdelt.timespan,
    sort: 'datedesc',
  });
  return `${API}?${params}`;
}

/** "20260923T214500Z" -> ISO string, or null. */
function parseSeenDate(value) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(value ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

async function fetchQuery({ label, query, country = null }) {
  const get = async () => {
    try {
      return await gdeltGet(buildUrl(query));
    } catch (err) {
      throw /HTTP 429/.test(err.message) ? new RateLimited() : err;
    }
  };
  let body;
  try {
    body = await get();
  } catch (err) {
    // GDELT's front end is often slow to accept connections (Node gives up connecting after
    // 10 s). One retry, still through the rate-limited queue; HTTP errors are not retried.
    if (err instanceof RateLimited || !/network error|timed out/.test(err.message)) throw err;
    body = await get();
  }
  if (/limit requests|too many requests/i.test(body)) throw new RateLimited();
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`not JSON: ${body.replace(/\s+/g, ' ').slice(0, 80)}`);
  }
  // GDELT answers {} when nothing matched.
  const articles = Array.isArray(data?.articles) ? data.articles : [];
  return articles.map((a) => ({ ...a, topic: label, onlyCountry: country }));
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Severity from mention volume and recency only; capped at 3 (media is weak evidence). */
function severityFromCoverage(count, newestAgeHours) {
  if (count >= 8 && newestAgeHours <= 6) return 3;
  if (count >= 3) return 2;
  return 1;
}

let lastStats = null;

// Per-query memory: a query's last good article list is reused for QUERY_REUSE_MS, so a
// cycle cut short by rate limiting does not blank out topics fetched in the previous cycle.
const QUERY_REUSE_MS = 60 * 60 * 1000;
const queryCache = new Map(); // label -> { articles, at }
let nextQueryIndex = 0; // round-robin start, so a cut-short cycle resumes where it stopped

/**
 * Run the configured queries (sequentially, rate-limited), place articles by headline,
 * and emit one "media mentions" event per (topic, place) cluster.
 *
 * On a 429 the cycle STOPS (hammering on only extends GDELT's penalty window); the next
 * cycle starts from the query that was refused. Throws only when no query has fresh or
 * recently cached data.
 */
async function fetchGdelt() {
  const queries = config.gdelt.queries;
  const stats = { queries: queries.length, queriesOk: 0, fromCache: 0, rateLimited: false, queryErrors: [], articles: 0, placed: 0, dropped: 0 };

  for (let n = 0; n < queries.length; n += 1) {
    const i = (nextQueryIndex + n) % queries.length;
    const q = queries[i];
    try {
      queryCache.set(q.label, { articles: await fetchQuery(q), at: Date.now() });
      stats.queriesOk += 1;
    } catch (err) {
      if (err instanceof RateLimited) {
        stats.rateLimited = true;
        stats.queryErrors.push(`${q.label}: rate limited (HTTP 429), cycle stopped`);
        nextQueryIndex = i;
        await sleep(RATE_LIMIT_BACKOFF_MS); // keep the shared queue quiet for a while
        break;
      }
      stats.queryErrors.push(`${q.label}: ${err.message}`);
    }
    if (n === queries.length - 1) nextQueryIndex = 0;
  }

  const byUrl = new Map();
  const now = Date.now();
  for (const q of queries) {
    const hit = queryCache.get(q.label);
    if (!hit || now - hit.at > QUERY_REUSE_MS) continue;
    if (now - hit.at > 60 * 1000) stats.fromCache += 1;
    for (const a of hit.articles) {
      if (typeof a.url === 'string' && a.url && !byUrl.has(a.url)) byUrl.set(a.url, a);
    }
  }
  if (stats.queriesOk === 0 && stats.fromCache === 0) {
    lastStats = stats;
    console.warn(`[gdelt] ${stats.queryErrors.join('; ')}`);
    throw new Error(`no GDELT query succeeded (${stats.queryErrors[0] ?? 'unknown'})`);
  }

  const clusters = new Map();
  for (const a of byUrl.values()) {
    stats.articles += 1;
    const seen = parseSeenDate(a.seendate);
    const place = matchPlace(a.title);
    if (!seen || !place || (a.onlyCountry && place.country !== a.onlyCountry)) {
      stats.dropped += 1; // no usable location (or date): drop, never guess
      continue;
    }
    stats.placed += 1;
    const key = `${a.topic}|${place.name}`;
    if (!clusters.has(key)) clusters.set(key, { topic: a.topic, place, articles: [] });
    clusters.get(key).articles.push({ title: a.title, url: a.url, domain: a.domain ?? null, seen, publisherCountry: a.sourcecountry ?? null });
  }

  const events = [];
  for (const { topic, place, articles } of clusters.values()) {
    articles.sort((x, y) => Date.parse(y.seen) - Date.parse(x.seen));
    const newest = articles[0];
    const ageHours = (now - Date.parse(newest.seen)) / 3600000;
    const n = articles.length;
    try {
      events.push(
        makeEvent({
          id: `news-${slug(topic)}-${slug(place.name)}`,
          type: 'news',
          title: `Media mentions: ${topic} · ${place.name} (${n} article${n === 1 ? '' : 's'})`,
          lat: place.lat,
          lng: place.lng,
          timestamp: newest.seen,
          severity: severityFromCoverage(n, ageHours),
          source: 'GDELT',
          isSimulated: false,
          layer: 'news',
          tag: 'MEDIA_REPORTED',
          sourceUrl: newest.url,
          raw: {
            note: 'Media mentions only, not a confirmed incident',
            topic,
            place: place.name,
            placeLevel: place.level,
            country: place.country,
            geolocation: 'place name found in the headline',
            articleCount: n,
            latestHeadline: newest.title,
            articles: articles.slice(0, 5).map(({ title, url, domain, seen }) => ({ title, url, domain, seen })),
          },
        }),
      );
    } catch {
      /* skip malformed cluster */
    }
  }

  lastStats = stats;
  if (stats.queryErrors.length) console.warn(`[gdelt] ${stats.queryErrors.length} query error(s): ${stats.queryErrors.join('; ')}`);
  console.log(`[gdelt] ${stats.queriesOk}/${stats.queries} queries fetched, ${stats.fromCache} reused from cache${stats.rateLimited ? ' (rate limited, cycle stopped)' : ''}, ${stats.articles} articles, ${stats.placed} placed, ${stats.dropped} dropped (no place in headline) -> ${events.length} clusters`);
  return events;
}

const getGdeltStats = () => lastStats;

module.exports = { fetchGdelt, getGdeltStats, severityFromCoverage };
