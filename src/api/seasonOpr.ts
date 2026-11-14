import { gql } from './client';
import { TEAM_OPR_HISTORY_QUERY } from './queries';
import { seasonOprBaseline, seasonOprSeries } from '../lib/seasonOpr';
import { EARLIEST_SEASON } from '../lib/route';
import type { SeasonOprPoint } from '../lib/seasonOpr';
import type { RawTeamOprEvent, RawTeamOprHistory } from './raw';

/**
 * Season OPR series, keyed by `${season}:${team}` and shared by the rankings, the hover card and the
 * projection fallback, so a team costs at most one round trip however many places ask for it.
 */
const SERIES = new Map<string, SeasonOprPoint[]>();

function cacheKey(season: number, teamNumber: number): string {
  return `${season}:${teamNumber}`;
}

export function cachedSeasonOpr(season: number, teamNumber: number): SeasonOprPoint[] | undefined {
  return SERIES.get(cacheKey(season, teamNumber));
}

async function eventsOf(
  season: number,
  teamNumber: number,
  signal?: AbortSignal,
): Promise<RawTeamOprEvent[]> {
  const { teamByNumber } = await gql<{ teamByNumber: RawTeamOprHistory | null }>(
    TEAM_OPR_HISTORY_QUERY,
    { season, number: teamNumber },
    signal,
  );
  return teamByNumber?.events ?? [];
}

/** One OPR point per event a team played that season, oldest first, anchored to the previous season. */
export async function loadSeasonOpr(
  season: number,
  teamNumber: number,
  signal?: AbortSignal,
): Promise<SeasonOprPoint[]> {
  const cached = cachedSeasonOpr(season, teamNumber);
  if (cached) return cached;

  const previous = season - 1;
  const hasPrevious = previous >= EARLIEST_SEASON;
  const [events, priorEvents] = await Promise.all([
    eventsOf(season, teamNumber, signal),
    // A team that sat out the previous season is normal — never fail the series over it.
    hasPrevious
      ? eventsOf(previous, teamNumber, signal).catch((): RawTeamOprEvent[] => [])
      : Promise.resolve<RawTeamOprEvent[]>([]),
  ]);

  const points = seasonOprSeries(
    season,
    events,
    hasPrevious ? seasonOprBaseline(previous, priorEvents) : null,
  );
  SERIES.set(cacheKey(season, teamNumber), points);
  return points;
}
