'use strict';

const { fetchJson } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const { openMeteoTimeToIso } = require('../lib/time');
const { AMER } = require('../lib/geo');

const URL =
  'https://air-quality-api.open-meteo.com/v1/air-quality' +
  `?latitude=${AMER.lat}&longitude=${AMER.lng}` +
  '&current=us_aqi,pm2_5,pm10&timezone=auto';

// US AQI bands.
function bandFromAqi(aqi) {
  if (aqi <= 50) return { label: 'Good', severity: 1 };
  if (aqi <= 100) return { label: 'Moderate', severity: 2 };
  if (aqi <= 150) return { label: 'Unhealthy for sensitive groups', severity: 3 };
  if (aqi <= 200) return { label: 'Unhealthy', severity: 4 };
  return { label: aqi <= 300 ? 'Very unhealthy' : 'Hazardous', severity: 5 };
}

/** Real current air quality at Amer (Open-Meteo Air Quality, keyless). One event. */
async function fetchAirQuality() {
  const data = await fetchJson(URL);
  const current = data?.current;
  if (!current || typeof current.us_aqi !== 'number') {
    // Open-Meteo returns null us_aqi when the model has no value; do not invent one.
    throw new Error('unexpected payload: missing current us_aqi');
  }

  const { us_aqi, pm2_5 = null, pm10 = null } = current;
  const { label, severity } = bandFromAqi(us_aqi);
  const pmText = pm2_5 === null ? '' : `, PM2.5 ${pm2_5} µg/m³`;

  return [
    makeEvent({
      id: `aq-amer-${current.time}`,
      type: 'air_quality',
      title: `Amer air quality: AQI ${us_aqi} (${label})${pmText}`,
      lat: AMER.lat,
      lng: AMER.lng,
      timestamp: openMeteoTimeToIso(current.time, data.utc_offset_seconds),
      severity,
      source: 'Open-Meteo AQ',
      isSimulated: false,
      raw: { us_aqi, pm2_5, pm10 },
    }),
  ];
}

module.exports = { fetchAirQuality, bandFromAqi };
