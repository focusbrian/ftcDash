import type { TeamStrength } from '../types';

function oprTotal(team: TeamStrength): number {
  return team.hasOpr ? Math.max(0, team.oprAuto) + Math.max(0, team.oprTeleop) : -1;
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
