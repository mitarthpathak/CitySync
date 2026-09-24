'use strict';

const config = require('./config');
const { fetchUsgs } = require('../adapters/usgs');
const { fetchWeather } = require('../adapters/weather');
const { fetchAirQuality } = require('../adapters/airQuality');
const { generateAmerEvents } = require('../adapters/amerSim');
const { fetchCityWeather, fetchCityAirQuality } = require('../adapters/cityGrid');
const { fetchGdelt, getGdeltStats } = require('../adapters/gdelt');
const { fetchSachet, getSachetStats } = require('../adapters/sachet');
const { fetchNasaPower, getNasaPowerStats } = require('../adapters/nasaPower');
const { fetchAnomalies, getAnomalyStats } = require('../adapters/anomaly');
const { fetchWaterlogging } = require('../adapters/waterlogging');
const { fetchWaqi } = require('../adapters/waqi');
const { fetchExposure } = require('../adapters/exposure');
const { fetchHistorical } = require('../adapters/historical');
const { fetchTomTom } = require('../adapters/tomtom');
const { fetchContext } = require('../adapters/context');
const PLANNED = require('../connectors');

/**
 * Every data source, one independent adapter each.
 *
 *   key       stable id (also the legacy /health `feeds` key for the original four)
 *   layer     the globe layer its events land on
 *   types     which slice of events.json backfills it when it is down
 *   run       the adapter; returns an array of normalized events
 *   ttlMs     background refresh interval (endpoints only read the cached result)
 *   retryMs   optional retry delay after a failed refresh (default config.retryAfterFailureMs)
 *   onRequest generated locally per request instead of on a timer (the simulator: no upstream)
 *   simulated its data is generated, so it never counts as a "live source"
 *   stats     optional () => object, surfaced in /health as `detail`
 *   enabled   false -> reported as "disabled", never run
 */
const SOURCES = [
  { key: 'usgs', label: 'USGS earthquakes', layer: 'earthquakes', types: ['earthquake'], run: fetchUsgs, ttlMs: config.ttl.usgs },
  { key: 'weather', label: 'Open-Meteo weather (Amer)', layer: 'weather', types: ['weather'], run: fetchWeather, ttlMs: config.ttl.amerWeather },
  { key: 'aq', label: 'Open-Meteo air quality (Amer)', layer: 'air_quality', types: ['air_quality'], run: fetchAirQuality, ttlMs: config.ttl.amerAq },
  { key: 'cityWeather', label: 'Open-Meteo weather (world city grid)', layer: 'weather', types: [], run: fetchCityWeather, ttlMs: config.ttl.cityWeather },
  { key: 'cityAq', label: 'Open-Meteo air quality (world city grid)', layer: 'air_quality', types: [], run: fetchCityAirQuality, ttlMs: config.ttl.cityAq },
  { key: 'gdelt', label: 'GDELT news (media mentions)', layer: 'news', types: ['news'], run: fetchGdelt, ttlMs: config.ttl.gdelt, retryMs: 10 * 60 * 1000 /* retrying fast only extends a 429 penalty */, stats: getGdeltStats },
  { key: 'sachet', label: 'NDMA SACHET official alerts', layer: 'alerts', types: ['alert'], run: fetchSachet, ttlMs: config.ttl.sachet, stats: getSachetStats },
  // Tier 2: daily, not live (REAL_STATIC). Switch off with DISABLE_NASA_POWER / DISABLE_ANOMALY.
  { key: 'nasaPower', label: 'NASA POWER daily climate (city grid)', layer: 'climate', types: ['climate'], run: fetchNasaPower, ttlMs: config.ttl.nasaPower, stats: getNasaPowerStats, enabled: config.enableNasaPower, reason: 'disabled by DISABLE_NASA_POWER' },
  { key: 'anomaly', label: 'Open-Meteo archive temperature anomalies', layer: 'anomaly', types: ['anomaly'], run: fetchAnomalies, ttlMs: config.ttl.anomaly, stats: getAnomalyStats, enabled: config.enableAnomaly, reason: 'disabled by DISABLE_ANOMALY' },
  { key: 'amer', label: 'Amer simulator', layer: 'simulated', types: ['traffic', 'crowd', 'civic', 'event'], run: generateAmerEvents, onRequest: true, simulated: true },
  // Jaipur/Amer local-view enrichment. WAQI and TomTom are gated on their own token, exactly
  // like the Tier 2 sources above, so a blank .env reports them "disabled" (never mock-fakes
  // ground-station or traffic data) instead of silently retrying and logging failures.
  { key: 'waqi', label: 'WAQI ground stations (Jaipur)', layer: 'aqi_station', types: ['air_quality'], run: fetchWaqi, ttlMs: config.ttl.waqi, enabled: Boolean(process.env.WAQI_TOKEN), reason: 'disabled: WAQI_TOKEN not set' },
  { key: 'tomtom', label: 'TomTom traffic (Jaipur)', layer: 'traffic', types: ['traffic'], run: fetchTomTom, ttlMs: config.ttl.tomtom, enabled: Boolean(process.env.TOMTOM_KEY), reason: 'disabled: TOMTOM_KEY not set' },
  { key: 'waterlogging', label: 'Waterlogging risk (Jaipur, heuristic)', layer: 'waterlogging_risk', types: ['waterlogging'], run: fetchWaterlogging, ttlMs: config.ttl.waterlogging },
  { key: 'exposure', label: 'Exposure (OSM facilities, Jaipur)', layer: 'exposure', types: ['exposure'], run: fetchExposure, ttlMs: config.ttl.exposure },
  { key: 'historical', label: 'Seasonal baseline (Jaipur, Open-Meteo archive)', layer: 'historical_baseline', types: ['weather'], run: fetchHistorical, ttlMs: config.ttl.historical },
  { key: 'context', label: 'Static context (Jaipur industrial + POIs)', layer: 'industrial_context', types: ['event'], run: fetchContext, ttlMs: config.ttl.context },
  // Planned, not integrated: listed so /health shows the architecture honestly.
  ...PLANNED.map((p) => ({ ...p, types: [], enabled: false })),
];

module.exports = { SOURCES };
