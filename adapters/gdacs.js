'use strict';

const { fetchText } = require('../lib/http');
const { makeEvent } = require('../lib/event');

// GDACS (Global Disaster Alert and Coordination System, UN OCHA / EU JRC): floods,
// earthquakes, tropical cyclones, volcanoes, droughts and wildfires worldwide, each with
// GDACS's own modelled population-affected estimate. Keyless, public RSS. Fills gaps no
// national CAP feed covers here (e.g. Pakistan has no SWIC feed).
//
// Alert level is GDACS's modelled humanitarian-impact score (Green / Orange / Red), not a
// national met-service warning, so events are tagged ESTIMATED, not REAL_LIVE.

const RSS_URL = 'https://www.gdacs.org/xml/rss.xml';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) =>
  String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .trim();

const blocks = (xml, name) => xml.match(new RegExp(`<(?:\\w+:)?${name}[\\s>][\\s\\S]*?</(?:\\w+:)?${name}>`, 'gi')) ?? [];
function tag(xml, name) {
  const m = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'i').exec(xml);
  return m ? decode(m[1]) : '';
}
function attr(xml, name, attrName) {
  const m = new RegExp(`<(?:\\w+:)?${name}\\s[^>]*\\b${attrName}="([^"]*)"`, 'i').exec(xml);
  return m ? decode(m[1]) : '';
}

// GDACS's own modelled impact level: Green (minor/none), Orange (moderate), Red (major).
const SEVERITY = { Green: 3, Orange: 4, Red: 5 };

function parseItem(item) {
  const lat = Number(tag(item, 'geo:lat'));
  const lng = Number(tag(item, 'geo:long'));
  const level = tag(item, 'gdacs:alertlevel');
  const type = tag(item, 'gdacs:eventtype');
  return {
    title: tag(item, 'title'),
    link: tag(item, 'link'),
    description: tag(item, 'description'),
    pubDate: tag(item, 'pubDate'),
    isCurrent: /^true$/i.test(tag(item, 'gdacs:iscurrent')),
    eventId: tag(item, 'gdacs:eventid'),
    eventType: type,
    alertLevel: level,
    country: tag(item, 'gdacs:country') || null,
    populationText: tag(item, 'gdacs:population') || null,
    populationValue: Number(attr(item, 'gdacs:population', 'value')),
    lat,
    lng,
  };
}

const EVENT_NAME = {
  EQ: 'Earthquake', TC: 'Tropical cyclone', FL: 'Flood', VO: 'Volcano', DR: 'Drought', WF: 'Wildfire',
};

let lastStats = null;

async function fetchGdacs() {
  const xml = await fetchText(RSS_URL, { timeoutMs: 15000, accept: 'application/rss+xml, application/xml' });
  const items = blocks(xml, 'item').map(parseItem);
  if (!items.length) throw new Error('RSS feed had no <item> entries');

  const stats = { rssItems: items.length, current: 0, skipped: 0 };
  const events = [];
  for (const it of items) {
    if (!it.isCurrent) continue;
    if (!Number.isFinite(it.lat) || !Number.isFinite(it.lng) || !SEVERITY[it.alertLevel]) {
      stats.skipped += 1;
      continue;
    }
    // Green earthquakes and wildfires are hundreds of routine, non-impactful events
    // (Green EQ is already implied by the USGS layer; Green WF is background burning) -
    // only impactful ones are worth an alert marker.
    if ((it.eventType === 'EQ' || it.eventType === 'WF') && it.alertLevel === 'Green') {
      stats.skipped += 1;
      continue;
    }
    stats.current += 1;
    const name = EVENT_NAME[it.eventType] || it.eventType || 'Disaster';
    const place = it.country || 'unknown location';
    try {
      events.push(
        makeEvent({
          id: `gdacs-${it.eventType}-${it.eventId}`,
          type: 'alert',
          title: `${it.alertLevel} alert: ${name} · ${place}`,
          lat: it.lat,
          lng: it.lng,
          timestamp: new Date(Date.parse(it.pubDate) || Date.now()).toISOString(),
          severity: SEVERITY[it.alertLevel],
          source: 'GDACS',
          isSimulated: false,
          layer: 'alerts',
          tag: 'ESTIMATED',
          sourceUrl: it.link,
          raw: {
            hazard: name,
            alertLevel: it.alertLevel,
            country: it.country,
            population: it.populationText,
            populationValue: Number.isFinite(it.populationValue) ? it.populationValue : null,
            description: it.description,
          },
        }),
      );
    } catch {
      /* skip malformed item */
    }
  }

  lastStats = stats;
  console.log(`[gdacs] ${stats.rssItems} RSS items -> ${stats.current} current events (${stats.skipped} skipped)`);
  return events;
}

const getGdacsStats = () => lastStats;

module.exports = { fetchGdacs, getGdacsStats };
