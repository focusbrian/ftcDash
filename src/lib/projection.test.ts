import { describe, expect, it } from 'vitest';
import { normalCdf, projectAlliance, winProbability } from './projection';
import type { TeamStrength } from '../types';

function strength(
  teamNumber: number,
  auto: number,
  teleop: number,
  sigma = 20,
): TeamStrength {
  return {
    teamNumber,
    name: `Team ${teamNumber}`,
    schoolName: '',
    rank: 1,
    rp: 2,
    matchesPlayed: 6,
    oprAuto: auto,
    oprTeleop: teleop,
    sigma,
    hasOpr: true,
  };
}

describe('projectAlliance', () => {
  it('adds up auto and teleop OPR for every team on the alliance', () => {
    const teams = new Map([
      [1, strength(1, 30, 70)],
      [2, strength(2, 10, 40)],
    ]);

    const projection = projectAlliance([1, 2], teams);

    expect(projection.auto).toBeCloseTo(40);
    expect(projection.teleop).toBeCloseTo(110);
    expect(projection.total).toBeCloseTo(150);
    expect(projection.missingTeams).toEqual([]);
  });

  it('counts teams without OPR data as zero and reports them', () => {
    const teams = new Map([[1, strength(1, 20, 50)]]);

    const projection = projectAlliance([1, 99], teams);

    expect(projection.total).toBeCloseTo(70);
    expect(projection.missingTeams).toEqual([99]);
    expect(projection.contributions).toHaveLength(2);
    // Known team deviation plus the fallback floor for the unknown team.
    expect(projection.sigma).toBeCloseTo(Math.hypot(20, 8));
  });

  it('floors negative OPR components at zero', () => {
    const teams = new Map([[1, strength(1, -4, 12)]]);

    const projection = projectAlliance([1], teams);

    expect(projection.auto).toBe(0);
    expect(projection.teleop).toBe(12);
    expect(projection.total).toBe(12);
    expect(projection.contributions[0]?.auto).toBe(0);
  });

  it('derives a fallback spread from the team total when no deviation is published', () => {
    const teams = new Map([[1, strength(1, 10, 40, 0)]]);

    const projection = projectAlliance([1], teams);

    expect(projection.sigma).toBeCloseTo(0.15 * 50 + 8);
  });
});

describe('normalCdf', () => {
  it('matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 5);
    expect(normalCdf(1)).toBeCloseTo(0.8413, 4);
    expect(normalCdf(-1)).toBeCloseTo(0.1587, 4);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
  });
});

describe('winProbability', () => {
  const base = {
    contributions: [],
    missingTeams: [],
  };

  it('is a coin flip for identical alliances', () => {
    const side = { ...base, auto: 20, teleop: 60, total: 80, sigma: 25 };
    expect(winProbability(side, side)).toBeCloseTo(0.5, 5);
  });

  it('favours the higher projection and stays symmetric', () => {
    const strong = { ...base, auto: 30, teleop: 90, total: 120, sigma: 25 };
    const weak = { ...base, auto: 10, teleop: 40, total: 50, sigma: 25 };

    const strongChance = winProbability(strong, weak);
    const weakChance = winProbability(weak, strong);

    expect(strongChance).toBeGreaterThan(0.9);
    expect(strongChance + weakChance).toBeCloseTo(1, 5);
  });

  it('softens towards a coin flip when the spread is wide', () => {
    const tight = winProbability(
      { ...base, auto: 0, teleop: 100, total: 100, sigma: 5 },
      { ...base, auto: 0, teleop: 90, total: 90, sigma: 5 },
    );
    const wide = winProbability(
      { ...base, auto: 0, teleop: 100, total: 100, sigma: 60 },
      { ...base, auto: 0, teleop: 90, total: 90, sigma: 60 },
    );

    expect(tight).toBeGreaterThan(wide);
    expect(wide).toBeGreaterThan(0.5);
  });
});
