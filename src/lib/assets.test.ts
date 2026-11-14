import { describe, expect, it } from 'vitest';
import {
  parseAssetStore,
  robotForSeason,
  robotSeasons,
  teamsWithAssets,
  withAsset,
  withoutAsset,
  type AssetStore,
} from './assets';

const LOGO = 'data:image/png;base64,AAAA';
const ROBOT = 'data:image/png;base64,BBBB';
const ROBOT_2025 = 'data:image/png;base64,CCCC';

describe('parseAssetStore', () => {
  it('returns an empty store for missing or broken data', () => {
    expect(parseAssetStore(null)).toEqual({});
    expect(parseAssetStore('not json')).toEqual({});
    expect(parseAssetStore('[]')).toEqual({});
  });

  it('keeps valid image entries and drops everything else', () => {
    const raw = JSON.stringify({
      23502: { logo: LOGO, robot: ROBOT },
      12: { logo: 'https://example.com/logo.png' },
      abc: { logo: LOGO },
      7: {},
    });

    expect(parseAssetStore(raw)).toEqual({ 23502: { logo: LOGO, robot: ROBOT } });
  });

  it('keeps per-season robot images and ignores malformed keys', () => {
    const raw = JSON.stringify({
      10136: { robots: { 2026: ROBOT, 2025: ROBOT_2025, abc: ROBOT, 2024: 'nope' } },
    });

    expect(parseAssetStore(raw)).toEqual({ 10136: { robots: { 2026: ROBOT, 2025: ROBOT_2025 } } });
  });
});

describe('robot images by season', () => {
  it('picks the image saved for the requested season', () => {
    const asset = { robots: { 2026: ROBOT, 2025: ROBOT_2025 } };
    expect(robotForSeason(asset, 2025)).toBe(ROBOT_2025);
    expect(robotForSeason(asset, 2026)).toBe(ROBOT);
  });

  it('falls back to a legacy season-less image', () => {
    expect(robotForSeason({ robot: ROBOT, robots: { 2025: ROBOT_2025 } }, 2024)).toBe(ROBOT);
    expect(robotForSeason({ robot: ROBOT }, 2026)).toBe(ROBOT);
    expect(robotForSeason(undefined, 2026)).toBeUndefined();
  });

  it('lists saved seasons newest first', () => {
    expect(robotSeasons({ robots: { 2024: ROBOT, 2026: ROBOT, 2025: ROBOT } })).toEqual([
      2026, 2025, 2024,
    ]);
    expect(robotSeasons({ robot: ROBOT })).toEqual([]);
  });
});

describe('asset store updates', () => {
  it('adds and replaces a logo without mutating the original', () => {
    const original: AssetStore = {};
    const withLogo = withAsset(original, 23502, 'logo', LOGO);

    expect(original).toEqual({});
    expect(withLogo['23502']).toEqual({ logo: LOGO });
  });

  it('stores robot images per season', () => {
    const store2026 = withAsset({}, 10136, 'robot', ROBOT, 2026);
    const bothSeasons = withAsset(store2026, 10136, 'robot', ROBOT_2025, 2025);

    expect(store2026['10136']).toEqual({ robots: { 2026: ROBOT } });
    expect(bothSeasons['10136']).toEqual({ robots: { 2026: ROBOT, 2025: ROBOT_2025 } });
  });

  it('removes a single season before dropping the team', () => {
    const both = withAsset(
      withAsset({}, 10136, 'robot', ROBOT, 2026),
      10136,
      'robot',
      ROBOT_2025,
      2025,
    );

    expect(withoutAsset(both, 10136, 'robot', 2025)['10136']).toEqual({ robots: { 2026: ROBOT } });
    expect(withoutAsset(withoutAsset(both, 10136, 'robot', 2025), 10136, 'robot', 2026)).toEqual({});
  });

  it('removes the legacy image separately from season images', () => {
    const store = withAsset(withAsset({}, 10136, 'robot', ROBOT), 10136, 'robot', ROBOT_2025, 2025);

    expect(withoutAsset(store, 10136, 'robot')['10136']).toEqual({ robots: { 2025: ROBOT_2025 } });
  });

  it('lists teams that have assets in numeric order', () => {
    const store = withAsset(withAsset({}, 34235, 'logo', LOGO), 1234, 'robot', ROBOT, 2026);
    expect(teamsWithAssets(store)).toEqual([1234, 34235]);
  });
});
