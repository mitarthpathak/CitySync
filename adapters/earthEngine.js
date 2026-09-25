'use strict';

// Google Earth Engine (service account): MODIS satellite composites over the Jaipur box.
//   - MOD11A1 LST_Day_1km: mean daytime land-surface temperature, last 8 days (urban heat)
//   - MOD13A2 NDVI: latest 16-day vegetation index (green cover)
// Tagged REAL_STATIC: real satellite measurements, but composites a few days old, and land
// SURFACE temperature (hotter than the air temperature a weather station reports).
//
// Needs the Cloud project registered for Earth Engine (one-time, in the GCP console);
// until then Earth Engine answers 403 and this source reports down with that message.

const ee = require('@google/earthengine');
const config = require('../lib/config');
const { makeEvent } = require('../lib/event');
const { jaipurBounds } = require('../lib/heuristics');

let initPromise = null;
let lastStats = null;

function init() {
  const creds = config.keys.earthEngine;
  if (!creds) return Promise.reject(new Error('EARTH_ENGINE_* not set'));
  initPromise ??= new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      { client_email: creds.clientEmail, private_key: creds.privateKey },
      () => ee.initialize(null, null, resolve, (err) => reject(new Error(`earth engine init: ${err}`)), null, creds.project),
      (err) => reject(new Error(`earth engine auth: ${err}`)),
    );
  }).catch((err) => {
    initPromise = null; // retry auth on the next refresh
    throw err;
  });
  return initPromise;
}

const evaluate = (obj) => new Promise((resolve, reject) => obj.evaluate((value, err) => (err ? reject(new Error(String(err))) : resolve(value))));

async function fetchEarthEngine() {
  await init();
  const { west, south, east, north } = jaipurBounds;
  const region = ee.Geometry.Rectangle([west, south, east, north]);
  const end = ee.Date(Date.now());

  const lstImage = ee.ImageCollection('MODIS/061/MOD11A1').filterDate(end.advance(-8, 'day'), end).select('LST_Day_1km').mean().multiply(0.02).subtract(273.15);
  const ndviCollection = ee.ImageCollection('MODIS/061/MOD13A2').filterDate(end.advance(-48, 'day'), end).select('NDVI').sort('system:time_start', false);
  const ndviImage = ee.Image(ndviCollection.first());
  const reduce = (img, band) => img.reduceRegion({ reducer: ee.Reducer.mean().combine(ee.Reducer.max(), '', true), geometry: region, scale: 1000, maxPixels: 1e9 }).select([`${band}_mean`, `${band}_max`]);

  const result = await evaluate(ee.Dictionary({
    lst: reduce(lstImage, 'LST_Day_1km'),
    ndvi: reduce(ndviImage.multiply(0.0001), 'NDVI'),
    ndviDate: ndviImage.date().format('YYYY-MM-dd'),
  }));

  const lat = (north + south) / 2;
  const lng = (east + west) / 2;
  const now = new Date().toISOString();
  const events = [];
  const lstMean = result?.lst?.LST_Day_1km_mean;
  if (Number.isFinite(lstMean)) {
    const lstMax = result.lst.LST_Day_1km_max;
    events.push(makeEvent({
      id: 'gee-lst-jaipur',
      type: 'climate',
      layer: 'climate',
      tag: 'REAL_STATIC',
      sourceUrl: 'https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MOD11A1',
      title: `Satellite land-surface temp, Jaipur (8-day mean): ${lstMean.toFixed(1)}°C, hottest ${lstMax.toFixed(1)}°C`,
      lat,
      lng,
      timestamp: now,
      severity: lstMax >= 50 ? 4 : lstMax >= 45 ? 3 : lstMean >= 38 ? 2 : 1,
      source: 'Google Earth Engine (MODIS)',
      raw: { lst_mean_c: Number(lstMean.toFixed(2)), lst_max_c: Number(lstMax.toFixed(2)), window_days: 8, note: 'Daytime LAND SURFACE temperature from MODIS (runs hotter than air temperature). Satellite composite, not live.' },
    }));
  }
  const ndviMean = result?.ndvi?.NDVI_mean;
  if (Number.isFinite(ndviMean)) {
    events.push(makeEvent({
      id: 'gee-ndvi-jaipur',
      type: 'climate',
      layer: 'climate',
      tag: 'REAL_STATIC',
      sourceUrl: 'https://developers.google.com/earth-engine/datasets/catalog/MODIS_061_MOD13A2',
      title: `Vegetation index (NDVI), Jaipur: ${ndviMean.toFixed(2)} (${result.ndviDate})`,
      lat,
      lng,
      timestamp: now,
      severity: ndviMean < 0.15 ? 2 : 1,
      source: 'Google Earth Engine (MODIS)',
      raw: { ndvi_mean: Number(ndviMean.toFixed(3)), ndvi_max: Number(result.ndvi.NDVI_max.toFixed(3)), composite_date: result.ndviDate, note: '16-day MODIS NDVI composite: -1..1, higher = greener. Not live.' },
    }));
  }
  lastStats = { lstMean: lstMean ?? null, ndviMean: ndviMean ?? null, ndviDate: result?.ndviDate ?? null };
  if (!events.length) throw new Error('earth engine: no MODIS pixels over Jaipur in the window');
  return events;
}

const getEarthEngineStats = () => lastStats;

module.exports = { fetchEarthEngine, getEarthEngineStats };
