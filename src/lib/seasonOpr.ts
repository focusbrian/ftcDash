import type { RawTeamOprEvent } from '../api/raw';

/** Where a plotted OPR value came from. */
export type SeasonOprKind =
  /** The previous season's final OPR, plotted before the first event as an anchor. */
  | 'prior'
  /** Published at that event. */
  | 'recorded'
  /** The last published OPR, standing in for an event FTC Scout has no OPR for yet. */
  | 'estimate';

export interface SeasonOprPoint {
  kind: SeasonOprKind;
  /** Season the value is from — the previous one for a `prior` anchor. */
  season: number;
  code: string;
  name: string;
  start: string;
  auto: number;
  teleop: number;
  total: number;
}

interface OprValues {
  auto: number;
  teleop: number;
  total: number;
}

function publishedOpr(entry: RawTeamOprEvent): OprValues | null {
  const opr = entry.stats?.opr;
  if (!opr) return null;
  return {
    auto: Math.max(0, opr.autoPoints ?? 0),
    teleop: Math.max(0, opr.dcPoints ?? 0),
    total: Math.max(0, opr.totalPointsNp ?? 0),
  };
}

/** The OPR the team finished a season with, or null when FTC Scout published none that season. */
export function seasonOprBaseline(
  season: number,
  events: readonly RawTeamOprEvent[],
): SeasonOprPoint | null {
  let latest: RawTeamOprEvent | null = null;
  let values: OprValues | null = null;

  for (const entry of events) {
    const opr = publishedOpr(entry);
    if (!opr) continue;
    if (latest === null || entry.event.start >= latest.event.start) {
      latest = entry;
      values = opr;
    }
  }
  if (latest === null || values === null) return null;

  return {
    kind: 'prior',
    season,
    code: latest.event.code,
    name: latest.event.name,
    start: latest.event.start,
    ...values,
  };
}

/**
 * One slot per event the team entered, oldest first. An event without a published OPR keeps the
 * most recent value in its place (marked `estimate`) so the series stays evenly spaced, and the
 * previous season's final OPR is prepended as a `prior` anchor when there is something to plot it
 * against.
 */
export function seasonOprSeries(
  season: number,
  events: readonly RawTeamOprEvent[],
  prior: SeasonOprPoint | null,
): SeasonOprPoint[] {
  const ordered = [...events].sort((a, b) => a.event.start.localeCompare(b.event.start));
  const points: SeasonOprPoint[] = [];
  let carry: OprValues | null = prior
    ? { auto: prior.auto, teleop: prior.teleop, total: prior.total }
    : null;
  if (prior && ordered.length > 0) points.push(prior);

  for (const entry of ordered) {
    const opr = publishedOpr(entry);
    if (opr) carry = opr;
    // Nothing has been published yet, so this event has no line to sit on.
    if (!carry) continue;
    points.push({
      kind: opr ? 'recorded' : 'estimate',
      season,
      code: entry.event.code,
      name: entry.event.name,
      start: entry.event.start,
      ...carry,
    });
  }

  return points;
}
