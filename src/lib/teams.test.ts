import { describe, expect, it } from 'vitest';
import { rankTeams } from './teams';
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
