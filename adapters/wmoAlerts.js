'use strict';

const { fetchText } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const { cachedPopulation, fillPopulations, formatPopulation } = require('../lib/areaPopulation');

// WMO Severe Weather Information Centre (SWIC): official national met-service CAP warnings,
// re-published with their alert polygons through SWIC's own GeoServer WFS. Keyless.
// Covers regions NDMA SACHET doesn't: Russia, Europe, South America, North Africa (plus
// Pakistan if PMD ever joins SWIC - it hasn't yet). One marker per (issuer, hazard, issue
// time), with the population living inside its polygon(s) filled in over time (WorldPop) -
// see lib/areaPopulation.js.

const WFS_BASE = 'https://severeweather.wmo.int/f/wfs';
const TYPE_NAME = 'local_postgis:postgis_geojsons';

// The `cn` (issuer) column itself rejects cql_filter with a Postgres type error on this
// server, but the equivalent `capurl` text column (which starts with the same
// "iso2-agency-lang" prefix, e.g. "ru-roshydromet-en/2026/...") filters fine - verified
// against the live service. Scope kept to the gap SACHET/GDACS don't cover; codes not in
// this list (US, Canada, China, Kazakhstan, Middle East...) are simply never fetched.
const REGION_OF_ISO2 = {
  ru: 'Russia',
  es: 'Europe', ee: 'Europe', gr: 'Europe', pt: 'Europe', ba: 'Europe', rs: 'Europe', lv: 'Europe', me: 'Europe',
  is: 'Europe', fi: 'Europe', fr: 'Europe', de: 'Europe', it: 'Europe', pl: 'Europe', ua: 'Europe', by: 'Europe',
  md: 'Europe', al: 'Europe', mk: 'Europe', hr: 'Europe', si: 'Europe', sk: 'Europe', cz: 'Europe', hu: 'Europe',
  ro: 'Europe', bg: 'Europe', at: 'Europe', ch: 'Europe', be: 'Europe', nl: 'Europe', dk: 'Europe', se: 'Europe',
  no: 'Europe', ie: 'Europe', gb: 'Europe', lt: 'Europe', lu: 'Europe', mt: 'Europe', cy: 'Europe',
  co: 'South America', cl: 'South America', ar: 'South America', ec: 'South America', pe: 'South America',
  bo: 'South America', py: 'South America', uy: 'South America', ve: 'South America', br: 'South America',
  gy: 'South America', sr: 'South America', pa: 'South America',
  dz: 'North Africa', ly: 'North Africa', tn: 'North Africa', ma: 'North Africa', eg: 'North Africa',
  mr: 'North Africa', eh: 'North Africa', sd: 'North Africa',
};

const POPULATION_MAX_POLYGONS = 10; // a warning split over more municipality/pieces than this isn't worth summing
const POPULATION_BUDGET = 40; // new WorldPop lookups per refresh (runs in the background - see below)

function buildUrl() {
  const like = Object.keys(REGION_OF_ISO2).map((iso2) => `capurl LIKE '${iso2}-%'`).join(' OR ');
  const now = new Date().toISOString();
  const cql = `row_type='POLYGON' AND expires > '${now}' AND (${like})`;
  const params = new URLSearchParams({
    request: 'GetFeature',
    version: '1.1.0',
    typeName: TYPE_NAME,
    cql_filter: cql,
    outputFormat: 'json',
  });
  return `${WFS_BASE}?${params}`;
}

const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// WMO CAP severity code 0-4 (Unknown/Minor/Moderate/Severe/Extreme). Official alerts sit at
// 3-5, mirroring SACHET's floor for an issued (not merely possible) warning.
const severityOf = (s) => (s >= 4 ? 5 : s >= 2 ? 4 : 3);

function shortAreas(areadesc) {
  const names = String(areadesc || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} +${names.length - 3} more`;
}

function bboxOf(features) {
  let [minX, minY, maxX, maxY] = features[0].bbox;
  for (const f of features.slice(1)) {
    const [x0, y0, x1, y1] = f.bbox;
    minX = Math.min(minX, x0); minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1); maxY = Math.max(maxY, y1);
  }
  return { lat: (minY + maxY) / 2, lng: (minX + maxX) / 2 };
}

let lastStats = null;
let populationRun = null;

async function fetchWmoAlerts() {
  const body = await fetchText(buildUrl(), { timeoutMs: 20000, accept: 'application/json' });
  const data = JSON.parse(body);
  const features = (data.features || []).filter((f) => f.geometry?.type === 'Polygon' && Array.isArray(f.bbox));

  const groups = new Map();
  for (const f of features) {
    const p = f.properties;
    const iso2 = (p.cn || p.capurl || '').split(/[-/]/)[0].toLowerCase();
    if (!REGION_OF_ISO2[iso2]) continue;
    const key = `${iso2}|${p.event}|${p.sent}`;
    if (!groups.has(key)) groups.set(key, { iso2, event: p.event, sent: p.sent, expires: p.expires, areadesc: p.areadesc, features: [] });
    groups.get(key).features.push(f);
  }

  // In the background: a population lookup takes 3-8 s per polygon part, so waiting for
  // every group here would hold the whole feed back for minutes. Whatever finishes shows
  // up on the next refresh; coverage fills in gradually instead of stalling the endpoint.
  if (!populationRun) {
    const wanted = [...groups.values()]
      .filter((g) => g.features.length <= POPULATION_MAX_POLYGONS)
      .sort((a, b) => Math.max(...b.features.map((f) => f.properties.s || 0)) - Math.max(...a.features.map((f) => f.properties.s || 0)))
      .map((g) => ({ type: 'MultiPolygon', coordinates: g.features.map((f) => f.geometry.coordinates) }));
    populationRun = fillPopulations(wanted, { budget: POPULATION_BUDGET })
      .catch((err) => {
        console.warn(`[wmoAlerts] population lookups failed: ${err.message}`);
        return 0;
      })
      .finally(() => { populationRun = null; });
  }

  const events = [];
  let withPopulation = 0;
  for (const g of groups.values()) {
    const geometry = { type: 'MultiPolygon', coordinates: g.features.map((f) => f.geometry.coordinates) };
    const population = g.features.length <= POPULATION_MAX_POLYGONS ? cachedPopulation(geometry) : null;
    if (population !== null) withPopulation += 1;
    const { lat, lng } = bboxOf(g.features);
    const region = REGION_OF_ISO2[g.iso2];
    const populationLabel = formatPopulation(population);
    try {
      events.push(
        makeEvent({
          id: `wmo-${slug(g.iso2)}-${slug(g.event)}-${Date.parse(g.sent) || 0}`,
          type: 'alert',
          title: `Official alert: ${cap(g.event)} · ${region}${populationLabel ? ` (~${populationLabel} people)` : ''}`,
          lat,
          lng,
          timestamp: new Date(Date.parse(g.sent) || Date.now()).toISOString(),
          severity: severityOf(Math.max(...g.features.map((f) => f.properties.s || 0))),
          source: 'WMO SWIC',
          isSimulated: false,
          layer: 'alerts',
          tag: 'REAL_LIVE',
          sourceUrl: 'https://severeweather.wmo.int/',
          raw: {
            hazard: g.event,
            region,
            areas: shortAreas(g.areadesc),
            polygonCount: g.features.length,
            expires: g.expires,
            population,
            placedAt: 'polygon bounding-box centre',
          },
        }),
      );
    } catch {
      /* skip malformed group */
    }
  }

  lastStats = {
    features: features.length,
    markers: events.length,
    withPopulation,
    populationLookupRunning: Boolean(populationRun),
  };
  console.log(`[wmoAlerts] ${features.length} active warning polygons -> ${events.length} markers (${withPopulation} with population)`);
  return events;
}

const getWmoAlertStats = () => lastStats;

module.exports = { fetchWmoAlerts, getWmoAlertStats };
