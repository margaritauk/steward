// Shared status semantics for the dashboard counters and event list filters.
export function matchesEventFilter(event, filter, now) {
  const complete = Boolean(event.completion);
  const overdue = !complete && new Date(event.start).getTime() - 60 * 60 * 1000 < now;
  const inProgress = !complete && (event.equipment || []).some(item => item.ready > 0);
  switch (filter) {
    case 'all': return true;
    case 'open': return !complete;
    case 'progress': return inProgress;
    case 'complete': return complete;
    case 'overdue': return overdue;
    default: return false;
  }
}

export function summarizeEvents(events, now) {
  return {
    all: events.length,
    progress: events.filter(event => matchesEventFilter(event, 'progress', now)).length,
    complete: events.filter(event => matchesEventFilter(event, 'complete', now)).length,
    overdue: events.filter(event => matchesEventFilter(event, 'overdue', now)).length
  };
}
