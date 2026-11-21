import { describe, expect, it } from 'vitest';
import { awardLabel, normalizeAward, placementLabel, sortAwards, type TeamAward } from './awards';
import type { RawTeamAward } from '../api/raw';

function award(overrides: Partial<TeamAward> = {}): TeamAward {
  return {
    type: 'Inspire',
    placement: 1,
    divisionName: null,
    personName: null,
    eventCode: 'AUBRQ2',
    eventName: 'Austin Qualifier 2',
    eventStart: '2026-01-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('awardLabel', () => {
  it('spells out the judged awards and the alliance honours', () => {
    expect(awardLabel('Inspire')).toBe('Inspire Award');
    expect(awardLabel('Think')).toBe('Think Award');
    expect(awardLabel('Winner')).toBe('Winning Alliance');
    expect(awardLabel('DeansListFinalist')).toBe("Dean's List Finalist");
  });
});

describe('placementLabel', () => {
  it('ordinalises judged awards', () => {
    expect(placementLabel('Inspire', 1)).toBe('1st');
    expect(placementLabel('Think', 2)).toBe('2nd');
    expect(placementLabel('Connect', 3)).toBe('3rd');
    expect(placementLabel('Motivate', 11)).toBe('11th');
    expect(placementLabel('Motivate', 22)).toBe('22nd');
  });

  it('leaves the unique honours unnumbered', () => {
    expect(placementLabel('Winner', 1)).toBe('');
    expect(placementLabel('DivisionFinalist', 2)).toBe('');
  });

  it('ignores a missing placement', () => {
    expect(placementLabel('Inspire', 0)).toBe('');
    expect(placementLabel('Inspire', Number.NaN)).toBe('');
  });
});

describe('sortAwards', () => {
  it('puts the most recent event first, then the higher honour', () => {
    const sorted = sortAwards([
      award({ eventCode: 'OLD', eventStart: '2025-12-01T00:00:00.000Z', type: 'Think' }),
      award({ eventCode: 'NEW', eventStart: '2026-02-01T00:00:00.000Z', type: 'Think', placement: 2 }),
      award({ eventCode: 'NEW', eventStart: '2026-02-01T00:00:00.000Z', type: 'Inspire', placement: 1 }),
    ]);
    expect(sorted.map((entry) => `${entry.eventCode}:${entry.type}`)).toEqual([
      'NEW:Inspire',
      'NEW:Think',
      'OLD:Think',
    ]);
  });
});

describe('normalizeAward', () => {
  it('flattens the event off the GraphQL shape', () => {
    const raw: RawTeamAward = {
      type: 'Inspire',
      placement: 1,
      divisionName: null,
      personName: null,
      event: { code: 'AUBRQ2', name: 'Austin Qualifier 2', start: '2026-01-10T00:00:00.000Z' },
    };
    expect(normalizeAward(raw)).toEqual({
      type: 'Inspire',
      placement: 1,
      divisionName: null,
      personName: null,
      eventCode: 'AUBRQ2',
      eventName: 'Austin Qualifier 2',
      eventStart: '2026-01-10T00:00:00.000Z',
    });
  });
});
