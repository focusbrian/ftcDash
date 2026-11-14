import type { TeamStrength } from '../types';

export interface TeamSearchHit {
  teamNumber: number;
  name: string;
  schoolName: string;
  rank: number | null;
}

/** Lower is better; `null` means "does not match". */
function scoreTeam(team: TeamStrength, needle: string): number | null {
  const number = String(team.teamNumber);
  const name = team.name.toLowerCase();
  const school = team.schoolName.toLowerCase();

  if (number === needle) return 0;
  if (number.startsWith(needle)) return 1;
  if (name.startsWith(needle) || school.startsWith(needle)) return 2;
  if (number.includes(needle)) return 3;
  if (name.includes(needle) || school.includes(needle)) return 4;
  return null;
}

/**
 * Ranks teams by how well they match a free-text query: exact team number, then
 * number prefix, then name prefix, then loose number/name matches.
 */
export function searchTeams(
  teams: Iterable<TeamStrength>,
  query: string,
  limit = 8,
): TeamSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const hits: { score: number; hit: TeamSearchHit }[] = [];
  for (const team of teams) {
    const score = scoreTeam(team, needle);
    if (score === null) continue;
    hits.push({
      score,
      hit: {
        teamNumber: team.teamNumber,
        name: team.name,
        schoolName: team.schoolName,
        rank: team.rank,
      },
    });
  }

  hits.sort((a, b) => a.score - b.score || a.hit.teamNumber - b.hit.teamNumber);
  return hits.slice(0, limit).map((entry) => entry.hit);
}
