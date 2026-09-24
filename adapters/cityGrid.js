'use strict';

const { fetchJson } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const { openMeteoTimeToIso } = require('../lib/time');
const { describeWeatherCode, severityFromTemperature } = require('./weather');
const { bandFromAqi } = require('./airQuality');
const CITIES = require('../config/world-cities');

// Open-Meteo takes comma-separated coordinate lists and answers with an array in the same
// order, so the whole grid is ONE weather request + ONE air-quality request.
const LATS = CITIES.map((c) => c.lat).join(',');
const LNGS = CITIES.map((c) => c.lng).join(',');

const WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${LATS}&longitude=${LNGS}` +
  '&current=temperature_2m,weather_code,wind_speed_10m' +
  '&daily=temperature_2m_max&forecast_days=1&timezone=auto';

const AQ_URL =
  'https://air-quality-api.open-meteo.com/v1/air-quality' +
  `?latitude=${LATS}&longitude=${LNGS}` +
  '&current=us_aqi,pm2_5&timezone=auto';

const slug = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** Open-Meteo returns a bare object for one location, an array for several. */
function asList(data) {
  const list = Array.isArray(data) ? data : [data];
  if (list.length !== CITIES.length) {
    throw new Error(`unexpected payload: ${list.length} locations for ${CITIES.length} cities`);
  }
  return list;
}

// Today's forecast max per city, remembered for the anomaly source (Tier 2) so it can
// compare against climatology without spending another forecast request.
let latestDailyMax = { at: 0, byCity: new Map() };

/** One Open-Meteo request -> one weather event per city. */
async function fetchCityWeather() {
  const list = asList(await fetchJson(WEATHER_URL, { timeoutMs: 12000 }));
  const events = [];
  const dailyMax = new Map();

  list.forEach((data, i) => {
    const city = CITIES[i];
    const current = data?.current;
    if (!current || typeof current.temperature_2m !== 'number' || typeof current.weather_code !== 'number') return;

    const tempC = current.temperature_2m;
    const { label, severity: conditionSeverity } = describeWeatherCode(current.weather_code);
    const heatNote = tempC >= 40 ? ' (extreme heat)' : tempC >= 35 ? ' (heat)' : '';
    const todayMax = data?.daily?.temperature_2m_max?.[0];
    if (typeof todayMax === 'number') dailyMax.set(city.name, { city, maxC: todayMax, date: data.daily.time?.[0] });

    try {
      events.push(
        makeEvent({
          id: `weather-${slug(city.name)}-${current.time}`,
          type: 'weather',
          title: `${city.name}: ${label}, ${tempC}°C${heatNote}`,
          lat: city.lat,
          lng: city.lng,
          timestamp: openMeteoTimeToIso(current.time, data.utc_offset_seconds),
          severity: Math.max(conditionSeverity, severityFromTemperature(tempC)),
          source: 'Open-Meteo',
          isSimulated: false,
          layer: 'weather',
          tag: 'REAL_LIVE',
          sourceUrl: `https://open-meteo.com/en/docs#latitude=${city.lat}&longitude=${city.lng}`,
          raw: {
            city: city.name,
            country: city.country,
            weather_code: current.weather_code,
            temperature_c: tempC,
            today_max_c: typeof todayMax === 'number' ? todayMax : null,
            wind_speed_kmh: current.wind_speed_10m ?? null,
          },
        }),
      );
    } catch {
      /* one bad city must not drop the grid */
    }
  });

  if (!events.length) throw new Error('no usable city in the weather response');
  latestDailyMax = { at: Date.now(), byCity: dailyMax };
  return events;
}

/** One Open-Meteo Air Quality request -> one air_quality event per city. */
async function fetchCityAirQuality() {
  const list = asList(await fetchJson(AQ_URL, { timeoutMs: 12000 }));
  const events = [];

  list.forEach((data, i) => {
    const city = CITIES[i];
    const current = data?.current;
    // Open-Meteo returns null us_aqi where the model has no value; skip, never invent one.
    if (!current || typeof current.us_aqi !== 'number') return;

    const { us_aqi, pm2_5 = null } = current;
    const { label, severity } = bandFromAqi(us_aqi);
    const pmText = pm2_5 === null ? '' : `, PM2.5 ${pm2_5} µg/m³`;
    try {
      events.push(
        makeEvent({
          id: `aq-${slug(city.name)}-${current.time}`,
          type: 'air_quality',
          title: `${city.name} air quality: AQI ${us_aqi} (${label})${pmText}`,
          lat: city.lat,
          lng: city.lng,
          timestamp: openMeteoTimeToIso(current.time, data.utc_offset_seconds),
          severity,
          source: 'Open-Meteo AQ',
          isSimulated: false,
          layer: 'air_quality',
          tag: 'REAL_LIVE',
          sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api',
          raw: { city: city.name, country: city.country, us_aqi, band: label, pm2_5 },
        }),
      );
    } catch {
      /* skip */
    }
  });

  if (!events.length) throw new Error('no usable city in the air-quality response');
  return events;
}

const getLatestDailyMax = () => latestDailyMax;

module.exports = { fetchCityWeather, fetchCityAirQuality, getLatestDailyMax, CITIES, slug };
