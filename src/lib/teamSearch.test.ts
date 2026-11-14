import { describe, expect, it } from 'vitest';
import { searchTeams } from './teamSearch';
import type { TeamStrength } from '../types';

function team(teamNumber: number, name: string, schoolName = ''): TeamStrength {
  return {
    teamNumber,
    name,
    schoolName,
    rank: null,
    rp: null,
    matchesPlayed: 3,
    oprAuto: 10,
    oprTeleop: 20,
    sigma: 8,
    hasOpr: true,
  };
}

const teams = [
  team(23502, 'Nexus', 'Nexus Robotics'),
  team(12350, 'Nexbots'),
  team(11143, 'Mechanical Bin Chickens', 'Warren Robotics'),
  team(34235, 'Data Force', 'Nexus Academy'),
];

describe('searchTeams', () => {
  it('returns nothing for an empty query', () => {
    expect(searchTeams(teams, '   ')).toEqual([]);
  });

  it('puts an exact team number first', () => {
    const hits = searchTeams(teams, '23502');
    expect(hits[0]?.teamNumber).toBe(23502);
  });

  it('matches a partial team number', () => {
    const hits = searchTeams(teams, '235');
    expect(hits.map((hit) => hit.teamNumber)).toContain(23502);
    expect(hits.map((hit) => hit.teamNumber)).toContain(34235);
  });

  it('matches names and school names, preferring name prefixes', () => {
    const hits = searchTeams(teams, 'nexus');
    expect(hits[0]?.teamNumber).toBe(23502);
    expect(hits.map((hit) => hit.teamNumber)).toContain(34235);
  });

  it('matches words inside a name', () => {
    const hits = searchTeams(teams, 'chickens');
    expect(hits.map((hit) => hit.teamNumber)).toEqual([11143]);
  });

  it('respects the result limit', () => {
    expect(searchTeams(teams, 'e', 2)).toHaveLength(2);
  });
});
