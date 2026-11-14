import type { EventSummary } from '../types';

export function todayKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isOngoing(event: EventSummary, today: string): boolean {
  return event.start <= today && event.end >= today;
}

/**
 * Picker order: events running today, then upcoming (soonest first), then past
 * (most recent first). Dates are ISO `YYYY-MM-DD`, so string comparison is enough.
 */
export function sortEventsForPicker(events: EventSummary[], today = todayKey()): EventSummary[] {
  const rank = (event: EventSummary) => {
    if (isOngoing(event, today)) return 0;
    return event.start > today ? 1 : 2;
  };

  return [...events].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    const byDate = rank(a) === 2 ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start);
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name);
  });
}

/** The event a first-time visitor most likely wants: today's, else the latest played one. */
export function pickDefaultEvent(events: EventSummary[], today = todayKey()): EventSummary | null {
  const ongoing = events.filter((event) => isOngoing(event, today));
  if (ongoing.length > 0) {
    return ongoing.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name))[0] ?? null;
  }

  const played = events.filter((event) => event.hasMatches && event.end < today);
  if (played.length > 0) {
    return played.sort((a, b) => b.start.localeCompare(a.start) || a.name.localeCompare(b.name))[0] ?? null;
  }

  return sortEventsForPicker(events, today)[0] ?? null;
}

export function filterEvents(events: EventSummary[], query: string): EventSummary[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return events;

  return events.filter((event) => {
    const haystack = `${event.code} ${event.name}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}
