'use strict';

const fs = require('fs');
const path = require('path');
const { fetchJson } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const { wardAt } = require('../lib/wards');
const H = require('../lib/heuristics');

const places = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'places.json'), 'utf8'));

const EVIDENCE = {
  citywide: 'https://timesofindia.indiatimes.com/city/jaipur/heavy-rain-cools-jaipur-floods-roads-and-disrupts-traffic/articleshow/132720127.cms',
  jagatpura: 'https://timesofindia.indiatimes.com/city/jaipur/open-choked-drain-worsens-waterlogging-near-jagatpura-mall/amp_articleshow/131123757.cms',
  mansarovar: 'https://www.livehindustan.com/rajasthan/jaipur/jaipur-rain-road-collapse-10-feet-deep-sinkhole-car-fell-mansarovar-gopalpura-bypass-201783352541455.html',
};

// Predictive: precipitation_probability (forward-looking) is now blended in alongside the
// rain accumulation totals, not just past/near-term rain - see lib/heuristics.js's weights.
async function fetchWaterlogging() {
  const H_ = H.waterlogging;
  const data = await fetchJson(
    'https://api.open-meteo.com/v1/forecast?latitude=26.9124&longitude=75.7873'
    + '&hourly=rain,precipitation_probability&past_days=2&forecast_days=1&timezone=Asia%2FKolkata',
  );
  const rain = data.hourly?.rain || [];
  const probability = data.hourly?.precipitation_probability || [];
  const times = data.hourly?.time || [];
  const now = Date.now();

  const nextIdx = times.map((t, i) => (Date.parse(t) >= now && Date.parse(t) < now + H_.nextHours * 3600000 ? i : -1)).filter((i) => i >= 0);
  const next = nextIdx.reduce((sum, i) => sum + (rain[i] || 0), 0);
  const avgProbability = nextIdx.length ? nextIdx.reduce((sum, i) => sum + (probability[i] || 0), 0) / nextIdx.length : 0;
  const recent = rain.reduce((sum, v, i) => (Date.parse(times[i]) >= now - 48 * 3600000 && Date.parse(times[i]) <= now ? sum + (v || 0) : sum), 0);

  const score = Math.min(100, Math.round(
    Math.min(H_.rainNextWeight, (next / H_.rainNextHoursMm) * H_.rainNextWeight)
    + Math.min(H_.rain48Weight, (recent / H_.rain48HoursMm) * H_.rain48Weight)
    + Math.min(H_.probabilityWeight, (avgProbability / 100) * H_.probabilityWeight),
  ));

  return places.map((p) => {
    const ward = wardAt(p.lat, p.lng);
    const severity = score >= H_.highScore ? 4 : score >= H_.mediumScore ? 3 : 2;
    const lower = p.name.toLowerCase();
    const sourceUrl = lower.includes('jagatpura') ? EVIDENCE.jagatpura : lower.includes('mansarovar') || lower.includes('gopalpura') ? EVIDENCE.mansarovar : EVIDENCE.citywide;
    return makeEvent({
      id: `waterlogging-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      type: 'waterlogging',
      layer: 'waterlogging_risk',
      tag: 'MEDIA_REPORTED',
      sourceUrl,
      ward_id: ward?.properties.ward_id ?? null,
      title: `Possible waterlogging risk: ${p.name}`,
      lat: p.lat,
      lng: p.lng,
      timestamp: new Date().toISOString(),
      severity,
      source: 'Compiled Jaipur news reports + Open-Meteo',
      raw: {
        risk_score: score,
        next_3h_rain_mm: next,
        next_3h_rain_probability_pct: Math.round(avgProbability),
        last_48h_rain_mm: recent,
        confidence: p.confidence,
        disclaimer: 'Project heuristic; media-reported hotspot, not an official registry.',
      },
    });
  });
}

module.exports = { fetchWaterlogging };
