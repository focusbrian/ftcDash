import { describe, expect, it } from 'vitest';
import { applySeasonOpr, oprPositions, rankTeams, sortTeamsBy } from './teams';
import type { TeamStrength } from '../types';

function team(
  teamNumber: number,
  rank: number | null,
  oprAuto: number,
  oprTeleop: number,
  hasOpr = true,
): TeamStrength {
  return {
    teamNumber,
    name: `Team ${teamNumber}`,
    schoolName: '',
    rank,
    rp: null,
    matchesPlayed: 0,
    oprAuto,
    oprTeleop,
    sigma: 0,
    hasOpr,
  };
}

describe('rankTeams', () => {
  it('orders ranked teams by official rank', () => {
    const sorted = rankTeams([team(3, 7, 0, 0), team(1, 2, 0, 0), team(2, 5, 0, 0)]);
    expect(sorted.map((entry) => entry.teamNumber)).toEqual([1, 2, 3]);
  });

  it('puts unranked teams after ranked ones, strongest OPR first', () => {
    const sorted = rankTeams([
      team(10, null, 5, 30),
      team(11, 9, 1, 1),
      team(12, null, 10, 40),
    ]);
    expect(sorted.map((entry) => entry.teamNumber)).toEqual([11, 12, 10]);
  });

  it('breaks ties by team number and ignores negative OPR components', () => {
    const sorted = rankTeams([
      team(35560, 4, 0, 0),
      team(35559, 4, -8, 8),
      team(35561, null, 0, 0, false),
    ]);
    expect(sorted.map((entry) => entry.teamNumber)).toEqual([35559, 35560, 35561]);
  });
});

describe('sortTeamsBy', () => {
  const teams = [
    team(10, 1, 5, 5),
    team(11, 2, 40, 40),
    team(12, 3, 1, 1),
    team(13, null, 60, 60),
  ];

  it('keeps the official order when sorting by rank', () => {
    expect(sortTeamsBy(teams, 'rank').map((entry) => entry.teamNumber)).toEqual([10, 11, 12, 13]);
  });

  it('puts the strongest OPR first, ranked or not, and ties with the official rank', () => {
    expect(sortTeamsBy(teams, 'opr').map((entry) => entry.teamNumber)).toEqual([13, 11, 10, 12]);

    const tied = sortTeamsBy([team(2, 5, 10, 10), team(1, 3, 10, 10)], 'opr');
    expect(tied.map((entry) => entry.teamNumber)).toEqual([1, 2]);
  });

  it('sinks teams with no OPR and leaves the input alone', () => {
    const input = [team(20, 1, 0, 0, false), team(21, 2, 3, 4)];
    expect(sortTeamsBy(input, 'opr').map((entry) => entry.teamNumber)).toEqual([21, 20]);
    expect(input.map((entry) => entry.teamNumber)).toEqual([20, 21]);
  });
});

describe('oprPositions', () => {
  it('numbers every team by OPR so a filtered list keeps the event-wide places', () => {
    const positions = oprPositions([
      team(10, 1, 5, 5),
      team(11, 3, 40, 40),
      team(12, 2, 20, 20),
    ]);

    expect(positions.get(11)).toBe(1);
    expect(positions.get(12)).toBe(2);
    expect(positions.get(10)).toBe(3);
    // Filtering to a subset must not renumber the survivors.
    const filtered = oprPositions([team(10, 1, 5, 5), team(12, 2, 20, 20)]);
    expect(filtered.get(10)).toBe(2);
  });
});

describe('applySeasonOpr', () => {
  it('stands a team on its most recent season OPR until the event publishes one', () => {
    const strengths = new Map([[7, team(7, null, 0, 0, false)]]);
    const merged = applySeasonOpr(strengths, new Map([[7, { auto: 12, teleop: 34, total: 46 }]]));

    expect(merged.get(7)).toMatchObject({
      oprAuto: 12,
      oprTeleop: 34,
      hasOpr: true,
      oprFromSeason: true,
    });
    // The event's own strengths are untouched, so a refresh starts from the published values again.
    expect(strengths.get(7)?.hasOpr).toBe(false);
  });

  it('keeps an OPR the event has already published', () => {
    const strengths = new Map([[7, team(7, 3, 20, 40)]]);
    const merged = applySeasonOpr(strengths, new Map([[7, { auto: 1, teleop: 2, total: 3 }]]));

    expect(merged.get(7)).toMatchObject({ oprAuto: 20, oprTeleop: 40 });
    expect(merged.get(7)?.oprFromSeason).toBeUndefined();
  });

  it('never invents teams and hands the map back untouched when there is no fallback', () => {
    const strengths = new Map([[7, team(7, null, 0, 0, false)]]);
    expect(applySeasonOpr(strengths, new Map())).toBe(strengths);
    expect(applySeasonOpr(strengths, new Map([[8, { auto: 1, teleop: 2, total: 3 }]])).size).toBe(1);
  });
});
