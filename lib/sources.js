'use strict';

const config = require('./config');
const { fetchUsgs } = require('../adapters/usgs');
const { fetchWeather } = require('../adapters/weather');
const { fetchAirQuality } = require('../adapters/airQuality');
const { generateAmerEvents } = require('../adapters/amerSim');
const { fetchCityWeather, fetchCityAirQuality } = require('../adapters/cityGrid');
const { fetchGdelt, getGdeltStats } = require('../adapters/gdelt');
const { fetchSachet, getSachetStats } = require('../adapters/sachet');
const { fetchWmoAlerts, getWmoAlertStats } = require('../adapters/wmoAlerts');
const { fetchGdacs, getGdacsStats } = require('../adapters/gdacs');
const { fetchNasaPower, getNasaPowerStats } = require('../adapters/nasaPower');
const { fetchAnomalies, getAnomalyStats } = require('../adapters/anomaly');
const { fetchWaterlogging } = require('../adapters/waterlogging');
const { fetchWaqi } = require('../adapters/waqi');
const { fetchExposure } = require('../adapters/exposure');
const { fetchHistorical } = require('../adapters/historical');
const { fetchTomTom, getTomTomStats } = require('../adapters/tomtom');
const { fetchContext } = require('../adapters/context');
const { fetchFlood, getFloodStats } = require('../adapters/flood');
const { fetchMappls, getMapplsStats } = require('../adapters/mappls');
const { fetchBhuvan, getBhuvanStats } = require('../adapters/bhuvan');
const { fetchJctslPtal } = require('../adapters/jctslPtal');
const { fetchWorldPop } = require('../adapters/worldpop');
const { fetchEarthEngine, getEarthEngineStats } = require('../adapters/earthEngine');
const PLANNED = require('../connectors');

/**
 * Every data source, one independent adapter each.
 *
 *   key         stable id (also the legacy /health `feeds` key for the original four)
 *   layer       the globe layer its events land on
 *   category    grouping label for /api/sources (e.g. "Weather", "Traffic")
 *   types       which slice of events.json backfills it when it is down
 *   run         the adapter; returns an array of normalized events
 *   ttlMs       background refresh interval (endpoints only read the cached result)
 *   retryMs     optional retry delay after a failed refresh (default config.retryAfterFailureMs)
 *   onRequest   generated locally per request instead of on a timer (the simulator: no upstream)
 *   simulated   its data is generated, so it never counts as a "live source"
 *   stats       optional () => object, surfaced in /health and /api/sources as `detail`
 *   enabled     false -> reported as "disabled", never run
 *   requiresKey whether a missing key is *why* it might be disabled (for /api/sources)
 *   attribution short "who this data is from", shown to judges in the Data Sources panel
 *   docsUrl     link to the provider's own API docs
 */
const SOURCES = [
  { key: 'usgs', label: 'USGS earthquakes', layer: 'earthquakes', category: 'Earthquakes', types: ['earthquake'], run: fetchUsgs, ttlMs: config.ttl.usgs, requiresKey: false, attribution: 'USGS', docsUrl: 'https://earthquake.usgs.gov/fdsnws/event/1/' },
  { key: 'weather', label: 'Open-Meteo weather (Amer)', layer: 'weather', category: 'Weather', types: ['weather'], run: fetchWeather, ttlMs: config.ttl.amerWeather, requiresKey: false, attribution: 'Open-Meteo', docsUrl: 'https://open-meteo.com/en/docs' },
  { key: 'aq', label: 'Open-Meteo air quality (Amer)', layer: 'air_quality', category: 'Air Quality', types: ['air_quality'], run: fetchAirQuality, ttlMs: config.ttl.amerAq, requiresKey: false, attribution: 'Open-Meteo', docsUrl: 'https://open-meteo.com/en/docs/air-quality-api' },
  { key: 'cityWeather', label: 'Open-Meteo weather + rain forecast (world city grid)', layer: 'weather', category: 'Weather', types: [], run: fetchCityWeather, ttlMs: config.ttl.cityWeather, requiresKey: false, attribution: 'Open-Meteo', docsUrl: 'https://open-meteo.com/en/docs' },
  { key: 'cityAq', label: 'Open-Meteo air quality (world city grid)', layer: 'air_quality', category: 'Air Quality', types: [], run: fetchCityAirQuality, ttlMs: config.ttl.cityAq, requiresKey: false, attribution: 'Open-Meteo', docsUrl: 'https://open-meteo.com/en/docs/air-quality-api' },
  { key: 'gdelt', label: 'GDELT news (media mentions)', layer: 'news', category: 'News', types: ['news'], run: fetchGdelt, ttlMs: config.ttl.gdelt, retryMs: 10 * 60 * 1000 /* retrying fast only extends a 429 penalty */, stats: getGdeltStats, requiresKey: false, attribution: 'The GDELT Project', docsUrl: 'https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/' },
  { key: 'sachet', label: 'NDMA SACHET official alerts', layer: 'alerts', category: 'Alerts', types: ['alert'], run: fetchSachet, ttlMs: config.ttl.sachet, stats: getSachetStats, requiresKey: false, attribution: 'NDMA (Govt. of India)', docsUrl: 'https://sachet.ndma.gov.in/' },
  // Official alerts beyond India: national met-service CAP warnings via WMO SWIC (Russia,
  // Europe, South America, North Africa) and GDACS disaster alerts worldwide (e.g. Pakistan).
  { key: 'wmoAlerts', label: 'WMO official weather warnings (Russia, Europe, S. America, N. Africa)', layer: 'alerts', category: 'Alerts', types: [], run: fetchWmoAlerts, ttlMs: config.ttl.wmoAlerts, stats: getWmoAlertStats, requiresKey: false, attribution: 'WMO SWIC / national met services; population: WorldPop', docsUrl: 'https://severeweather.wmo.int/' },
  { key: 'gdacs', label: 'GDACS global disaster alerts', layer: 'alerts', category: 'Alerts', types: [], run: fetchGdacs, ttlMs: config.ttl.gdacs, stats: getGdacsStats, requiresKey: false, attribution: 'GDACS (UN OCHA / EU JRC)', docsUrl: 'https://www.gdacs.org/' },
  // Tier 2: daily, not live (REAL_STATIC). Switch off with DISABLE_NASA_POWER / DISABLE_ANOMALY.
  { key: 'nasaPower', label: 'NASA POWER daily climate (city grid)', layer: 'climate', category: 'Climate', types: ['climate'], run: fetchNasaPower, ttlMs: config.ttl.nasaPower, stats: getNasaPowerStats, enabled: config.enableNasaPower, reason: 'disabled by DISABLE_NASA_POWER', requiresKey: false, attribution: 'NASA POWER', docsUrl: 'https://power.larc.nasa.gov/docs/services/api/' },
  { key: 'anomaly', label: 'Open-Meteo archive temperature anomalies', layer: 'anomaly', category: 'Climate', types: ['anomaly'], run: fetchAnomalies, ttlMs: config.ttl.anomaly, stats: getAnomalyStats, enabled: config.enableAnomaly, reason: 'disabled by DISABLE_ANOMALY', requiresKey: false, attribution: 'Open-Meteo Archive', docsUrl: 'https://open-meteo.com/en/docs/historical-weather-api' },
  { key: 'amer', label: 'Amer simulator', layer: 'simulated', category: 'Simulated', types: ['traffic', 'crowd', 'civic', 'event'], run: generateAmerEvents, onRequest: true, simulated: true, requiresKey: false, attribution: 'CitySync (generated)', docsUrl: null },
  // Ground AQI + traffic. Gated on their own key so a blank .env reports "disabled"
  // (never mock-fakes a ground-station or traffic reading) instead of retrying forever.
  { key: 'waqi', label: 'WAQI ground stations (Jaipur + world cities)', layer: 'aqi_station', category: 'Air Quality', types: ['air_quality'], run: fetchWaqi, ttlMs: config.ttl.waqi, enabled: Boolean(config.keys.waqiToken), reason: 'disabled: WAQI_TOKEN not set', requiresKey: true, keyConfigured: Boolean(config.keys.waqiToken), attribution: 'WAQI / aqicn.org', docsUrl: 'https://aqicn.org/api/' },
  { key: 'tomtom', label: 'TomTom traffic flow + incidents (Jaipur + world cities)', layer: 'traffic', category: 'Traffic', types: ['traffic'], run: fetchTomTom, ttlMs: config.ttl.tomtom, stats: getTomTomStats, enabled: Boolean(config.keys.tomtomKey), reason: 'disabled: TOMTOM_KEY not set', requiresKey: true, keyConfigured: Boolean(config.keys.tomtomKey), attribution: 'TomTom Traffic API', docsUrl: 'https://developer.tomtom.com/traffic-api/documentation' },
  { key: 'waterlogging', label: 'Waterlogging risk (Jaipur, predictive heuristic)', layer: 'waterlogging_risk', category: 'Flood risk', types: ['waterlogging'], run: fetchWaterlogging, ttlMs: config.ttl.waterlogging, requiresKey: false, attribution: 'Open-Meteo + compiled news reports', docsUrl: 'https://open-meteo.com/en/docs' },
  { key: 'flood', label: 'River discharge forecast (GloFAS: Jaipur-area + major world rivers)', layer: 'flood_forecast', category: 'Flood risk', types: [], run: fetchFlood, ttlMs: config.ttl.flood, stats: getFloodStats, requiresKey: false, attribution: 'Open-Meteo Flood (GloFAS)', docsUrl: 'https://open-meteo.com/en/docs/flood-api' },
  { key: 'exposure', label: 'Exposure (OSM facilities, Jaipur)', layer: 'exposure', category: 'Exposure', types: ['exposure'], run: fetchExposure, ttlMs: config.ttl.exposure, requiresKey: false, attribution: 'OpenStreetMap (Overpass)', docsUrl: 'https://overpass-api.de/' },
  { key: 'historical', label: 'Seasonal baseline (Jaipur, Open-Meteo archive)', layer: 'historical_baseline', category: 'Climate', types: ['weather'], run: fetchHistorical, ttlMs: config.ttl.historical, requiresKey: false, attribution: 'Open-Meteo Archive', docsUrl: 'https://open-meteo.com/en/docs/historical-weather-api' },
  { key: 'context', label: 'Static context (Jaipur industrial + POIs)', layer: 'industrial_context', category: 'Context', types: ['event'], run: fetchContext, ttlMs: config.ttl.context, requiresKey: false, attribution: 'CitySync (static context)', docsUrl: null },
  // Tier 2: India geo + static research imports + satellite. Keyed ones gate on their key.
  { key: 'mappls', label: 'Mappls nearest emergency facilities (Amer)', layer: 'pois', category: 'Geocoding', types: [], run: fetchMappls, ttlMs: config.ttl.mappls, stats: getMapplsStats, enabled: Boolean(config.keys.mapplsApiKey), reason: 'disabled: MAPPLS_API_KEY not set', requiresKey: true, keyConfigured: Boolean(config.keys.mapplsApiKey), attribution: 'Mappls (MapmyIndia)', docsUrl: 'https://developer.mappls.com/mapping/nearby-api' },
  { key: 'bhuvan', label: 'ISRO Bhuvan road routes (Amer to critical destinations)', layer: 'access_routes', category: 'Routing', types: [], run: fetchBhuvan, ttlMs: config.ttl.bhuvan, retryMs: 10 * 60 * 1000 /* slow, flaky server */, stats: getBhuvanStats, enabled: Boolean(config.keys.bhuvanKey), reason: 'disabled: BHUVAN_KEY not set', requiresKey: true, keyConfigured: Boolean(config.keys.bhuvanKey), attribution: 'ISRO Bhuvan (NRSC)', docsUrl: 'https://bhuvan-app1.nrsc.gov.in/api/' },
  { key: 'jctslPtal', label: 'JCTSL-PTAL transit accessibility (Jaipur wards)', layer: 'transit', category: 'Transit', types: [], run: fetchJctslPtal, ttlMs: config.ttl.jctslPtal, requiresKey: false, attribution: 'JCTSL-PTAL (community dataset)', docsUrl: 'https://github.com/SoniAnmol/JCTSL-PTAL' },
  { key: 'worldpop', label: 'WorldPop population (Jaipur wards)', layer: 'exposure', category: 'Exposure', types: [], run: fetchWorldPop, ttlMs: config.ttl.worldpop, requiresKey: false, attribution: 'WorldPop (CC BY 4.0)', docsUrl: 'https://www.worldpop.org/' },
  { key: 'gee', label: 'Google Earth Engine MODIS heat + vegetation (Jaipur)', layer: 'climate', category: 'Climate', types: [], run: fetchEarthEngine, ttlMs: config.ttl.earthEngine, retryMs: 30 * 60 * 1000, stats: getEarthEngineStats, enabled: Boolean(config.keys.earthEngine), reason: 'disabled: EARTH_ENGINE_* not set', requiresKey: true, keyConfigured: Boolean(config.keys.earthEngine), attribution: 'Google Earth Engine / NASA MODIS', docsUrl: 'https://developers.google.com/earth-engine' },
  // Planned, not integrated: listed so /api/sources and /health show the architecture
  // honestly (what's live vs. what's designed-in but deferred, and why).
  ...PLANNED.map((p) => ({ ...p, types: [], enabled: false })),
];

module.exports = { SOURCES };
