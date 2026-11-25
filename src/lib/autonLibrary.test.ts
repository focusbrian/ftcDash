import { describe, expect, it } from 'vitest';
import type { RobotPlan, Waypoint } from './autoplan';
import {
  autonName,
  autonNameTaken,
  loadAuton,
  MAX_AUTON_NAME,
  MAX_SAVED_AUTONS,
  mergeAutons,
  parseAutonBundle,
  parseAutonLibrary,
  removeAuton,
  saveAuton,
  serializeAutonLibrary,
  withAutons,
  type SavedAuton,
} from './autonLibrary';

function wp(x: number, y: number, shots = 2): Waypoint {
  return { x, y, heading: 0, wait: 0, shots, after: 0 };
}

function robot(overrides: Partial<RobotPlan> = {}): RobotPlan {
  return {
    alliance: 'red',
    teamNumber: 10136,
    speed: 40,
    shotCycle: 0.4,
    path: [wp(0, -40), wp(0, 0)],
    ...overrides,
  };
}

function saved(entries: SavedAuton[], name: string, now: string, slot = 0, plan = robot()): SavedAuton[] {
  return saveAuton(entries, plan, slot, name, now);
}

describe('auton names', () => {
  it('trims, collapses spacing and caps the length', () => {
    expect(autonName('  Left   side  ')).toBe('Left side');
    expect(autonName('   ')).toBe('');
    expect(autonName('x'.repeat(MAX_AUTON_NAME + 20))).toHaveLength(MAX_AUTON_NAME);
  });
});

describe('the saved auton shelf', () => {
  it('starts empty when there is nothing stored', () => {
    expect(parseAutonLibrary(null)).toEqual([]);
    expect(parseAutonLibrary('not json')).toEqual([]);
    expect(parseAutonLibrary('{"autons":"nope"}')).toEqual([]);
  });

  it('round-trips a saved auton through storage', () => {
    const entries = saved([], 'Left side', '2026-11-25T12:00:00.000Z', 1);
    const read = parseAutonLibrary(serializeAutonLibrary(entries));

    expect(read).toEqual(entries);
    expect(read[0]?.name).toBe('Left side');
    expect(read[0]?.slot).toBe(1);
  });

  it('keeps the program, not the column’s alliance, when it is loaded elsewhere', () => {
    const entries = saved([], 'Left side', '2026-11-25T12:00:00.000Z', 0, robot({ alliance: 'red' }));
    const loaded = loadAuton(entries[0]!, 2);

    // Slot 2 is a blue column, so the same path drives for blue.
    expect(loaded?.alliance).toBe('blue');
    expect(loaded?.path).toHaveLength(2);
    expect(loaded?.path[1]?.shots).toBe(2);
    expect(loaded?.teamNumber).toBe(10136);
  });

  it('overwrites an auton saved under the same name and puts it first', () => {
    let entries = saved([], 'Left side', '2026-11-25T10:00:00.000Z', 0);
    entries = saved(entries, 'Other', '2026-11-25T11:00:00.000Z', 0);
    entries = saved(entries, '  left   SIDE ', '2026-11-25T12:00:00.000Z', 0, robot({ speed: 60 }));

    expect(entries.map((entry) => entry.name)).toEqual(['left SIDE', 'Other']);
    expect(loadAuton(entries[0]!, 0)?.speed).toBe(60);
  });

  it('ignores a blank name', () => {
    const entries = saved([], 'Left side', '2026-11-25T10:00:00.000Z');
    expect(saved(entries, '   ', '2026-11-25T11:00:00.000Z')).toEqual(entries);
  });

  it('keeps the shelf short by dropping the oldest auton', () => {
    let entries: SavedAuton[] = [];
    for (let i = 0; i < MAX_SAVED_AUTONS + 3; i += 1) {
      const stamp = `2026-11-25T${String(i).padStart(2, '0')}:00:00.000Z`;
      entries = saved(entries, `Auton ${i}`, stamp);
    }

    expect(entries).toHaveLength(MAX_SAVED_AUTONS);
    // The three oldest are gone, and the newest save is at the top.
    expect(entries.some((entry) => entry.name === 'Auton 0')).toBe(false);
    expect(entries[0]?.name).toBe(`Auton ${MAX_SAVED_AUTONS + 2}`);
  });

  it('drops entries it cannot read back', () => {
    const good = saved([], 'Left side', '2026-11-25T10:00:00.000Z')[0]!;
    const raw = JSON.stringify({
      autons: [
        good,
        { name: 'Broken', savedAt: '', slot: 0, text: 'not json' },
        { name: '   ', slot: 0, text: good.text },
        { name: 'No path', slot: 0, text: JSON.stringify({ robot: { speed: 40 } }) },
        'nope',
      ],
    });

    expect(parseAutonLibrary(raw).map((entry) => entry.name)).toEqual(['Left side']);
  });

  it('says whether a name is already on the shelf', () => {
    const entries = saved([], 'Left side', '2026-11-25T10:00:00.000Z');
    expect(autonNameTaken(entries, ' left  side ')).toBe(true);
    expect(autonNameTaken(entries, 'Right side')).toBe(false);
    expect(autonNameTaken(entries, '')).toBe(false);
  });

  it('removes an auton by name', () => {
    const entries = saved(saved([], 'A', '2026-11-25T10:00:00.000Z'), 'B', '2026-11-25T11:00:00.000Z');
    expect(removeAuton(entries, 'A').map((entry) => entry.name)).toEqual(['B']);
    expect(removeAuton(entries, 'missing')).toHaveLength(2);
  });
});

describe('autons bundled into an exported plan', () => {
  const planJson = JSON.stringify({ version: 1, snap: 1, headingSnap: 5, robots: [] }, null, 2);

  it('travels with the plan and reads back out of it', () => {
    const entries = saved(saved([], 'A', '2026-11-25T10:00:00.000Z'), 'B', '2026-11-25T11:00:00.000Z');
    const text = withAutons(planJson, entries);

    // The plan itself is untouched, and the shelf comes back in its stored order.
    expect(JSON.parse(text).robots).toEqual([]);
    expect(parseAutonBundle(text)).toEqual(entries);
  });

  it('leaves a plan with nothing ticked exactly as it was', () => {
    expect(withAutons(planJson, [])).toBe(planJson);
  });

  it('finds no autons in a plain plan or in junk', () => {
    expect(parseAutonBundle(planJson)).toEqual([]);
    expect(parseAutonBundle('not json')).toEqual([]);
    expect(parseAutonBundle(null)).toEqual([]);
  });

  it('drops a bundled auton that cannot be read back', () => {
    const good = saved([], 'Good', '2026-11-25T10:00:00.000Z')[0]!;
    const text = JSON.stringify({ robots: [], autons: [good, { name: 'Bad', text: 'nope' }] });
    expect(parseAutonBundle(text).map((entry) => entry.name)).toEqual(['Good']);
  });
});

describe('merging an imported shelf', () => {
  it('adds what is new and keeps the newer saving of a name', () => {
    const mine = saved([], 'Shared', '2026-11-25T10:00:00.000Z', 0, robot({ speed: 40 }));
    const theirs = saved(
      saved([], 'Shared', '2026-11-25T12:00:00.000Z', 0, robot({ speed: 60 })),
      'Only theirs',
      '2026-11-25T09:00:00.000Z',
    );

    const merged = mergeAutons(mine, theirs);
    expect(merged.map((entry) => entry.name)).toEqual(['Shared', 'Only theirs']);
    expect(loadAuton(merged[0]!, 0)?.speed).toBe(60);
  });

  it('keeps the local save when the import is older', () => {
    const mine = saved([], 'Shared', '2026-11-25T12:00:00.000Z', 0, robot({ speed: 40 }));
    const older = saved([], 'Shared', '2026-11-25T09:00:00.000Z', 0, robot({ speed: 60 }));

    expect(loadAuton(mergeAutons(mine, older)[0]!, 0)?.speed).toBe(40);
    expect(mergeAutons(mine, older)).toHaveLength(1);
  });
});
