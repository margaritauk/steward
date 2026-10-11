// Shared deadline, dashboard-filter, and supervisor-attention semantics.
// A setup is only complete after its required confirmation has been recorded.
const HOUR = 60 * 60 * 1000;
export function setupDeadline(event) {
  return new Date(event.start).getTime() - HOUR;
}
export function attentionFlags(event, now) {
  if (event.completion) return { overdue: false, dueSoon: false, unassigned: false, attention: false };
  const until = setupDeadline(event) - now;
  const overdue = Number.isFinite(until) && until < 0;
  const dueSoon = Number.isFinite(until) && until >= 0 && until <= 2 * HOUR;
  const unassigned = !(event.assignees || []).length;
  return { overdue, dueSoon, unassigned, attention: overdue || dueSoon || unassigned };
}
export function matchesEventFilter(event, filter, now) {
  const complete = Boolean(event.completion);
  const flags = attentionFlags(event, now);
  const inProgress = !complete && (event.equipment || []).some(item => item.ready > 0);
  switch (filter) {
    case 'all': return true;
    case 'open': return !complete;
    case 'progress': return inProgress;
    case 'complete': return complete;
    case 'overdue': return flags.overdue;
    case 'due-soon': return flags.dueSoon;
    case 'unassigned': return flags.unassigned;
    case 'attention': return flags.attention;
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
export function summarizeAttention(events, now) {
  const flags = events.map(event => attentionFlags(event, now));
  return {
    attention: flags.filter(flag => flag.attention).length,
    overdue: flags.filter(flag => flag.overdue).length,
    dueSoon: flags.filter(flag => flag.dueSoon).length,
    unassigned: flags.filter(flag => flag.unassigned).length
  };
}
export function prioritizeAttention(events, now) {
  const score = e => {
    const flags = attentionFlags(e, now);
    // Late and imminent setups rank before unassigned future setups.
    return flags.overdue ? 0 : flags.dueSoon ? 1 : 2;
  };
  return events.filter(event => attentionFlags(event, now).attention)
    .sort((a, b) => score(a) - score(b) || setupDeadline(a) - setupDeadline(b) || String(a.beo || '').localeCompare(String(b.beo || '')));
}
