import { describe, expect, it } from 'vitest';
import { filterEvents, pickDefaultEvent, sortEventsForPicker, teamNumberQuery } from './events';
import { buildHash, parseRoute } from './route';
import type { EventSummary } from '../types';

function event(code: string, start: string, end = start, hasMatches = true): EventSummary {
  return { code, name: `${code} Event`, start, end, type: 'Qualifier', hasMatches };
}

const TODAY = '2026-01-15';

describe('pickDefaultEvent', () => {
  it('prefers an event happening today', () => {
    const events = [
      event('PAST', '2026-01-08'),
      event('NOW', '2026-01-14', '2026-01-16'),
      event('SOON', '2026-01-24'),
    ];

    expect(pickDefaultEvent(events, TODAY)?.code).toBe('NOW');
  });

  it('falls back to the most recent event that already has results', () => {
    const events = [
      event('OLD', '2025-12-01'),
      event('RECENT', '2026-01-10'),
      event('EMPTY', '2026-01-12', '2026-01-12', false),
      event('SOON', '2026-02-01'),
    ];

    expect(pickDefaultEvent(events, TODAY)?.code).toBe('RECENT');
  });

  it('returns null when there is nothing to pick', () => {
    expect(pickDefaultEvent([], TODAY)).toBeNull();
  });
});

describe('sortEventsForPicker', () => {
  it('orders today, then upcoming soonest-first, then past most-recent-first', () => {
    const events = [
      event('PAST_OLD', '2025-11-01'),
      event('UPCOMING_LATE', '2026-03-01'),
      event('NOW', '2026-01-14', '2026-01-16'),
      event('PAST_RECENT', '2026-01-10'),
      event('UPCOMING_SOON', '2026-01-18'),
    ];

    expect(sortEventsForPicker(events, TODAY).map((item) => item.code)).toEqual([
      'NOW',
      'UPCOMING_SOON',
      'UPCOMING_LATE',
      'PAST_RECENT',
      'PAST_OLD',
    ]);
  });
});

describe('filterEvents', () => {
  const events = [event('USCMP', '2026-04-01'), event('CANCMP', '2026-04-02')];

  it('matches on code or name, case-insensitively', () => {
    expect(filterEvents(events, 'usc').map((item) => item.code)).toEqual(['USCMP']);
    expect(filterEvents(events, 'can event').map((item) => item.code)).toEqual(['CANCMP']);
  });

  it('returns everything for an empty query', () => {
    expect(filterEvents(events, '   ')).toHaveLength(2);
  });
});

describe('route', () => {
  it('round-trips season, event and match', () => {
    const hash = buildHash({
      view: 'dashboard',
      season: 2026,
      code: 'USCMP',
      matchId: 12,
      teamNumber: null,
    });
    expect(hash).toBe('#/2026/USCMP/m/12');
    expect(parseRoute(hash)).toEqual({
      view: 'dashboard',
      season: 2026,
      code: 'USCMP',
      matchId: 12,
      teamNumber: null,
    });
  });

  it('round-trips a team page', () => {
    const hash = buildHash({
      view: 'dashboard',
      season: 2026,
      code: 'AUBRQ2',
      matchId: null,
      teamNumber: 14380,
    });
    expect(hash).toBe('#/2026/AUBRQ2/t/14380');
    expect(parseRoute(hash).teamNumber).toBe(14380);
  });

  it('handles a partial route and an empty hash', () => {
    expect(parseRoute('#/2025/AECMP')).toEqual({
      view: 'dashboard',
      season: 2025,
      code: 'AECMP',
      matchId: null,
      teamNumber: null,
    });
    expect(parseRoute('').code).toBeNull();
    expect(parseRoute('').season).toBeGreaterThan(2000);
  });

  it('routes to the config page', () => {
    expect(
      buildHash({ view: 'config', season: 2026, code: 'USCMP', matchId: 3, teamNumber: null }),
    ).toBe('#/config');
    expect(parseRoute('#/config').view).toBe('config');
  });
});

describe('teamNumberQuery', () => {
  it('reads a bare team number, with an optional hash', () => {
    expect(teamNumberQuery('10136')).toBe(10136);
    expect(teamNumberQuery('  #21036 ')).toBe(21036);
  });

  it('ignores anything that is not just a team number', () => {
    expect(teamNumberQuery('')).toBeNull();
    expect(teamNumberQuery('7')).toBeNull();
    expect(teamNumberQuery('10136 qualifier')).toBeNull();
    expect(teamNumberQuery('USCMP')).toBeNull();
    expect(teamNumberQuery('123456')).toBeNull();
  });
});
