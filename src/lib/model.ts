import { projectAlliance, winProbability } from './projection';
import type { Alliance, Match, MatchTeamEntry, TeamStrength } from '../types';

export interface SideEntryView extends MatchTeamEntry {
  strength: TeamStrength | null;
  /** This team's share of the OPR projection, or null when there is no OPR data. */
  contribution: { auto: number; teleop: number; total: number } | null;
}

export interface SideView {
  alliance: Alliance;
  entries: SideEntryView[];
  auto: number;
  teleop: number;
  penalties: number;
  total: number;
  sigma: number;
  missingTeams: number[];
  /** True when these numbers are OPR projections rather than recorded scores. */
  projected: boolean;
}

export interface MatchLeader {
  alliance: Alliance;
  margin: number;
  /** Model win probability, only present for projected matches. */
  probability: number | null;
}

export interface MatchView {
  match: Match;
  sides: SideView[];
  projected: boolean;
  leader: MatchLeader | null;
}

/**
 * Merges recorded scores with the OPR model. A match is shown as projected whenever
 * FTC Scout has not published a score for every alliance yet.
 */
export function buildMatchView(match: Match, teams: Map<number, TeamStrength>): MatchView {
  const projected = match.sides.length === 0 || match.sides.some((side) => side.scores === null);

  const sides: SideView[] = match.sides.map((side) => {
    const onField = side.entries.filter((entry) => !entry.noShow);
    const projection = projectAlliance(
      onField.map((entry) => entry.teamNumber),
      teams,
    );
    const contributions = new Map(projection.contributions.map((c) => [c.teamNumber, c]));

    const scores = side.scores;
    const useReal = !projected && scores !== null;

    return {
      alliance: side.alliance,
      entries: side.entries.map((entry) => ({
        ...entry,
        strength: teams.get(entry.teamNumber) ?? null,
        contribution: contributions.get(entry.teamNumber) ?? null,
      })),
      auto: useReal ? scores.auto : projection.auto,
      teleop: useReal ? scores.teleop : projection.teleop,
      penalties: useReal ? scores.penalties : 0,
      total: useReal ? scores.total : projection.total,
      sigma: projection.sigma,
      missingTeams: projection.missingTeams,
      projected: !useReal,
    };
  });

  const red = sides.find((side) => side.alliance === 'Red') ?? sides[0] ?? null;
  const blue = sides.find((side) => side.alliance === 'Blue') ?? sides[1] ?? null;

  let leader: MatchLeader | null = null;
  const margin = red && blue ? Math.abs(red.total - blue.total) : 0;

  if (red && blue && margin > 0) {
    const redFavored = red.total > blue.total;
    const redWinChance = projected ? winProbability(toProjection(red), toProjection(blue)) : null;
    const favored = redFavored ? red : blue;

    leader = {
      alliance: favored.alliance,
      margin,
      probability: redWinChance === null ? null : redFavored ? redWinChance : 1 - redWinChance,
    };
  }

  return { match, sides, projected, leader };
}

function toProjection(side: SideView) {
  return {
    auto: side.auto,
    teleop: side.teleop,
    total: side.total,
    sigma: side.sigma,
    contributions: [],
    missingTeams: side.missingTeams,
  };
}
