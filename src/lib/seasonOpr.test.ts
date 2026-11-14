import { describe, expect, it } from 'vitest';
import { seasonOprBaseline, seasonOprSeries } from './seasonOpr';
import type { RawTeamOprEvent } from '../api/raw';

function entry(
  code: string,
  start: string,
  opr?: { auto: number; teleop: number; total: number },
): RawTeamOprEvent {
  return {
    event: { code, name: `Event ${code}`, start },
    stats: opr
      ? {
          rank: 1,
          rp: 0,
          qualMatchesPlayed: 5,
          opr: {
            autoPoints: opr.auto,
            dcPoints: opr.teleop,
            totalPoints: opr.total,
            totalPointsNp: opr.total,
          },
          dev: null,
          tot: null,
        }
      : null,
  };
}

describe('seasonOprBaseline', () => {
  it('takes the OPR from the season’s most recent event', () => {
    const baseline = seasonOprBaseline(2025, [
      entry('AAA', '2025-12-01T14:00:00Z', { auto: 10, teleop: 20, total: 30 }),
      entry('BBB', '2026-02-01T14:00:00Z', { auto: 12, teleop: 24, total: 36 }),
      // A later event with no published OPR must not blank out the season.
      entry('CCC', '2026-03-01T14:00:00Z'),
    ]);

    expect(baseline).toMatchObject({
      kind: 'prior',
      season: 2025,
      code: 'BBB',
      auto: 12,
      teleop: 24,
      total: 36,
    });
  });

  it('is null when the season published no OPR', () => {
    expect(seasonOprBaseline(2025, [])).toBeNull();
    expect(seasonOprBaseline(2025, [entry('AAA', '2025-12-01T14:00:00Z')])).toBeNull();
  });
});

describe('seasonOprSeries', () => {
  it('anchors the series to the previous season and keeps old-to-new order', () => {
    const prior = seasonOprBaseline(2025, [
      entry('OLD', '2026-01-10T14:00:00Z', { auto: 8, teleop: 16, total: 24 }),
    ]);
    const points = seasonOprSeries(2026, [
      entry('BBB', '2026-12-05T14:00:00Z', { auto: 11, teleop: 21, total: 32 }),
      entry('AAA', '2026-11-07T14:00:00Z', { auto: 10, teleop: 20, total: 30 }),
    ], prior);

    expect(points.map((point) => [point.kind, point.code])).toEqual([
      ['prior', 'OLD'],
      ['recorded', 'AAA'],
      ['recorded', 'BBB'],
    ]);
    expect(points[0]).toMatchObject({ season: 2025, total: 24 });
    expect(points[1]).toMatchObject({ season: 2026, total: 30 });
  });

  it('holds the last published OPR in the slot of an event without one', () => {
    const points = seasonOprSeries(2026, [
      entry('AAA', '2026-11-07T14:00:00Z', { auto: 10, teleop: 20, total: 30 }),
      entry('BBB', '2026-12-05T14:00:00Z'),
      entry('CCC', '2027-01-09T14:00:00Z'),
    ], null);

    expect(points.map((point) => [point.kind, point.code, point.total])).toEqual([
      ['recorded', 'AAA', 30],
      ['estimate', 'BBB', 30],
      ['estimate', 'CCC', 30],
    ]);
  });

  it('uses the previous season as the stand-in until the first event reports OPR', () => {
    const prior = seasonOprBaseline(2025, [
      entry('OLD', '2026-01-10T14:00:00Z', { auto: 8, teleop: 16, total: 24 }),
    ]);
    const points = seasonOprSeries(2026, [entry('AAA', '2026-11-07T14:00:00Z')], prior);

    expect(points.map((point) => [point.kind, point.code, point.total])).toEqual([
      ['prior', 'OLD', 24],
      ['estimate', 'AAA', 24],
    ]);
  });

  it('drops events that have nothing to plot and skips the anchor without events', () => {
    expect(seasonOprSeries(2026, [entry('AAA', '2026-11-07T14:00:00Z')], null)).toEqual([]);

    const prior = seasonOprBaseline(2025, [
      entry('OLD', '2026-01-10T14:00:00Z', { auto: 8, teleop: 16, total: 24 }),
    ]);
    expect(seasonOprSeries(2026, [], prior)).toEqual([]);
  });

  it('floors negative OPR components at zero', () => {
    const points = seasonOprSeries(2026, [
      entry('AAA', '2026-11-07T14:00:00Z', { auto: -4, teleop: 19, total: 15 }),
    ], null);

    expect(points[0]).toMatchObject({ auto: 0, teleop: 19, total: 15 });
  });
});
