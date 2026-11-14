import type { TeamStrength } from '../types';

/** A team's most recent published OPR, in the shape the projections and the UI consume. */
export interface OprValues {
  auto: number;
  teleop: number;
  total: number;
}

export type SeasonOprFallback = Map<number, OprValues>;

function oprTotal(team: TeamStrength): number {
  return team.hasOpr ? Math.max(0, team.oprAuto) + Math.max(0, team.oprTeleop) : -1;
}

/**
 * Copies the strengths map with teams that have no OPR at this event yet standing on their most
 * recent season OPR, flagged so the UI can show where the number came from. An event OPR always
 * wins, and teams with nothing published anywhere are left alone.
 */
export function applySeasonOpr(
  strengths: Map<number, TeamStrength>,
  fallback: SeasonOprFallback,
): Map<number, TeamStrength> {
  if (fallback.size === 0) return strengths;

  const merged = new Map(strengths);
  for (const [teamNumber, opr] of fallback) {
    const team = merged.get(teamNumber);
    if (!team || team.hasOpr) continue;
    merged.set(teamNumber, {
      ...team,
      oprAuto: opr.auto,
      oprTeleop: opr.teleop,
      hasOpr: true,
      oprFromSeason: true,
    });
  }
  return merged;
}

/**
 * Teams in ranking order: official event rank first, then anyone still unranked by OPR total so the
 * strongest teams sit near the top, and finally by team number to keep the order stable.
 */
export function rankTeams(teams: Iterable<TeamStrength>): TeamStrength[] {
  return [...teams].sort((a, b) => {
    const rankA = a.rank ?? Number.POSITIVE_INFINITY;
    const rankB = b.rank ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) return rankA - rankB;

    const oprA = oprTotal(a);
    const oprB = oprTotal(b);
    if (oprA !== oprB) return oprB - oprA;

    return a.teamNumber - b.teamNumber;
  });
}

/** How the ranking list is ordered: the official table, or strongest OPR first. */
export type TeamSort = 'rank' | 'opr';

/**
 * The ranking list in the chosen order. OPR order puts the highest effective OPR (event OPR, or the
 * season stand-in) first and breaks ties with the official rank, so the two orders stay comparable.
 */
export function sortTeamsBy(teams: readonly TeamStrength[], sort: TeamSort): TeamStrength[] {
  if (sort === 'rank') return rankTeams(teams);

  return [...teams].sort((a, b) => {
    const oprA = oprTotal(a);
    const oprB = oprTotal(b);
    if (oprA !== oprB) return oprB - oprA;

    const rankA = a.rank ?? Number.POSITIVE_INFINITY;
    const rankB = b.rank ?? Number.POSITIVE_INFINITY;
    if (rankA !== rankB) return rankA - rankB;

    return a.teamNumber - b.teamNumber;
  });
}

/**
 * Each team's place in the event-wide OPR order, so a filtered list can still show where a team sits
 * among everyone rather than renumbering the survivors.
 */
export function oprPositions(teams: readonly TeamStrength[]): Map<number, number> {
  return new Map(sortTeamsBy(teams, 'opr').map((team, at) => [team.teamNumber, at + 1]));
}
