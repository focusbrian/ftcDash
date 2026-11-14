import type { Match, TournamentLevel } from '../types';

export function fmtPoints(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return rounded.toFixed(rounded % 1 === 0 ? 0 : digits);
}

export function fmtPercent(probability: number): string {
  const pct = probability * 100;
  if (pct >= 99.5) return '>99%';
  if (pct <= 0.5) return '<1%';
  return `${Math.round(pct)}%`;
}

export function timeZoneOrUndefined(timeZone?: string): string | undefined {
  if (!timeZone) return undefined;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return timeZone;
  } catch {
    return undefined;
  }
}

export function fmtTime(iso: string | null, timeZone?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timeZoneOrUndefined(timeZone),
  }).format(date);
}

function parseDateOnly(value: string): Date {
  return new Date(`${value}T12:00:00Z`);
}

export function fmtDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  const date = parseDateOnly(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...options,
  }).format(date);
}

export function fmtDateRange(start: string, end: string): string {
  if (start === end) return fmtDate(start, { year: 'numeric' });
  return `${fmtDate(start)} – ${fmtDate(end, { year: 'numeric' })}`;
}

const LEVEL_LABELS: Record<TournamentLevel, string> = {
  Quals: 'Qualification',
  DoubleElim: 'Playoff',
  Semis: 'Semifinal',
  Finals: 'Final',
};

export function matchShortLabel(match: Match): string {
  switch (match.level) {
    case 'Quals':
      return `Q${match.matchNum}`;
    case 'DoubleElim':
      return `P${match.matchNum}`;
    case 'Semis':
      return match.series > 0 ? `SF${match.series}·${match.matchNum}` : `SF${match.matchNum}`;
    case 'Finals':
      return match.series > 0 ? `F${match.series}·${match.matchNum}` : `F${match.matchNum}`;
  }
}

export function matchLongLabel(match: Match): string {
  switch (match.level) {
    case 'Quals':
      return `Qualification Match ${match.matchNum}`;
    case 'DoubleElim':
      return `Playoff Match ${match.matchNum}`;
    case 'Semis':
      return match.series > 0
        ? `Semifinal ${match.series}, Match ${match.matchNum}`
        : `Semifinal ${match.matchNum}`;
    case 'Finals':
      return match.series > 0
        ? `Final ${match.series}, Match ${match.matchNum}`
        : `Final ${match.matchNum}`;
  }
}

/**
 * Legacy remote seasons (2020/2021) store one alliance per match, so match numbers repeat.
 * Disambiguate those with the team number.
 */
export function singleAllianceLabel(match: Match): string {
  if (match.sides.length !== 1) return '';
  const numbers = match.sides[0]?.entries.map((entry) => entry.teamNumber) ?? [];
  return numbers.length > 0 ? ` · ${numbers.join(' / ')}` : '';
}

export interface LevelGroup<T> {
  level: TournamentLevel;
  label: string;
  items: T[];
}

/** Splits an already-sorted list into display groups (Quals, Playoffs, ...). */
export function groupByLevel<T>(
  items: T[],
  getLevel: (item: T) => TournamentLevel,
): LevelGroup<T>[] {
  const groups: LevelGroup<T>[] = [];
  for (const item of items) {
    const level = getLevel(item);
    const current = groups[groups.length - 1];
    if (current?.level === level) {
      current.items.push(item);
    } else {
      groups.push({ level, label: LEVEL_LABELS[level], items: [item] });
    }
  }
  return groups;
}
