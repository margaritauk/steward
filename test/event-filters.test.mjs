import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionFlags, matchesEventFilter, prioritizeAttention, setupDeadline, summarizeAttention, summarizeEvents } from '../web/event-filters.mjs';

const now = Date.parse('2026-10-11T12:00:00Z');
function event({ start = now + 4 * 3600000, assignees = ['steward-1'], completion = null, equipment = [{ ready: 0, required: 2 }], beo = '0001' } = {}) {
  return { start: new Date(start).toISOString(), assignees, completion, equipment, beo };
}
test('dashboard counters agree with exactly matching event-list filters', () => {
  const events = [
    event({ start: now - 3600000, equipment: [{ ready: 1, required: 2 }] }),
    event({ start: now + 30 * 60000, equipment: [{ ready: 1, required: 2 }] }),
    event({ start: now + 3600000, equipment: [{ ready: 2, required: 2 }] }),
    event({ start: now + 5 * 3600000 }),
    event({ start: now - 3600000, completion: { photoId: 'photo' }, equipment: [{ ready: 2, required: 2 }] }),
    event({ start: now + 4 * 3600000, equipment: [{ ready: 2, required: 2 }] })
  ];
  const counts = summarizeEvents(events, now);
  assert.deepEqual(counts, { all: 6, progress: 4, complete: 1, overdue: 2 });
  for (const key of ['all', 'progress', 'complete', 'overdue']) {
    assert.equal(events.filter(e => matchesEventFilter(e, key, now)).length, counts[key]);
  }
});
test('urgency flags separate upcoming deadlines from late work without double-counting', () => {
  const events = [
    event({ start: now + 30 * 60000, beo: 'late' }),
    event({ start: now + 2 * 3600000, beo: 'soon' }),
    event({ start: now + 4 * 3600000, assignees: [], beo: 'unassigned' }),
    event({ start: now - 5 * 3600000, assignees: [], beo: 'late-and-unassigned' }),
    event({ start: now + 5 * 3600000, beo: 'fine' }),
    event({ start: now - 3 * 3600000, completion: { photoId: 'yes' }, assignees: [], beo: 'done' })
  ];
  assert.deepEqual(summarizeAttention(events, now), { attention: 4, overdue: 2, dueSoon: 1, unassigned: 2 });
  for (const key of ['attention', 'overdue', 'dueSoon', 'unassigned']) {
    const filterKey = key === 'dueSoon' ? 'due-soon' : key;
    assert.equal(events.filter(e => matchesEventFilter(e, filterKey, now)).length, summarizeAttention(events, now)[key]);
  }
  assert.deepEqual(prioritizeAttention(events, now).map(e => e.beo), ['late-and-unassigned', 'late', 'soon', 'unassigned']);
});
test('at the exact setup deadline the event is due soon, not overdue', () => {
  const e = event({ start: now + 3600000 });
  assert.equal(setupDeadline(e), now);
  assert.equal(attentionFlags(e, now).dueSoon, true);
  assert.equal(attentionFlags(e, now).overdue, false);
  assert.equal(attentionFlags(e, now + 1).overdue, true);
});
test('completed events are never urgent, even if unassigned and late', () => {
  const e = event({ start: now - 3600000, assignees: [], completion: { photoId: 'saved' } });
  assert.deepEqual(attentionFlags(e, now), { overdue: false, dueSoon: false, unassigned: false, attention: false });
  assert.equal(matchesEventFilter(e, 'attention', now), false);
});
test('an unassigned future event remains visible even outside the two-hour window', () => {
  const e = event({ start: now + 24 * 3600000, assignees: [] });
  assert.equal(matchesEventFilter(e, 'unassigned', now), true);
  assert.equal(matchesEventFilter(e, 'due-soon', now), false);
  assert.equal(matchesEventFilter(e, 'attention', now), true);
});
