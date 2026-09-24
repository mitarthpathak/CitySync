'use strict';

const { fetchText, mapLimit } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const { findIndianState, findImdCentre } = require('../lib/gazetteer');

// NDMA SACHET: India's official CAP 1.2 alerting platform (IMD, CWC, state SDMAs). Keyless.
//
// Flow: the All-India RSS lists recent alerts -> each item links to its CAP XML (event,
// severity, expiry, area description). SACHET's polygon files are not publicly readable
// (403), so an alert is placed at the centroid of the state it names (or its issuing IMD
// office); alerts we cannot place are dropped. Alerts are grouped by (place, hazard) so 40
// lightning warnings for one state render as one prominent marker, not 40 stacked ones.

const RSS_URL = 'https://sachet.ndma.gov.in/cap_public_website/rss/rss_india.xml';
const MAX_CAP_FETCHES = 60; // per refresh; CAP files are cached, so steady state is ~0-10
const CAP_CONCURRENCY = 4;
const NO_EXPIRY_WINDOW_MS = 24 * 60 * 60 * 1000; // an alert without a readable expiry counts as current for 24h

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) =>
  String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .trim();

/** Text of the first <tag> inside `xml` (namespace prefix optional). */
function tag(xml, name) {
  const m = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'i').exec(xml);
  return m ? decode(m[1]) : '';
}
const blocks = (xml, name) => xml.match(new RegExp(`<(?:\\w+:)?${name}[\\s>][\\s\\S]*?</(?:\\w+:)?${name}>`, 'gi')) ?? [];

function parseRss(xml) {
  return blocks(xml, 'item').map((item) => ({
    title: tag(item, 'title'),
    link: tag(item, 'link'),
    author: tag(item, 'author'),
    category: tag(item, 'category'),
    guid: tag(item, 'guid'),
    pubDate: tag(item, 'pubDate'),
  }));
}

function parseCap(xml) {
  if (!/<(?:\w+:)?alert[\s>]/i.test(xml)) throw new Error('not a CAP document');
  const infos = blocks(xml, 'info');
  // Prefer the English <info> block; SACHET also carries regional-language copies.
  const info = infos.find((b) => /^en/i.test(tag(b, 'language'))) ?? infos[0] ?? '';
  return {
    identifier: tag(xml, 'identifier'),
    sender: tag(xml, 'sender'),
    sent: tag(xml, 'sent'),
    status: tag(xml, 'status'),
    msgType: tag(xml, 'msgType'),
    event: tag(info, 'event'),
    urgency: tag(info, 'urgency'),
    severity: tag(info, 'severity'),
    certainty: tag(info, 'certainty'),
    effective: tag(info, 'effective'),
    expires: tag(info, 'expires'),
    headline: tag(info, 'headline'),
    areaDesc: blocks(info, 'area').map((a) => tag(a, 'areaDesc')).filter(Boolean).join('; '),
  };
}

const capCache = new Map(); // guid -> parsed CAP (immutable once issued)

async function getCap(item) {
  if (capCache.has(item.guid)) return capCache.get(item.guid);
  const cap = parseCap(await fetchText(item.link, { timeoutMs: 10000, accept: 'application/xml' }));
  capCache.set(item.guid, cap);
  return cap;
}

/** Where to plot: a state named in the area text, else the sender / issuing office. */
function locate(item, cap) {
  const state =
    findIndianState(cap?.areaDesc) ?? findIndianState(cap?.sender) ?? findIndianState(item.author) ?? findIndianState(item.title);
  if (state) return { name: state.name, lat: state.lat, lng: state.lng, basis: 'state centroid' };
  const imd = findImdCentre(item.author) ?? findImdCentre(cap?.sender);
  if (imd) return { name: `${imd.state} (${imd.name})`, lat: imd.lat, lng: imd.lng, basis: 'issuing IMD office' };
  return null;
}

// Official alerts sit at 4-5: CAP "Extreme" is 5, everything else issued is 4.
const severityFromCap = (capSeverity) => (/^extreme$/i.test(capSeverity) ? 5 : 4);

const issuerOf = (item, cap) => /\(([^)]+)\)/.exec(item.author)?.[1] ?? cap?.sender ?? 'NDMA SACHET';
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let lastStats = null;

async function fetchSachet() {
  const items = parseRss(await fetchText(RSS_URL, { timeoutMs: 15000, accept: 'application/rss+xml, application/xml' }));
  if (!items.length) throw new Error('RSS feed had no <item> entries');

  const now = Date.now();
  const recent = items
    .filter((it) => it.guid && it.link && Number.isFinite(Date.parse(it.pubDate)))
    .sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate))
    .filter((it) => now - Date.parse(it.pubDate) < 3 * NO_EXPIRY_WINDOW_MS);

  const caps = await mapLimit(recent.slice(0, MAX_CAP_FETCHES), CAP_CONCURRENCY, getCap);
  const stats = { rssItems: items.length, considered: recent.length, capRead: caps.filter(Boolean).length, expired: 0, unplaced: 0, active: 0 };

  const groups = new Map();
  recent.forEach((item, i) => {
    const cap = caps[i] ?? null;
    if (cap && /^cancel/i.test(cap.msgType)) return; // a cancellation withdraws an earlier alert
    if (cap && cap.status && !/^actual$/i.test(cap.status)) return; // exercises / tests are not alerts
    const expiresMs = Date.parse(cap?.expires ?? '');
    const current = Number.isFinite(expiresMs) ? expiresMs > now : now - Date.parse(item.pubDate) < NO_EXPIRY_WINDOW_MS;
    if (!current) {
      stats.expired += 1;
      return;
    }
    const where = locate(item, cap);
    if (!where) {
      stats.unplaced += 1;
      return;
    }
    stats.active += 1;
    const hazard = cap?.event || item.category || 'Alert';
    const key = `${where.name}|${hazard.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { where, hazard, alerts: [] });
    groups.get(key).alerts.push({ item, cap, expiresMs });
  });

  const events = [];
  for (const { where, hazard, alerts } of groups.values()) {
    alerts.sort((a, b) => Date.parse(b.item.pubDate) - Date.parse(a.item.pubDate));
    const newest = alerts[0];
    const severity = Math.max(...alerts.map((a) => severityFromCap(a.cap?.severity)));
    const areas = [...new Set(alerts.map((a) => a.cap?.areaDesc).filter(Boolean))];
    const issuers = [...new Set(alerts.map((a) => issuerOf(a.item, a.cap)))];
    const latestExpiry = Math.max(...alerts.map((a) => (Number.isFinite(a.expiresMs) ? a.expiresMs : 0)));
    const n = alerts.length;
    try {
      events.push(
        makeEvent({
          id: `alert-${slug(where.name)}-${slug(hazard)}`,
          type: 'alert',
          title: `Official alert: ${hazard} · ${where.name}${n > 1 ? ` (${n} active)` : ''}`,
          lat: where.lat,
          lng: where.lng,
          timestamp: new Date(Date.parse(newest.item.pubDate)).toISOString(),
          severity,
          source: 'NDMA SACHET',
          isSimulated: false,
          layer: 'alerts',
          tag: 'REAL_LIVE',
          sourceUrl: newest.item.link,
          raw: {
            hazard,
            issuedBy: issuers.join(', '),
            activeAlerts: n,
            capSeverity: newest.cap?.severity || null,
            urgency: newest.cap?.urgency || null,
            certainty: newest.cap?.certainty || null,
            expires: latestExpiry ? new Date(latestExpiry).toISOString() : null,
            headline: newest.cap?.headline || newest.item.title,
            areas: areas.slice(0, 8),
            placedAt: where.basis,
          },
        }),
      );
    } catch {
      /* skip malformed group */
    }
  }

  // Forget CAP files that have scrolled out of the feed.
  const live = new Set(items.map((it) => it.guid));
  for (const guid of capCache.keys()) if (!live.has(guid)) capCache.delete(guid);

  lastStats = stats;
  console.log(`[sachet] ${stats.rssItems} RSS items, ${stats.capRead} CAP read, ${stats.active} active, ${stats.expired} expired, ${stats.unplaced} unplaced -> ${events.length} alert markers`);
  return events;
}

const getSachetStats = () => lastStats;

module.exports = { fetchSachet, getSachetStats, parseCap, parseRss };
