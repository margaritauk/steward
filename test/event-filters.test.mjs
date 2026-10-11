import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesEventFilter, summarizeEvents } from '../web/event-filters.mjs';

const now = Date.parse('2026-10-11T18:00:00Z');
const makeEvent = (name, hoursUntilStart, ready, completion = null) => ({
  name, start: new Date(now + hoursUntilStart * 3600000).toISOString(),
  equipment: [{ required: 5, ready }], completion
});

test('dashboard counts correspond to event list drill-downs', () => {
  const events = [
    makeEvent('not started', 3, 0),
    makeEvent('underway', 3, 2),
    makeEvent('photo required', 3, 5),
    makeEvent('late but underway', 0.5, 1),
    makeEvent('late not started', 0.5, 0),
    makeEvent('finished', -2, 5, { time: '2026-10-11T16:00:00Z' })
  ];
  const counts = summarizeEvents(events, now);
  assert.deepEqual(counts, { all: 6, progress: 3, complete: 1, overdue: 2 });
  for (const key of ['all', 'progress', 'complete', 'overdue']) {
    assert.equal(events.filter(event => matchesEventFilter(event, key, now)).length, counts[key]);
  }
  assert.equal(events.filter(event => matchesEventFilter(event, 'open', now)).length, 5);
});

test('in progress includes equipment-ready events awaiting photo confirmation', () => {
  const event = makeEvent('photo required', 2, 5);
  assert.equal(matchesEventFilter(event, 'progress', now), true);
  assert.equal(matchesEventFilter(event, 'complete', now), false);
});

test('completed events never appear as overdue, including after the deadline', () => {
  const event = makeEvent('completed long ago', -2, 5, { time: '2026-10-11T16:00:00Z' });
  assert.equal(matchesEventFilter(event, 'overdue', now), false);
  assert.equal(matchesEventFilter(event, 'open', now), false);
  assert.equal(matchesEventFilter(event, 'complete', now), true);
});

test('an unrecognized status matches nothing', () => {
  assert.equal(matchesEventFilter(makeEvent('ordinary', 3, 0), 'unknown', now), false);
});
