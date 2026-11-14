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
