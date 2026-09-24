'use strict';

const fs = require('fs/promises');
const path = require('path');
const { validateEvent } = require('./event');

const MOCK_PATH = path.join(__dirname, '..', 'events.json');

// Data that did not come from a live feed must never look like it did.
// Mock events are always flagged isSimulated:true; a real-feed source name such as
// "USGS" becomes "USGS (mock)". "Simulated (...)" sources are left alone.
function tagAsMock(event) {
  if (!event || typeof event !== 'object') return event;
  const source = typeof event.source === 'string' ? event.source : '';
  const alreadyHonest = /^Simulated\b/i.test(source) || /\(mock\)$/i.test(source);
  return {
    ...event,
    source: alreadyHonest ? source : `${source || 'Unknown'} (mock)`,
    isSimulated: true,
  };
}

/** Read events.json. Never throws: a missing / broken file just yields []. */
async function loadMockEvents() {
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(MOCK_PATH, 'utf8'));
  } catch (err) {
    console.warn(`[mock] cannot read events.json: ${err.message}`);
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.warn('[mock] events.json must contain a JSON array');
    return [];
  }

  const events = [];
  for (const raw of parsed) {
    const event = tagAsMock(raw);
    const problem = validateEvent(event);
    if (problem) {
      console.warn(`[mock] skipping invalid entry ${raw?.id ?? '(no id)'}: ${problem}`);
    } else {
      events.push(event);
    }
  }
  return events;
}

module.exports = { loadMockEvents, MOCK_PATH };
