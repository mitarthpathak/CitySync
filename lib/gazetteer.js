'use strict';

// A small, deliberately conservative gazetteer. Used to place:
//   - GDELT articles: by a place name that literally appears in the headline
//   - SACHET alerts:  by the Indian state named in the alert / its issuing office
// Coordinates are approximate centroids. Names that are commonly something else in English
// headlines (Georgia, Jordan, Chad, Turkey-the-bird is fine since matching is case-sensitive,
// Washington, Victoria, Niger vs Nigeria...) are left out on purpose: an article we cannot
// place confidently is dropped, never guessed.

const WORLD_CITIES = require('../config/world-cities');

const INDIAN_STATES = {
  'Andhra Pradesh': [15.9129, 79.74],
  'Arunachal Pradesh': [28.218, 94.7278],
  Assam: [26.2006, 92.9376],
  Bihar: [25.0961, 85.3131],
  Chhattisgarh: [21.2787, 81.8661],
  Goa: [15.2993, 74.124],
  Gujarat: [22.2587, 71.1924],
  Haryana: [29.0588, 76.0856],
  'Himachal Pradesh': [31.1048, 77.1734],
  Jharkhand: [23.6102, 85.2799],
  Karnataka: [15.3173, 75.7139],
  Kerala: [10.8505, 76.2711],
  'Madhya Pradesh': [22.9734, 78.6569],
  Maharashtra: [19.7515, 75.7139],
  Manipur: [24.6637, 93.9063],
  Meghalaya: [25.467, 91.3662],
  Mizoram: [23.1645, 92.9376],
  Nagaland: [26.1584, 94.5624],
  Odisha: [20.9517, 85.0985],
  Punjab: [31.1471, 75.3412],
  Rajasthan: [27.0238, 74.2179],
  Sikkim: [27.533, 88.5122],
  'Tamil Nadu': [11.1271, 78.6569],
  Telangana: [18.1124, 79.0193],
  Tripura: [23.9408, 91.9882],
  'Uttar Pradesh': [26.8467, 80.9462],
  Uttarakhand: [30.0668, 79.0193],
  'West Bengal': [22.9868, 87.855],
  'Andaman and Nicobar': [11.7401, 92.6586],
  Chandigarh: [30.7333, 76.7794],
  Delhi: [28.7041, 77.1025],
  'Jammu and Kashmir': [33.7782, 76.5762],
  Ladakh: [34.1526, 77.577],
  Lakshadweep: [10.5667, 72.6417],
  Puducherry: [11.9416, 79.8083],
  'Dadra and Nagar Haveli and Daman and Diu': [20.3974, 72.8328],
};
const STATE_ALIASES = {
  Orissa: 'Odisha',
  'Jammu & Kashmir': 'Jammu and Kashmir',
  'J&K': 'Jammu and Kashmir',
  'Andaman & Nicobar': 'Andaman and Nicobar',
  Pondicherry: 'Puducherry',
  'NCT of Delhi': 'Delhi',
};

// IMD regional / state meteorological centres: SACHET names them as the issuing office.
const IMD_CENTRES = {
  Agartala: [23.8315, 91.2868, 'Tripura'],
  Ahmedabad: [23.0225, 72.5714, 'Gujarat'],
  Amaravati: [16.5062, 80.648, 'Andhra Pradesh'],
  Bengaluru: [12.9716, 77.5946, 'Karnataka'],
  Bhopal: [23.2599, 77.4126, 'Madhya Pradesh'],
  Bhubaneswar: [20.2961, 85.8245, 'Odisha'],
  Chandigarh: [30.7333, 76.7794, 'Chandigarh'],
  Chennai: [13.0827, 80.2707, 'Tamil Nadu'],
  Dehradun: [30.3165, 78.0322, 'Uttarakhand'],
  Gangtok: [27.3389, 88.6065, 'Sikkim'],
  Goa: [15.4909, 73.8278, 'Goa'],
  Guwahati: [26.1445, 91.7362, 'Assam'],
  Hyderabad: [17.385, 78.4867, 'Telangana'],
  Imphal: [24.817, 93.9368, 'Manipur'],
  Itanagar: [27.0844, 93.6053, 'Arunachal Pradesh'],
  Jaipur: [26.9124, 75.7873, 'Rajasthan'],
  Kohima: [25.6751, 94.1086, 'Nagaland'],
  Kolkata: [22.5726, 88.3639, 'West Bengal'],
  Lucknow: [26.8467, 80.9462, 'Uttar Pradesh'],
  Mumbai: [19.076, 72.8777, 'Maharashtra'],
  Nagpur: [21.1458, 79.0882, 'Maharashtra'],
  'New Delhi': [28.6139, 77.209, 'Delhi'],
  Patna: [25.5941, 85.1376, 'Bihar'],
  Raipur: [21.2514, 81.6296, 'Chhattisgarh'],
  Ranchi: [23.3441, 85.3096, 'Jharkhand'],
  Shillong: [25.5788, 91.8933, 'Meghalaya'],
  Shimla: [31.1048, 77.1734, 'Himachal Pradesh'],
  Srinagar: [34.0837, 74.7973, 'Jammu and Kashmir'],
  Thiruvananthapuram: [8.5241, 76.9366, 'Kerala'],
  Visakhapatnam: [17.6868, 83.2185, 'Andhra Pradesh'],
  Aizawl: [23.7271, 92.7176, 'Mizoram'],
};

const COUNTRIES = {
  Afghanistan: [33.94, 67.71], Albania: [41.15, 20.17], Algeria: [28.03, 1.66], Angola: [-11.2, 17.87],
  Argentina: [-38.42, -63.62], Armenia: [40.07, 45.04], Australia: [-25.27, 133.78], Austria: [47.52, 14.55],
  Azerbaijan: [40.14, 47.58], Bangladesh: [23.68, 90.36], Belgium: [50.5, 4.47], Bolivia: [-16.29, -63.59],
  Bosnia: [43.92, 17.68], Brazil: [-14.24, -51.93], Bulgaria: [42.73, 25.49], Cambodia: [12.57, 104.99],
  Cameroon: [7.37, 12.35], Canada: [56.13, -106.35], Chile: [-35.68, -71.54], China: [35.86, 104.2],
  Colombia: [4.57, -74.3], 'Costa Rica': [9.75, -83.75], Croatia: [45.1, 15.2], Cuba: [21.52, -77.78],
  'Czech Republic': [49.82, 15.47], Denmark: [56.26, 9.5], 'Dominican Republic': [18.74, -70.16],
  Ecuador: [-1.83, -78.18], Egypt: [26.82, 30.8], Ethiopia: [9.15, 40.49], Fiji: [-17.71, 178.07],
  Finland: [61.92, 25.75], France: [46.23, 2.21], Germany: [51.17, 10.45], Ghana: [7.95, -1.02],
  Greece: [39.07, 21.82], Guatemala: [15.78, -90.23], Haiti: [18.97, -72.29], Honduras: [15.2, -86.24],
  Hungary: [47.16, 19.5], Iceland: [64.96, -19.02], India: [20.59, 78.96], Indonesia: [-0.79, 113.92],
  Iran: [32.43, 53.69], Iraq: [33.22, 43.68], Ireland: [53.41, -8.24], Israel: [31.05, 34.85],
  Italy: [41.87, 12.57], Jamaica: [18.11, -77.3], Japan: [36.2, 138.25], Kazakhstan: [48.02, 66.92],
  Kenya: [-0.02, 37.91], Kuwait: [29.31, 47.48], Laos: [19.86, 102.5], Lebanon: [33.85, 35.86],
  Libya: [26.34, 17.23], Madagascar: [-18.77, 46.87], Malawi: [-13.25, 34.3], Malaysia: [4.21, 101.98],
  Mexico: [23.63, -102.55], Mongolia: [46.86, 103.85], Morocco: [31.79, -7.09], Mozambique: [-18.67, 35.53],
  Myanmar: [21.91, 95.96], Nepal: [28.39, 84.12], Netherlands: [52.13, 5.29], 'New Zealand': [-40.9, 174.89],
  Nicaragua: [12.87, -85.21], Nigeria: [9.08, 8.68], 'North Korea': [40.34, 127.51], Norway: [60.47, 8.47],
  Oman: [21.47, 55.98], Pakistan: [30.38, 69.35], Palestine: [31.95, 35.23], Gaza: [31.35, 34.31],
  Panama: [8.54, -80.78], 'Papua New Guinea': [-6.31, 143.96], Paraguay: [-23.44, -58.44], Peru: [-9.19, -75.02],
  Philippines: [12.88, 121.77], Poland: [51.92, 19.15], Portugal: [39.4, -8.22], Qatar: [25.35, 51.18],
  Romania: [45.94, 24.97], Russia: [61.52, 105.32], Rwanda: [-1.94, 29.87], 'Saudi Arabia': [23.89, 45.08],
  Senegal: [14.5, -14.45], Serbia: [44.02, 21.01], Somalia: [5.15, 46.2], 'South Africa': [-30.56, 22.94],
  'South Korea': [35.91, 127.77], 'South Sudan': [6.88, 31.31], Spain: [40.46, -3.75], 'Sri Lanka': [7.87, 80.77],
  Sudan: [12.86, 30.22], Sweden: [60.13, 18.64], Switzerland: [46.82, 8.23], Syria: [34.8, 38.99],
  Taiwan: [23.7, 120.96], Tanzania: [-6.37, 34.89], Thailand: [15.87, 100.99], Tunisia: [33.89, 9.54],
  Türkiye: [38.96, 35.24], Turkey: [38.96, 35.24], Uganda: [1.37, 32.29], Ukraine: [48.38, 31.17],
  'United Arab Emirates': [23.42, 53.85], UAE: [23.42, 53.85], 'United Kingdom': [55.38, -3.44], UK: [55.38, -3.44],
  Britain: [55.38, -3.44], England: [52.36, -1.17], Scotland: [56.49, -4.2], Wales: [52.13, -3.78],
  Uruguay: [-32.52, -55.77], Uzbekistan: [41.38, 64.59], Venezuela: [6.42, -66.59], Vietnam: [14.06, 108.28],
  Yemen: [15.55, 48.52], Zambia: [-13.13, 27.85], Zimbabwe: [-19.02, 29.15], 'Puerto Rico': [18.22, -66.59],
  'Hong Kong': [22.32, 114.17], Congo: [-4.04, 21.76], 'DR Congo': [-4.04, 21.76],
};

// Unambiguous US states / Canadian provinces / Australian states that show up constantly in
// disaster news. (Georgia and Washington are omitted: too often not the state.)
const REGIONS = {
  California: [36.78, -119.42, 'United States'], Texas: [31.97, -99.9, 'United States'],
  Florida: [27.66, -81.52, 'United States'], Louisiana: [30.98, -91.96, 'United States'],
  Oklahoma: [35.47, -97.52, 'United States'], Arizona: [34.05, -111.09, 'United States'],
  Oregon: [43.8, -120.55, 'United States'], Colorado: [39.55, -105.78, 'United States'],
  'New Mexico': [34.52, -105.87, 'United States'], Alaska: [64.2, -149.49, 'United States'],
  Hawaii: [19.9, -155.58, 'United States'], Mississippi: [32.35, -89.4, 'United States'],
  Alabama: [32.32, -86.9, 'United States'], Tennessee: [35.52, -86.58, 'United States'],
  Kentucky: [37.84, -84.27, 'United States'], 'North Carolina': [35.76, -79.02, 'United States'],
  'South Carolina': [33.84, -81.16, 'United States'], Virginia: [37.43, -78.66, 'United States'],
  Pennsylvania: [41.2, -77.19, 'United States'], Ohio: [40.42, -82.91, 'United States'],
  Michigan: [44.31, -85.6, 'United States'], Minnesota: [46.73, -94.69, 'United States'],
  Nevada: [38.8, -116.42, 'United States'], Utah: [39.32, -111.09, 'United States'],
  Montana: [46.88, -110.36, 'United States'], Idaho: [44.07, -114.74, 'United States'],
  Missouri: [37.96, -91.83, 'United States'], Iowa: [41.88, -93.1, 'United States'],
  Kansas: [39.01, -98.48, 'United States'], Nebraska: [41.49, -99.9, 'United States'],
  Arkansas: [35.2, -91.83, 'United States'], Wisconsin: [43.78, -88.79, 'United States'],
  Illinois: [40.63, -89.4, 'United States'], Indiana: [40.27, -86.13, 'United States'],
  'New Jersey': [40.06, -74.41, 'United States'], Massachusetts: [42.41, -71.38, 'United States'],
  Maryland: [39.05, -76.64, 'United States'], Vermont: [44.56, -72.58, 'United States'],
  Maine: [45.25, -69.45, 'United States'], Wyoming: [43.08, -107.29, 'United States'],
  'North Dakota': [47.55, -101.0, 'United States'], 'South Dakota': [43.97, -99.9, 'United States'],
  Ontario: [51.25, -85.32, 'Canada'], Quebec: [52.94, -73.55, 'Canada'], Alberta: [53.93, -116.58, 'Canada'],
  'British Columbia': [53.73, -127.65, 'Canada'], Manitoba: [53.76, -98.81, 'Canada'],
  Saskatchewan: [52.94, -106.45, 'Canada'], 'Nova Scotia': [44.68, -63.74, 'Canada'],
  Queensland: [-20.92, 142.7, 'Australia'], 'New South Wales': [-31.84, 145.61, 'Australia'],
  Tasmania: [-41.45, 145.97, 'Australia'], 'Western Australia': [-27.67, 121.63, 'Australia'],
  Sindh: [25.89, 68.52, 'Pakistan'], 'Khyber Pakhtunkhwa': [34.95, 72.33, 'Pakistan'],
  Balochistan: [28.49, 65.1, 'Pakistan'], Sichuan: [30.65, 104.07, 'China'], Guangdong: [23.38, 113.76, 'China'],
  Yunnan: [24.47, 101.34, 'China'], Hokkaido: [43.22, 142.86, 'Japan'], Okinawa: [26.5, 127.95, 'Japan'],
  Luzon: [16.57, 121.26, 'Philippines'], Mindanao: [7.88, 125.13, 'Philippines'], Sumatra: [-0.59, 101.34, 'Indonesia'], Bali: [-8.34, 115.09, 'Indonesia'], Sulawesi: [-1.85, 120.53, 'Indonesia'],
};

// Extra cities beyond the weather grid (frequent in Indian / disaster coverage).
const EXTRA_CITIES = {
  Jaipur: [26.9124, 75.7873, 'India'], Chennai: [13.0827, 80.2707, 'India'], Hyderabad: [17.385, 78.4867, 'India'],
  Ahmedabad: [23.0225, 72.5714, 'India'], Pune: [18.5204, 73.8567, 'India'], Lucknow: [26.8467, 80.9462, 'India'],
  Patna: [25.5941, 85.1376, 'India'], Guwahati: [26.1445, 91.7362, 'India'], Srinagar: [34.0837, 74.7973, 'India'],
  Jodhpur: [26.2389, 73.0243, 'India'], Udaipur: [24.5854, 73.7125, 'India'], Kota: [25.2138, 75.8648, 'India'],
  Ajmer: [26.4499, 74.6399, 'India'], Bikaner: [28.0229, 73.3119, 'India'], Amer: [26.9855, 75.8513, 'India'],
  Kathmandu: [27.7172, 85.324, 'Nepal'], Colombo: [6.9271, 79.8612, 'Sri Lanka'], Lahore: [31.5204, 74.3587, 'Pakistan'],
  Islamabad: [33.6844, 73.0479, 'Pakistan'], Kabul: [34.5553, 69.2075, 'Afghanistan'], Hanoi: [21.0278, 105.8342, 'Vietnam'],
  'Ho Chi Minh City': [10.8231, 106.6297, 'Vietnam'], 'Kuala Lumpur': [3.139, 101.6869, 'Malaysia'],
  Taipei: [25.033, 121.5654, 'Taiwan'], Osaka: [34.6937, 135.5023, 'Japan'], Kyiv: [50.4501, 30.5234, 'Ukraine'],
  Athens: [37.9838, 23.7275, 'Greece'], Lisbon: [38.7223, -9.1393, 'Portugal'], Vienna: [48.2082, 16.3738, 'Austria'],
  Warsaw: [52.2297, 21.0122, 'Poland'], Amsterdam: [52.3676, 4.9041, 'Netherlands'], Brussels: [50.8503, 4.3517, 'Belgium'],
  Beirut: [33.8938, 35.5018, 'Lebanon'], Baghdad: [33.3152, 44.3661, 'Iraq'], Damascus: [33.5138, 36.2765, 'Syria'],
  Jerusalem: [31.7683, 35.2137, 'Israel'], 'Tel Aviv': [32.0853, 34.7818, 'Israel'], Khartoum: [15.5007, 32.5599, 'Sudan'],
  Accra: [5.6037, -0.187, 'Ghana'], Dakar: [14.7167, -17.4677, 'Senegal'], 'Cape Town': [-33.9249, 18.4241, 'South Africa'],
  Miami: [25.7617, -80.1918, 'United States'], 'New Orleans': [29.9511, -90.0715, 'United States'],
  'San Francisco': [37.7749, -122.4194, 'United States'], Seattle: [47.6062, -122.3321, 'United States'],
  Phoenix: [33.4484, -112.074, 'United States'], Dallas: [32.7767, -96.797, 'United States'],
  Atlanta: [33.749, -84.388, 'United States'], Boston: [42.3601, -71.0589, 'United States'],
  Montreal: [45.5017, -73.5673, 'Canada'], Havana: [23.1136, -82.3666, 'Cuba'], Caracas: [10.4806, -66.9036, 'Venezuela'],
  Quito: [-0.1807, -78.4678, 'Ecuador'], Melbourne: [-37.8136, 144.9631, 'Australia'], Brisbane: [-27.4698, 153.0251, 'Australia'],
  Ruidoso: [33.3317, -105.673, 'United States'], Ayutthaya: [14.3532, 100.5689, 'Thailand'],
};

// ---- build one flat list of { name, lat, lng, level, country } -------------------
const LEVEL_RANK = { city: 3, region: 2, country: 1 };
const PLACES = [];
for (const c of WORLD_CITIES) PLACES.push({ name: c.name, lat: c.lat, lng: c.lng, level: 'city', country: c.country });
for (const [name, [lat, lng, country]] of Object.entries(EXTRA_CITIES)) PLACES.push({ name, lat, lng, level: 'city', country });
for (const [name, [lat, lng]] of Object.entries(INDIAN_STATES)) {
  // Delhi / Chandigarh are already cities; Punjab spans India AND Pakistan, so a headline naming it can't be placed.
  if (name === 'Delhi' || name === 'Chandigarh' || name === 'Punjab') continue;
  PLACES.push({ name, lat, lng, level: 'region', country: 'India' });
}
for (const [alias, name] of Object.entries(STATE_ALIASES)) {
  const [lat, lng] = INDIAN_STATES[name];
  PLACES.push({ name: alias, canonical: name, lat, lng, level: 'region', country: 'India' });
}
for (const [name, [lat, lng, country]] of Object.entries(REGIONS)) PLACES.push({ name, lat, lng, level: 'region', country });
for (const [name, [lat, lng]] of Object.entries(COUNTRIES)) PLACES.push({ name, lat, lng, level: 'country', country: name });

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Case-sensitive on purpose: "Chile" the country, not "chile" the pepper; "Turkey" vs "turkey".
const MATCHERS = PLACES.map((p) => ({ place: p, re: new RegExp(`(^|[^\\p{L}])${escapeRe(p.name)}(?![\\p{L}])`, 'u') }));

/**
 * Find the most specific place named in `text` (city > state/region > country; ties go to
 * the earliest mention). Returns null when nothing matches: the caller must then drop the
 * item rather than invent a location.
 */
function matchPlace(text) {
  if (typeof text !== 'string' || !text) return null;
  let best = null;
  for (const { place, re } of MATCHERS) {
    const m = re.exec(text);
    if (!m) continue;
    const index = m.index + m[1].length;
    const rank = LEVEL_RANK[place.level];
    if (!best || rank > best.rank || (rank === best.rank && index < best.index)) best = { place, rank, index };
  }
  if (!best) return null;
  const { name, canonical, lat, lng, level, country } = best.place;
  return { name: canonical ?? name, lat, lng, level, country };
}

/** Indian state (or UT) named anywhere in `text`, or null. */
function findIndianState(text) {
  if (typeof text !== 'string' || !text) return null;
  const lower = text.toLowerCase();
  // Longest names first so "West Bengal" wins over a shorter accidental hit.
  const names = [...Object.keys(INDIAN_STATES), ...Object.keys(STATE_ALIASES)].sort((a, b) => b.length - a.length);
  for (const name of names) {
    const normalized = name.toLowerCase();
    // SACHET senders use hyphens: "Andhra-Pradesh-SDMA", "Tamil-Nadu-SDMA".
    if (lower.includes(normalized) || lower.includes(normalized.replace(/ /g, '-'))) {
      const canonical = STATE_ALIASES[name] ?? name;
      const [lat, lng] = INDIAN_STATES[canonical];
      return { name: canonical, lat, lng, level: 'state' };
    }
  }
  return null;
}

/** IMD office named in `text` ("IMD Kolkata"), or null. Located at the office's city. */
function findImdCentre(text) {
  if (typeof text !== 'string') return null;
  for (const [name, [lat, lng, state]] of Object.entries(IMD_CENTRES)) {
    if (new RegExp(`IMD\\s*[-(]?\\s*${escapeRe(name)}`, 'i').test(text)) {
      return { name: `IMD ${name}`, lat, lng, level: 'imd_centre', state };
    }
  }
  return null;
}

module.exports = { matchPlace, findIndianState, findImdCentre, INDIAN_STATES };
