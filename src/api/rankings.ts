import { gql } from './client';
import { REGION_TEAMS_QUERY, TEAM_RANK_QUERY } from './queries';
import { rankAmong } from '../lib/region';

/** A position in a ranking: the place itself and how many teams are in it. */
export interface RankPlace {
  rank: number;
  pool: number;
}

interface RawTeamRank {
  teamByNumber: {
    number: number;
    quickStats: { count: number; tot: { value: number; rank: number } | null } | null;
  } | null;
}

interface RawRegionTeams {
  teamsSearch: {
    number: number;
    quickStats: { tot: { value: number } | null } | null;
  }[];
}

/** One request per team-season, kept for the session: ranks only move when new results land. */
const WORLD = new Map<string, Promise<RankPlace | null>>();

/**
 * Every team in a region with its OPR total. Big (a state is around a thousand teams), so it is
 * fetched once per session per region and shared by every team page in it.
 */
const REGIONS = new Map<string, Promise<Map<number, number> | null>>();

/**
 * The cached requests deliberately take no `AbortSignal`: the result is shared with every team page
 * in the session, so one page going away must not cancel the fetch (or poison the cache) for the
 * next one. Callers ignore the result themselves once they are gone.
 */
async function fetchWorldRank(season: number, teamNumber: number): Promise<RankPlace | null> {
  const data = await gql<RawTeamRank>(TEAM_RANK_QUERY, { season, number: teamNumber });
  const stats = data.teamByNumber?.quickStats;
  if (!stats?.tot) return null;
  return { rank: stats.tot.rank, pool: stats.count };
}

async function fetchRegionTeams(season: number, region: string): Promise<Map<number, number> | null> {
  const data = await gql<RawRegionTeams>(REGION_TEAMS_QUERY, { season, region });
  const totals = new Map<number, number>();
  for (const entry of data.teamsSearch) {
    const value = entry.quickStats?.tot?.value;
    if (typeof value === 'number') totals.set(entry.number, value);
  }
  return totals.size === 0 ? null : totals;
}

function shared<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached;
  const request = load().catch((error: unknown) => {
    // A failed load is not worth remembering: the next visit should try again.
    cache.delete(key);
    throw error;
  });
  cache.set(key, request);
  return request;
}

/** The team's worldwide OPR rank for the season, or null when FTC Scout published no stats. */
export function loadWorldRank(season: number, teamNumber: number): Promise<RankPlace | null> {
  return shared(WORLD, `${season}:${teamNumber}`, () => fetchWorldRank(season, teamNumber));
}

/** The team's OPR rank within an FTC Scout region (`USMI`, `CAON`, …), or null when it has no OPR. */
export async function loadRegionRank(
  season: number,
  region: string,
  teamNumber: number,
): Promise<RankPlace | null> {
  const totals = await shared(REGIONS, `${season}:${region}`, () => fetchRegionTeams(season, region));
  if (!totals) return null;
  const value = totals.get(teamNumber);
  if (value === undefined) return null;
  const values = [...totals.values()];
  return { rank: rankAmong(values, value), pool: values.length };
}

/** Drops the cached ranks — used between tests, and after a refresh if it ever needs to. */
export function clearRankCache(): void {
  WORLD.clear();
  REGIONS.clear();
}
