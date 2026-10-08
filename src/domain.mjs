import { randomUUID } from 'node:crypto';

export function normalizeType(value) { return String(value).trim().toLowerCase().replace(/buffett/g, 'buffet'); }
export function calculateEquipment(rules, event, previous = []) {
  return rules.filter(r => normalizeType(event.type).includes(normalizeType(r.eventType)) || r.eventType === '*').map(rule => {
    const old = previous.find(item => item.ruleId === rule.id);
    const multiplier = rule.basis === 'guests' ? Math.ceil(event.guests / rule.per) : rule.basis === 'dishes' ? event.dishes.length : 1;
    const required = Math.ceil(rule.quantity * multiplier);
    return { id: old?.id || randomUUID(), ruleId: rule.id, name: rule.name, required, ready: Math.min(old?.ready || 0, required), unit: rule.unit, basis: rule.basis, updatedBy: old?.updatedBy || null };
  }).filter(item => item.required > 0);
}
export function setupDeadline(event) { return new Date(new Date(event.start).getTime() - 3600000).toISOString(); }
export function isReady(event) { return event.equipment.length > 0 && event.equipment.every(item => item.ready === item.required); }
export function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role, active: !!user.active }; }
export function suggestAssignments(event, users, events, timezone='America/Chicago') {
  const day=value=>new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  return users.filter(u => u.active && u.role === 'steward').map(user => {
    const assigned = events.filter(e => e.id !== event.id && e.assignees.includes(user.id) && day(e.start) === day(event.start));
    const sameRoom = assigned.filter(e => e.room.toLowerCase() === event.room.toLowerCase()).length;
    const sameZone = event.zone ? assigned.filter(e => e.zone?.toLowerCase() === event.zone.toLowerCase()).length : 0;
    const overlaps = assigned.filter(e => !e.completion && Math.abs(new Date(e.start) - new Date(event.start)) < 3600000).length;
    const outstanding = assigned.filter(e => !e.completion).length;
    return { user: publicUser(user), sameRoom, sameZone, outstanding, overlaps, score: sameRoom * 4 + sameZone * 2 - outstanding * 2 - overlaps * 8, reason: overlaps ? `${overlaps} event(s) within an hour · review availability` : sameRoom ? `${sameRoom} event(s) in this room · ${outstanding} open` : sameZone ? `Already working in ${event.zone} · ${outstanding} open` : `${outstanding} open event(s) today` };
  }).sort((a,b) => b.score - a.score || a.user.name.localeCompare(b.user.name));
}
export function extractBEO(text) {
  const candidates = [...text.matchAll(/\bB\.?E\.?O\.?\s*(?:number|no\.?|#|:)\s*[:#]?\s*([A-Z0-9-]{3,30})/gi)].map(m=>m[1]);
  const numbers = [...new Set(candidates.filter(x => /\d/.test(x)))];
  const field = regex => text.match(regex)?.[1]?.trim() || '';
  return {
    beo: numbers.length === 1 ? numbers[0] : '',
    name: field(/(?:event name|function name|function)\s*:\s*([^\n]+)/i),
    room: field(/(?:function room|room|location)\s*:\s*([^\n]+)/i),
    type: /lunch\s+buffet/i.test(text) ? 'Lunch buffet' : /breakfast\s+buffet/i.test(text) ? 'Breakfast buffet' : /dinner\s+buffet/i.test(text) ? 'Dinner buffet' : '',
    guests: Number(field(/(?:guarantee(?:d)?|guest count|guests|#\s*people)\s*[:#]?\s*(\d+)/i)) || null,
    dateHint: field(/(?:event date|function date|date)\s*:\s*([^\n]+)/i),
    timeHint: field(/(?:start time|event time|time)\s*:\s*([^\n]+)/i),
    revision: /\brevis(?:ed|ion)\b/i.test(text),
    multipleBEOs: numbers.length > 1,
    detectedBEOs: numbers
  };
}
