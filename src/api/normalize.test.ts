import { describe, expect, it } from 'vitest';
import { latestPlayedMatchId, normalizeEvent, normalizeScores } from './normalize';
import { buildMatchView } from '../lib/model';
import type { RawEvent } from './raw';

const event: RawEvent = {
  code: 'TEST',
  name: 'Test Qualifier',
  start: '2026-01-10',
  end: '2026-01-11',
  timezone: 'America/New_York',
  hasMatches: true,
  address: '1 Main St',
  website: null,
  liveStreamURL: null,
  type: 'Qualifier',
  fieldCount: 2,
  location: { venue: 'Gym', city: 'Boston', state: 'MA', country: 'USA' },
  teams: [
    {
      teamNumber: 100,
      team: { number: 100, name: 'Alpha', schoolName: 'Alpha High' },
      stats: {
        rank: 1,
        rp: 3.5,
        qualMatchesPlayed: 5,
        opr: { autoPoints: 30, dcPoints: 70, totalPoints: 100, totalPointsNp: 96 },
        dev: { autoPoints: 5, dcPoints: 10, totalPoints: 22, totalPointsNp: 21 },
        tot: { autoPoints: 30, dcPoints: 70, totalPoints: 100, totalPointsNp: 96 },
      },
    },
    {
      teamNumber: 200,
      team: { number: 200, name: 'Beta', schoolName: 'Beta High' },
      stats: {
        rank: 2,
        rp: 3,
        qualMatchesPlayed: 5,
        opr: { autoPoints: 20, dcPoints: 50, totalPoints: 70, totalPointsNp: 66 },
        dev: { autoPoints: 3, dcPoints: 8, totalPoints: 15, totalPointsNp: 14 },
        tot: { autoPoints: 20, dcPoints: 50, totalPoints: 70, totalPointsNp: 66 },
      },
    },
    {
      teamNumber: 300,
      team: { number: 300, name: 'Gamma', schoolName: 'Gamma High' },
      stats: null,
    },
  ],
  matches: [
    {
      id: 2,
      matchNum: 2,
      tournamentLevel: 'Quals',
      series: 0,
      description: 'Quals 2',
      hasBeenPlayed: false,
      scheduledStartTime: '2026-01-10T15:30:00.000Z',
      actualStartTime: null,
      teams: [
        { alliance: 'Red', station: 'One', teamNumber: 300, surrogate: false, noShow: false, dq: false, onField: true },
        { alliance: 'Red', station: 'Two', teamNumber: 100, surrogate: false, noShow: false, dq: false, onField: true },
        { alliance: 'Blue', station: 'One', teamNumber: 200, surrogate: false, noShow: false, dq: false, onField: true },
        { alliance: 'Blue', station: 'Two', teamNumber: 100, surrogate: false, noShow: false, dq: false, onField: true },
      ],
      scores: null,
    },
    {
      id: 1,
      matchNum: 1,
      tournamentLevel: 'Quals',
      series: 0,
      description: 'Quals 1',
      hasBeenPlayed: true,
      scheduledStartTime: '2026-01-10T15:15:00.000Z',
      actualStartTime: '2026-01-10T15:18:00.000Z',
      teams: [
        { alliance: 'Red', station: 'One', teamNumber: 100, surrogate: false, noShow: false, dq: false, onField: true },
        { alliance: 'Red', station: 'Two', teamNumber: 200, surrogate: false, noShow: false, dq: false, onField: true },
        { alliance: 'Blue', station: 'One', teamNumber: 300, surrogate: false, noShow: true, dq: false, onField: false },
      ],
      scores: {
        __typename: 'MatchScores2026',
        red: { autoPoints: 50, dcPoints: 120, totalPoints: 185, totalPointsNp: 170 },
        blue: { autoPoints: 20, dcPoints: 60, totalPoints: 80, totalPointsNp: 80 },
      },
    },
  ],
};

describe('normalizeEvent', () => {
  const data = normalizeEvent(event, 2026);

  it('sorts matches by level, series and match number', () => {
    expect(data.matches.map((match) => match.id)).toEqual([1, 2]);
  });

  it('maps OPR and deviation into team strengths', () => {
    const alpha = data.teams.get(100);
    expect(alpha).toMatchObject({ name: 'Alpha', oprAuto: 30, oprTeleop: 70, sigma: 21, hasOpr: true });
    expect(data.teams.get(300)?.hasOpr).toBe(false);
  });

  it('records real scores, penalties and team names', () => {
    const played = data.matches[0]!;
    const red = played.sides.find((side) => side.alliance === 'Red')!;

    expect(red.scores).toEqual({ auto: 50, teleop: 120, penalties: 15, total: 185 });
    expect(red.entries.map((entry) => entry.name)).toEqual(['Alpha', 'Beta']);
    expect(red.entries.every((entry) => entry.alliance === 'Red')).toBe(true);
  });
});

describe('buildMatchView', () => {
  const data = normalizeEvent(event, 2026);
  const views = data.matches.map((match) => buildMatchView(match, data.teams));

  it('uses published scores for played matches', () => {
    const played = views[0]!;
    expect(played.projected).toBe(false);

    const red = played.sides.find((side) => side.alliance === 'Red')!;
    expect(red.auto).toBe(50);
    expect(red.teleop).toBe(120);
    expect(red.total).toBe(185);
    expect(played.leader).toMatchObject({ alliance: 'Red', margin: 105, probability: null });
  });

  it('projects unplayed matches from OPR, ignoring no-shows', () => {
    const upcoming = views[1]!;
    expect(upcoming.projected).toBe(true);

    const red = upcoming.sides.find((side) => side.alliance === 'Red')!;
    // 300 has no stats (counted as zero) and 100 contributes 30 auto / 70 teleop.
    expect(red.auto).toBeCloseTo(30);
    expect(red.teleop).toBeCloseTo(70);
    expect(red.missingTeams).toEqual([300]);

    const blue = upcoming.sides.find((side) => side.alliance === 'Blue')!;
    expect(blue.auto).toBeCloseTo(50);
    expect(blue.teleop).toBeCloseTo(120);

    expect(upcoming.leader?.alliance).toBe('Blue');
    expect(upcoming.leader?.probability).toBeGreaterThan(0.5);
  });

  it('keeps no-show teams on the card but out of the projection', () => {
    const played = views[0]!;
    const blue = played.sides.find((side) => side.alliance === 'Blue')!;

    expect(blue.entries).toHaveLength(1);
    expect(blue.entries[0]?.noShow).toBe(true);
    expect(blue.missingTeams).toEqual([]);
  });
});

describe('latestPlayedMatchId', () => {
  const match = (
    id: number,
    played: boolean,
    actual: string | null,
    scheduled: string | null = null,
  ) => ({ id, played, actualStartTime: actual, scheduledStartTime: scheduled });

  it('returns null when nothing has been played', () => {
    expect(latestPlayedMatchId([])).toBeNull();
    expect(latestPlayedMatchId([match(1, false, null, '2026-01-10T15:00:00.000Z')])).toBeNull();
  });

  it('picks the played match with the latest start time', () => {
    const matches = [
      match(1, true, '2026-01-10T15:00:00.000Z'),
      match(2, true, '2026-01-10T15:30:00.000Z'),
      match(3, false, null, '2026-01-10T16:00:00.000Z'),
      match(4, true, '2026-01-10T14:45:00.000Z'),
    ];
    expect(latestPlayedMatchId(matches)).toBe(2);
  });

  it('falls back to the scheduled time when no actual start was recorded', () => {
    const matches = [
      match(1, true, null, '2026-01-10T15:00:00.000Z'),
      match(2, true, null, '2026-01-10T16:00:00.000Z'),
    ];
    expect(latestPlayedMatchId(matches)).toBe(2);
  });

  it('prefers a real start time over a later scheduled one', () => {
    const matches = [
      match(1, true, '2026-01-10T15:05:00.000Z', '2026-01-10T15:00:00.000Z'),
      match(2, true, '2026-01-10T15:40:00.000Z', '2026-01-10T15:30:00.000Z'),
    ];
    expect(latestPlayedMatchId(matches)).toBe(2);
  });

  it('keeps list order as the tie-breaker', () => {
    const same = '2026-01-10T15:00:00.000Z';
    expect(latestPlayedMatchId([match(1, true, same), match(2, true, same)])).toBe(2);
  });
});

describe('normalizeScores', () => {
  it('returns null when a per-alliance score is missing', () => {
    expect(normalizeScores({ __typename: 'MatchScores2026' }, 'red')).toBeNull();
  });

  it('reads the root score fields used by remote seasons', () => {
    expect(
      normalizeScores(
        {
          __typename: 'MatchScores2021Remote',
          autoPoints: 10,
          dcPoints: 30,
          totalPoints: 45,
          totalPointsNp: 40,
        },
        'solo',
      ),
    ).toEqual({ auto: 10, teleop: 30, penalties: 5, total: 45 });
  });
});

describe('remote-season matches', () => {
  const remote: RawEvent = {
    ...event,
    matches: [
      {
        id: 90,
        matchNum: 1,
        tournamentLevel: 'Quals',
        series: 0,
        description: 'Q-1',
        hasBeenPlayed: true,
        scheduledStartTime: null,
        actualStartTime: null,
        teams: [
          { alliance: 'Solo', station: 'Solo', teamNumber: 100, surrogate: false, noShow: false, dq: false, onField: true },
        ],
        scores: {
          __typename: 'MatchScores2021Remote',
          autoPoints: 12,
          dcPoints: 48,
          totalPoints: 60,
          totalPointsNp: 60,
        },
      },
    ],
  };

  it('shows the recorded solo score instead of a projection', () => {
    const data = normalizeEvent(remote, 2021);
    const view = buildMatchView(data.matches[0]!, data.teams);

    expect(view.projected).toBe(false);
    expect(view.sides).toHaveLength(1);
    expect(view.sides[0]?.total).toBe(60);
    expect(view.leader).toBeNull();
  });
});

describe('matches without any OPR data', () => {
  it('projects zeroes and reports no leader', () => {
    const noStats: RawEvent = {
      ...event,
      teams: event.teams.map((participation) => ({ ...participation, stats: null })),
    };

    const data = normalizeEvent(noStats, 2026);
    const view = buildMatchView(data.matches[1]!, data.teams);
    const red = view.sides.find((side) => side.alliance === 'Red')!;

    expect(view.projected).toBe(true);
    expect(red.total).toBe(0);
    expect(red.missingTeams).toHaveLength(2);
    expect(view.leader).toBeNull();
  });
});
