import { describe, expect, it } from 'vitest';
import { predictRankings } from './predict';
import type { MatchView, SideView } from './model';
import type { Alliance, Match, Station, TeamStrength } from '../types';

function team(
  teamNumber: number,
  rank: number | null,
  rp: number | null,
  oprAuto: number,
  oprTeleop: number,
): TeamStrength {
  return {
    teamNumber,
    name: `Team ${teamNumber}`,
    schoolName: '',
    rank,
    rp,
    matchesPlayed: 0,
    oprAuto,
    oprTeleop,
    sigma: 0,
    hasOpr: oprAuto + oprTeleop > 0,
  };
}

function side(alliance: Alliance, teams: number[], total: number): SideView {
  return {
    alliance,
    entries: teams.map((teamNumber) => ({
      teamNumber,
      name: `Team ${teamNumber}`,
      alliance,
      station: '1' as Station,
      surrogate: false,
      noShow: false,
      dq: false,
      onField: true,
      strength: null,
      contribution: null,
    })),
    auto: 0,
    teleop: total,
    penalties: 0,
    total,
    sigma: 0,
    missingTeams: [],
    projected: false,
  };
}

function view(
  id: number,
  red: SideView,
  blue: SideView,
  options: { projected?: boolean; level?: Match['level'] } = {},
): MatchView {
  return {
    match: { id, played: true, level: options.level ?? 'Quals' } as Match,
    sides: [red, blue],
    projected: options.projected ?? false,
    leader: null,
  };
}

function byTeam(entries: ReturnType<typeof predictRankings>) {
  return new Map(entries.map((entry) => [entry.teamNumber, entry]));
}

describe('predictRankings', () => {
  it('adds the points a remaining match is expected to bring to the earned total', () => {
    const predictions = predictRankings(
      [
        // Unscored: 11 and 12 project far above 21 and 22.
        view(1, side('Red', [11, 12], 100), side('Blue', [21, 22], 20), { projected: true }),
        // Scored: 21 and 22 beat 31 and 32, so they already banked a win.
        view(2, side('Red', [21, 22], 60), side('Blue', [31, 32], 20)),
      ],
      new Map([
        [11, team(11, null, 0, 20, 30)],
        [12, team(12, null, 0, 20, 30)],
        [21, team(21, 1, 2, 5, 5)],
        [22, team(22, 1, 2, 5, 5)],
        [31, team(31, 2, 0, 0, 0)],
        [32, team(32, 2, 0, 0, 0)],
      ]),
    );
    const byNumber = byTeam(predictions);

    expect(byNumber.get(11)?.currentRp).toBe(0);
    expect(byNumber.get(11)?.remaining).toBe(1);
    expect(byNumber.get(11)?.projectedRp ?? 0).toBeGreaterThan(1.9);
    expect(byNumber.get(21)?.wins).toBe(1);
    expect(byNumber.get(21)?.remaining).toBe(1);
    // 21 also has a match left, but it projects to lose it.
    expect(byNumber.get(21)?.projectedRp ?? 0).toBeCloseTo(2, 1);
    expect(byNumber.get(31)?.projectedRp).toBe(0);
  });

  it('carries observed bonus points into the matches still to play', () => {
    // 3 RP from one win means 1 bonus point per match, so the next match is worth ~3 in total.
    const predictions = predictRankings(
      [
        view(1, side('Red', [11, 12], 100), side('Blue', [21, 22], 0)),
        view(2, side('Red', [11, 12], 100), side('Blue', [21, 22], 0), { projected: true }),
      ],
      new Map([
        [11, team(11, 1, 3, 30, 40)],
        [12, team(12, 1, 4, 30, 40)],
        [21, team(21, 2, 0, 0, 0)],
        [22, team(22, 2, 0, 0, 0)],
      ]),
    );
    const team11 = byTeam(predictions).get(11);

    expect(team11?.wins).toBe(1);
    expect(team11?.played).toBe(1);
    expect(team11?.remaining).toBe(1);
    expect(team11?.rpRemaining ?? 0).toBeGreaterThan(2.9);
    expect(team11?.projectedRp ?? 0).toBeGreaterThan(5.9);
    // 12 banks more bonus per match, so it still leads the predicted table.
    expect(predictions.slice(0, 2).map((entry) => entry.teamNumber)).toEqual([12, 11]);
  });

  it('orders the predicted table by projected points and can move a team up', () => {
    const predictions = predictRankings(
      [view(1, side('Red', [11], 100), side('Blue', [21], 20), { projected: true })],
      new Map([
        [11, team(11, 2, 1, 40, 50)],
        [21, team(21, 1, 2, 1, 1)],
      ]),
    );
    const byNumber = byTeam(predictions);

    expect(predictions[0]?.teamNumber).toBe(11);
    expect(byNumber.get(11)?.predictedRank).toBe(1);
    expect(byNumber.get(11)?.currentRank).toBe(2);
    expect(byNumber.get(21)?.predictedRank).toBe(2);
  });

  it('ranks remaining-schedule difficulty by the projected strength faced', () => {
    const predictions = predictRankings(
      [view(1, side('Red', [11, 12], 150), side('Blue', [21, 22], 10), { projected: true })],
      new Map([
        [11, team(11, null, 0, 10, 10)],
        [12, team(12, null, 0, 10, 10)],
        [21, team(21, null, 0, 10, 10)],
        [22, team(22, null, 0, 10, 10)],
        [31, team(31, null, 0, 10, 10)],
      ]),
    );
    const byNumber = byTeam(predictions);

    // 21 and 22 face a 150-point projection; 11 and 12 face 10.
    expect(byNumber.get(21)?.difficulty).toBeCloseTo(150, 5);
    expect(byNumber.get(11)?.difficulty).toBeCloseTo(10, 5);
    expect(byNumber.get(21)?.difficultyRank).toBeLessThan(byNumber.get(11)?.difficultyRank ?? 0);
    // A team with no matches published has no difficulty to rank.
    expect(byNumber.get(31)?.difficulty).toBeNull();
    expect(byNumber.get(31)?.difficultyRank).toBeNull();
  });

  it('leaves playoffs and remote single-alliance matches out of the prediction', () => {
    const remote: MatchView = {
      match: { id: 3, played: true, level: 'Quals' } as Match,
      sides: [side('Solo', [11], 30)],
      projected: true,
      leader: null,
    };
    const predictions = predictRankings(
      [
        view(1, side('Red', [11, 12], 100), side('Blue', [21, 22], 0), {
          level: 'Semis',
          projected: true,
        }),
        remote,
      ],
      new Map([[11, team(11, 1, 0, 10, 10)]]),
    );

    expect(predictions[0]).toMatchObject({ remaining: 0, projectedRp: 0, difficulty: null });
  });

  it('keeps the earned total when nothing is left to play', () => {
    const predictions = predictRankings(
      [view(1, side('Red', [11, 12], 100), side('Blue', [21, 22], 20))],
      new Map([
        [11, team(11, 1, 5, 20, 20)],
        [12, team(12, 1, 4, 20, 20)],
        [21, team(21, 2, 1, 5, 5)],
        [22, team(22, 2, 1, 5, 5)],
      ]),
    );

    expect(predictions.every((entry) => entry.remaining === 0)).toBe(true);
    expect(predictions[0]).toMatchObject({ teamNumber: 11, projectedRp: 5, predictedRank: 1 });
  });
});
