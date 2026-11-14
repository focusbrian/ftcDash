import { winProbability } from './projection';
import type { Projection } from './projection';
import type { MatchView, SideView } from './model';
import type { TeamStrength } from '../types';

/** FTC ranking points: a win is worth two, a tie one, plus the season's bonus thresholds. */
const WIN_RP = 2;
const TIE_RP = 1;

export interface TeamPrediction {
  teamNumber: number;
  name: string;
  schoolName: string;
  /** Official event rank, when the event has ranked the team yet. */
  currentRank: number | null;
  predictedRank: number;
  /** Ranking points earned so far (`rp` is a running total, not an average). */
  currentRp: number;
  /** Current ranking points plus what the remaining qualification matches are expected to add. */
  projectedRp: number;
  rpRemaining: number;
  wins: number;
  ties: number;
  losses: number;
  played: number;
  /** Qualification matches still to be scored for this team. */
  remaining: number;
  /** Mean projected total of the alliances this team still has to face, or null once it is done. */
  difficulty: number | null;
  /** 1 for the hardest remaining schedule at the event; null when nothing is left to play. */
  difficultyRank: number | null;
  oprTotal: number;
}

interface Record {
  wins: number;
  ties: number;
  losses: number;
  played: number;
  remaining: number;
  /** Expected ranking points from wins in the remaining matches, before bonus points. */
  winRp: number;
  difficultySum: number;
  difficultyCount: number;
}

function emptyRecord(): Record {
  return {
    wins: 0,
    ties: 0,
    losses: 0,
    played: 0,
    remaining: 0,
    winRp: 0,
    difficultySum: 0,
    difficultyCount: 0,
  };
}

function projectionOf(side: SideView): Projection {
  return {
    auto: side.auto,
    teleop: side.teleop,
    total: side.total,
    sigma: side.sigma,
    contributions: [],
    missingTeams: side.missingTeams,
  };
}

/** Teams whose result counts for this alliance: no-shows and surrogates are not ranked on it. */
function scoringTeams(side: SideView): number[] {
  return side.entries
    .filter((entry) => entry.onField && !entry.noShow && !entry.surrogate)
    .map((entry) => entry.teamNumber);
}

function outcomeOf(record: Record, won: boolean, tied: boolean): void {
  record.played += 1;
  if (tied) record.ties += 1;
  else if (won) record.wins += 1;
  else record.losses += 1;
}

/**
 * Predicts the final qualification ranking: each team keeps the ranking points it has earned and
 * gains the points its remaining matches are expected to produce, with each match won to its OPR
 * projection's win probability. Remote seasons (one alliance per match) are left out — their
 * ranking was not decided by head-to-head results.
 */
export function predictRankings(
  views: readonly MatchView[],
  strengths: Map<number, TeamStrength>,
): TeamPrediction[] {
  const records = new Map<number, Record>();
  const recordFor = (teamNumber: number): Record => {
    let record = records.get(teamNumber);
    if (!record) {
      record = emptyRecord();
      records.set(teamNumber, record);
    }
    return record;
  };

  for (const view of views) {
    if (view.match.level !== 'Quals' || view.sides.length !== 2) continue;
    const [left, right] = view.sides as [SideView, SideView];

    if (view.projected) {
      const leftChance = winProbability(projectionOf(left), projectionOf(right));
      for (const teamNumber of scoringTeams(left)) {
        const record = recordFor(teamNumber);
        record.remaining += 1;
        record.winRp += WIN_RP * leftChance;
        record.difficultySum += right.total;
        record.difficultyCount += 1;
      }
      for (const teamNumber of scoringTeams(right)) {
        const record = recordFor(teamNumber);
        record.remaining += 1;
        record.winRp += WIN_RP * (1 - leftChance);
        record.difficultySum += left.total;
        record.difficultyCount += 1;
      }
      continue;
    }

    const tied = left.total === right.total;
    const leftWon = left.total > right.total;
    for (const teamNumber of scoringTeams(left)) outcomeOf(recordFor(teamNumber), leftWon, tied);
    for (const teamNumber of scoringTeams(right)) outcomeOf(recordFor(teamNumber), !leftWon, tied);
  }

  const predictions: TeamPrediction[] = [...strengths.values()].map((team) => {
    const record = records.get(team.teamNumber) ?? emptyRecord();
    const currentRp = team.rp ?? 0;
    // Whatever this team earns per match beyond a plain win is its bonus-point rate (auto / endgame
    // thresholds), assumed to carry into the matches it has left.
    const baseRp = WIN_RP * record.wins + TIE_RP * record.ties;
    const bonusPerMatch = record.played > 0 ? Math.max(0, (currentRp - baseRp) / record.played) : 0;
    const rpRemaining = record.winRp + bonusPerMatch * record.remaining;

    return {
      teamNumber: team.teamNumber,
      name: team.name,
      schoolName: team.schoolName,
      currentRank: team.rank,
      predictedRank: 0,
      currentRp,
      projectedRp: currentRp + rpRemaining,
      rpRemaining,
      wins: record.wins,
      ties: record.ties,
      losses: record.losses,
      played: record.played,
      remaining: record.remaining,
      difficulty:
        record.difficultyCount > 0 ? record.difficultySum / record.difficultyCount : null,
      difficultyRank: null,
      oprTotal: team.hasOpr
        ? Math.max(0, team.oprAuto) + Math.max(0, team.oprTeleop)
        : 0,
    };
  });

  predictions.sort(
    (a, b) => b.projectedRp - a.projectedRp || b.oprTotal - a.oprTotal || a.teamNumber - b.teamNumber,
  );
  predictions.forEach((entry, at) => {
    entry.predictedRank = at + 1;
  });

  // Hardest remaining schedule first; teams with nothing left to play are not ranked.
  const byDifficulty = predictions
    .filter((entry) => entry.difficulty !== null)
    .sort((a, b) => (b.difficulty ?? 0) - (a.difficulty ?? 0) || a.teamNumber - b.teamNumber);
  byDifficulty.forEach((entry, at) => {
    entry.difficultyRank = at + 1;
  });

  return predictions;
}
