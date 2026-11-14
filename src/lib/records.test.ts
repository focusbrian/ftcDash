import { describe, expect, it } from 'vitest';
import { eventRecords } from './records';
import type { MatchView, SideView } from './model';
import type { Match } from '../types';

function side(alliance: 'Red' | 'Blue' | 'Solo', auto: number, teleop: number, total = auto + teleop): SideView {
  return {
    alliance,
    entries: [],
    auto,
    teleop,
    penalties: 0,
    total,
    sigma: 0,
    missingTeams: [],
    projected: false,
  };
}

function view(id: number, sides: SideView[], projected = false): MatchView {
  return {
    match: { id, played: !projected } as Match,
    sides: sides.map((entry) => ({ ...entry, projected })),
    projected,
    leader: null,
  };
}

describe('eventRecords', () => {
  it('stars every match that tied the high score', () => {
    const records = eventRecords([
      view(1, [side('Red', 10, 30), side('Blue', 5, 20)]),
      view(2, [side('Red', 12, 40), side('Blue', 1, 2)]),
      view(3, [side('Red', 3, 4), side('Blue', 12, 40)]),
    ]);

    expect(records.total.value).toBe(52);
    expect([...records.total.matches]).toEqual([2, 3]);
  });

  it('tracks autonomous and teleop separately', () => {
    const records = eventRecords([
      view(1, [side('Red', 20, 5), side('Blue', 1, 1)]),
      view(2, [side('Red', 2, 60), side('Blue', 1, 1)]),
    ]);

    expect(records.auto.value).toBe(20);
    expect([...records.auto.matches]).toEqual([1]);
    expect(records.teleop.value).toBe(60);
    expect([...records.teleop.matches]).toEqual([2]);
    // Match 2's 62-point alliance total beats match 1's 25.
    expect(records.total.value).toBe(62);
    expect([...records.total.matches]).toEqual([2]);
  });

  it('ignores projected matches and scores with no auto/teleop split', () => {
    const records = eventRecords([
      view(1, [side('Red', 5, 10)], true),
      view(2, [side('Solo', 0, 0, 90)]),
      view(3, [side('Solo', 0, 0, 30)]),
    ]);

    expect(records.total.value).toBe(90);
    expect([...records.total.matches]).toEqual([2]);
    expect(records.auto.matches.size).toBe(0);
    expect(records.teleop.matches.size).toBe(0);
  });

  it('reports nothing when no match has been scored', () => {
    const records = eventRecords([view(1, [side('Red', 0, 0)], true)]);
    expect(records.total.value).toBe(0);
    expect(records.total.matches.size).toBe(0);
  });
});
