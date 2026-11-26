import { describe, expect, it } from 'vitest';
import { rollingOprForTeam } from './opr';
import type { MatchView, SideView } from './model';
import type { Match, Station } from '../types';

function side(
  alliance: 'Red' | 'Blue',
  teams: number[],
  auto: number,
  teleop: number,
  penalties = 0,
): SideView {
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
    auto,
    teleop,
    penalties,
    total: auto + teleop + penalties,
    sigma: 0,
    missingTeams: [],
    projected: false,
  };
}

function view(
  id: number,
  red: SideView,
  blue: SideView,
  level: Match['level'] = 'Quals',
): MatchView {
  return {
    match: { id, played: true, level, matchNum: id, series: 0 } as Match,
    sides: [red, blue],
    projected: false,
    leader: null,
  };
}

// Team 1 is always on the stronger alliance, team 4 always on the weaker one.
const views = [
  view(1, side('Red', [1, 2], 10, 30), side('Blue', [3, 4], 5, 10)),
  view(2, side('Red', [1, 3], 12, 34), side('Blue', [2, 4], 4, 8)),
  view(3, side('Red', [1, 4], 9, 28), side('Blue', [2, 3], 6, 12)),
];

describe('rollingOprForTeam', () => {
  it('adds one point per match the team played', () => {
    expect(rollingOprForTeam(views, 1)).toHaveLength(3);
  });

  it('says which match each snapshot belongs to, so a chart point can open it', () => {
    const points = rollingOprForTeam(views, 1);
    expect(points.map((point) => point.matchId)).toEqual([1, 2, 3]);
    expect(points.map((point) => point.label)).toEqual(['Q1', 'Q2', 'Q3']);
  });

  it('ranks a team on the high-scoring alliance above one on the low-scoring side', () => {
    const strong = rollingOprForTeam(views, 1).at(-1);
    const weak = rollingOprForTeam(views, 4).at(-1);

    expect(strong).toBeDefined();
    expect(weak).toBeDefined();
    expect(strong!.total).toBeGreaterThan(weak!.total);
    expect(weak!.total).toBeGreaterThanOrEqual(0);
  });

  it('keeps every component non-negative', () => {
    for (const point of rollingOprForTeam(views, 2)) {
      expect(point.auto).toBeGreaterThanOrEqual(0);
      expect(point.teleop).toBeGreaterThanOrEqual(0);
      expect(point.total).toBeGreaterThanOrEqual(0);
    }
  });

  it('returns nothing for a team that never took the field', () => {
    expect(rollingOprForTeam(views, 99)).toEqual([]);
  });

  it('ignores playoff matches, matching the basis of FTC Scout’s event OPR', () => {
    const withPlayoffs = [
      ...views,
      view(4, side('Red', [1, 2], 60, 180), side('Blue', [3, 4], 20, 40), 'Semis'),
    ];

    expect(rollingOprForTeam(withPlayoffs, 1)).toEqual(rollingOprForTeam(views, 1));
  });

  it('still uses playoff matches when the event has no qualification matches', () => {
    const playoffsOnly = [view(4, side('Red', [1, 2], 60, 180), side('Blue', [3, 4], 20, 40), 'Finals')];

    expect(rollingOprForTeam(playoffsOnly, 1)).toHaveLength(1);
  });

  it('leaves surrogate appearances out of the fit', () => {
    const red = side('Red', [1, 2], 10, 30);
    const surrogate: MatchView = {
      match: { id: 5, played: true, level: 'Quals' } as Match,
      sides: [
        {
          ...red,
          entries: red.entries.map((entry) =>
            entry.teamNumber === 1 ? { ...entry, surrogate: true } : entry,
          ),
        },
        side('Blue', [3, 4], 5, 10),
      ],
      projected: false,
      leader: null,
    };

    expect(rollingOprForTeam([surrogate], 1)).toEqual([]);
  });
});
