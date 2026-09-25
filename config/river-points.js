'use strict';

// Open-Meteo Flood (GloFAS) is a river-grid model: a point that isn't ON a river's
// modelled channel comes back with near-zero, useless discharge. Every point here is
// chosen because a real river channel runs through it (a city that straddles/sits
// directly on the named river, or a documented stretch of a local river) - NOT
// verified against a live response in this dev environment (no outbound network access
// here); see the adapter's own startup check and the session report for what to
// re-verify once this runs somewhere with real internet access.
module.exports = Object.freeze({
  jaipur: [
    // Dravyavati River rejuvenation stretch, Jhotwara, Jaipur.
    { name: 'Dravyavati River (Jhotwara)', river: 'Dravyavati', lat: 26.933, lng: 75.774 },
    // Banas River, Tonk district, ~50 km south of Jaipur - the nearest real river with
    // meaningful GloFAS discharge; nothing inside Jaipur city itself is a modelled river.
    { name: 'Banas River (Tonk)', river: 'Banas', lat: 26.15, lng: 75.85 },
  ],
  world: [
    { name: 'Ganges (Varanasi)', river: 'Ganges', lat: 25.3176, lng: 83.0064 },
    { name: 'Amazon (Óbidos)', river: 'Amazon', lat: -1.9167, lng: -55.5167 },
    { name: 'Nile (Cairo)', river: 'Nile', lat: 30.0444, lng: 31.2357 },
    { name: 'Mississippi (Memphis)', river: 'Mississippi', lat: 35.1495, lng: -90.049 },
    { name: 'Danube (Budapest)', river: 'Danube', lat: 47.4979, lng: 19.0402 },
    { name: 'Mekong (Phnom Penh)', river: 'Mekong', lat: 11.5564, lng: 104.9282 },
    { name: 'Yangtze (Wuhan)', river: 'Yangtze', lat: 30.5928, lng: 114.3055 },
    { name: 'Rhine (Cologne)', river: 'Rhine', lat: 50.9375, lng: 6.9603 },
    { name: 'Niger (Niamey)', river: 'Niger', lat: 13.5127, lng: 2.1128 },
    { name: 'Brahmaputra (Guwahati)', river: 'Brahmaputra', lat: 26.1445, lng: 91.7362 },
  ],
});
