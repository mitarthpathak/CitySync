'use strict';

const { fetchJson } = require('../lib/http');
const { makeEvent } = require('../lib/event');
const { openMeteoTimeToIso } = require('../lib/time');
const { AMER } = require('../lib/geo');

const URL =
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${AMER.lat}&longitude=${AMER.lng}` +
  '&current=temperature_2m,weather_code,wind_speed_10m&timezone=auto';

// WMO weather interpretation codes -> label + base severity.
function describeWeatherCode(code) {
  if (code === 0) return { label: 'Clear sky', severity: 2 };
  if (code === 1) return { label: 'Mainly clear', severity: 2 };
  if (code === 2) return { label: 'Partly cloudy', severity: 2 };
  if (code === 3) return { label: 'Overcast', severity: 2 };
  if (code === 45 || code === 48) return { label: 'Fog', severity: 2 };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', severity: 3 };
  if (code >= 61 && code <= 67) return { label: 'Rain', severity: 3 };
  if (code >= 71 && code <= 77) return { label: 'Snow', severity: 3 };
  if (code >= 80 && code <= 82) return { label: 'Rain showers', severity: 3 };
  if (code === 85 || code === 86) return { label: 'Snow showers', severity: 3 };
  if (code === 95) return { label: 'Thunderstorm', severity: 4 };
  if (code === 96 || code === 99) return { label: 'Thunderstorm with hail', severity: 4 };
  return { label: 'Unknown conditions', severity: 2 };
}

function severityFromTemperature(tempC) {
  if (tempC >= 40) return 4; // extreme heat
  if (tempC >= 35) return 3; // heat
  return 1;
}

/** Real current weather at Amer (Open-Meteo, keyless). One event. */
async function fetchWeather() {
  const data = await fetchJson(URL);
  const current = data?.current;
  if (!current || typeof current.temperature_2m !== 'number' || typeof current.weather_code !== 'number') {
    throw new Error('unexpected payload: missing current temperature / weather_code');
  }

  const tempC = current.temperature_2m;
  const { label, severity: conditionSeverity } = describeWeatherCode(current.weather_code);
  const heatNote = tempC >= 40 ? ' (extreme heat)' : tempC >= 35 ? ' (heat)' : '';

  return [
    makeEvent({
      id: `weather-amer-${current.time}`,
      type: 'weather',
      title: `${label}, ${tempC}°C at Amer${heatNote}`,
      lat: AMER.lat,
      lng: AMER.lng,
      timestamp: openMeteoTimeToIso(current.time, data.utc_offset_seconds),
      severity: Math.max(conditionSeverity, severityFromTemperature(tempC)),
      source: 'Open-Meteo',
      isSimulated: false,
      raw: {
        weather_code: current.weather_code,
        temperature_c: tempC,
        wind_speed_kmh: current.wind_speed_10m ?? null,
      },
    }),
  ];
}

module.exports = { fetchWeather };
