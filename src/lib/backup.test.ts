import { describe, expect, it } from 'vitest';
import {
  backupFileName,
  countAssets,
  createBackup,
  mergeAssetStores,
  parseBackup,
  serializeBackup,
} from './backup';
import type { AssetStore } from './assets';

const LOGO = 'data:image/png;base64,AAAA';
const ROBOT = 'data:image/png;base64,BBBB';

const store: AssetStore = {
  '23502': { logo: LOGO, robot: ROBOT },
  '10136': { robot: ROBOT },
};

describe('backup file', () => {
  it('round-trips through serialize and parse', () => {
    const now = new Date('2026-11-13T12:00:00Z');
    const text = serializeBackup(store, now);

    expect(JSON.parse(text)).toMatchObject({
      app: 'ftcdash',
      version: 1,
      exportedAt: '2026-11-13T12:00:00.000Z',
    });
    expect(parseBackup(text)).toEqual(store);
  });

  it('names the file with the local export date', () => {
    expect(backupFileName(new Date(2026, 10, 13, 20, 30))).toBe('ftcdash-assets-2026-11-13.json');
    expect(backupFileName(new Date(2026, 0, 5, 0, 5))).toBe('ftcdash-assets-2026-01-05.json');
  });

  it('accepts a bare team map', () => {
    expect(parseBackup(JSON.stringify({ 5: { logo: LOGO } }))).toEqual({ 5: { logo: LOGO } });
  });

  it('rejects files with nothing usable', () => {
    expect(() => parseBackup('not json')).toThrow(/not valid JSON/);
    expect(() => parseBackup('[1, 2]')).toThrow(/not an FTCDash assets backup/);
    expect(() => parseBackup(JSON.stringify({ teams: { abc: { logo: LOGO } } }))).toThrow(
      /no team logos/,
    );
    expect(() => parseBackup(JSON.stringify({ teams: {} }))).toThrow(/no team logos/);
  });

  it('counts every stored image', () => {
    expect(countAssets(store)).toBe(3);
    expect(countAssets({})).toBe(0);
  });

  it('describes an exported backup', () => {
    expect(createBackup(store, new Date('2026-11-13T12:00:00Z')).teams).toBe(store);
  });
});

describe('mergeAssetStores', () => {
  it('adds new teams and assets from the backup', () => {
    const result = mergeAssetStores({ '1': { logo: LOGO } }, { '2': { logo: LOGO, robot: ROBOT } });

    expect(result.store).toEqual({ '1': { logo: LOGO }, '2': { logo: LOGO, robot: ROBOT } });
    expect(result.addedAssets).toBe(2);
    expect(result.addedTeams).toBe(1);
    expect(result.keptAssets).toBe(0);
  });

  it('keeps existing assets when the backup has the same kind', () => {
    const existing = 'data:image/png;base64,LOCAL';
    const result = mergeAssetStores(
      { '1': { logo: existing } },
      { '1': { logo: LOGO, robot: ROBOT } },
    );

    expect(result.store['1']).toEqual({ logo: existing, robot: ROBOT });
    expect(result.keptAssets).toBe(1);
    expect(result.addedAssets).toBe(1);
    expect(result.addedTeams).toBe(0);
  });

  it('does not mutate the current store', () => {
    const current: AssetStore = { '1': { logo: LOGO } };
    mergeAssetStores(current, { '2': { robot: ROBOT } });
    expect(current).toEqual({ '1': { logo: LOGO } });
  });
});
