'use strict';

const { makeEvent } = require('../lib/event');
const { AMER, scatterAround } = require('../lib/geo');

// No free hyperlocal traffic / crowd / civic API exists, so this feed is generated.
// Every event is honestly tagged as simulated.
const SOURCE = 'Simulated (Amer)';

const ZONES = ['Kheri Gate', 'Maota Lake side', 'Jaigarh Fort Road', 'Amer Bus Stand', 'Kunda Village', 'Chand Pol'];

const CIVIC_CATEGORIES = {
  power: (zone) => `Power outage reported in ${zone}`,
  water: (zone) => `Water supply complaint in ${zone}`,
  road: (zone) => `Road damage reported in ${zone}`,
};

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Next 7:00 PM India time (UTC+5:30, no DST) as an ISO string. */
function nextSevenPmIst(now) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const istClock = new Date(now.getTime() + IST_OFFSET_MS);
  istClock.setUTCHours(19, 0, 0, 0);
  let startMs = istClock.getTime() - IST_OFFSET_MS;
  if (startMs <= now.getTime()) startMs += DAY_MS;
  return new Date(startMs).toISOString();
}

/** A handful of fresh, slightly randomized events scattered within ~2 km of Amer. */
async function generateAmerEvents() {
  const now = new Date();
  const stamp = now.getTime();

  const build = (type, title, radiusKm, severity, raw) =>
    makeEvent({
      id: `sim-${type}-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      title,
      ...scatterAround(AMER, radiusKm),
      timestamp: now.toISOString(),
      severity,
      source: SOURCE,
      isSimulated: true,
      raw,
    });

  const events = [];

  const congestionPct = randInt(40, 90);
  events.push(
    build('traffic', `Traffic on Amer Fort Road: ${congestionPct}% congestion`, 1.5, congestionPct >= 70 ? 4 : 3, {
      road: 'Amer Fort Road',
      congestionPct,
    }),
  );

  const capacityPct = randInt(30, 95);
  events.push(
    build('crowd', `Amer Fort crowd at ${capacityPct}% capacity`, 0.4, capacityPct >= 80 ? 4 : capacityPct >= 50 ? 3 : 2, {
      location: 'Amer Fort',
      capacityPct,
    }),
  );

  for (let i = randInt(1, 2); i > 0; i -= 1) {
    const category = pick(Object.keys(CIVIC_CATEGORIES));
    const zone = pick(ZONES);
    events.push(
      build('civic', CIVIC_CATEGORIES[category](zone), 2, randInt(2, 3), { category, zone, status: 'open' }),
    );
  }

  events.push(
    build('event', 'Light & Sound Show at Amer Fort, 7 PM', 0.5, 1, {
      venue: 'Amer Fort',
      startsAt: nextSevenPmIst(now),
    }),
  );

  return events;
}

module.exports = { generateAmerEvents, SOURCE };
