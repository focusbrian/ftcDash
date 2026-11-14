import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDrafted, saveDrafted } from './selection';

/** Minimal stand-in for the browser's localStorage, since the suite runs in Node. */
function stubStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
  (globalThis as { window?: unknown }).window = { localStorage: storage };
  return map;
}

describe('alliance selection state', () => {
  let map: Map<string, string>;

  beforeEach(() => {
    map = stubStorage();
  });

  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('remembers crossed-off teams per event', () => {
    saveDrafted(2026, 'AUBRQ2', [14380, 26000]);

    expect(loadDrafted(2026, 'AUBRQ2')).toEqual([14380, 26000]);
    // Another event, or another season, starts empty.
    expect(loadDrafted(2026, 'AUBRQ1')).toEqual([]);
    expect(loadDrafted(2025, 'AUBRQ2')).toEqual([]);
  });

  it('ignores broken or malformed stored values', () => {
    expect(loadDrafted(2026, 'AUBRQ2')).toEqual([]);

    map.set('ftcdash.selection.v1.2026.AUBRQ2', 'not json');
    expect(loadDrafted(2026, 'AUBRQ2')).toEqual([]);

    map.set('ftcdash.selection.v1.2026.AUBRQ2', JSON.stringify({ teams: [1] }));
    expect(loadDrafted(2026, 'AUBRQ2')).toEqual([]);

    map.set('ftcdash.selection.v1.2026.AUBRQ2', JSON.stringify([14380, '26000', 1.5]));
    expect(loadDrafted(2026, 'AUBRQ2')).toEqual([14380]);
  });

  it('survives a browser that refuses to store anything', () => {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error('denied');
        },
        setItem: () => {
          throw new Error('denied');
        },
      },
    };

    expect(() => saveDrafted(2026, 'AUBRQ2', [14380])).not.toThrow();
    expect(loadDrafted(2026, 'AUBRQ2')).toEqual([]);
  });
});
