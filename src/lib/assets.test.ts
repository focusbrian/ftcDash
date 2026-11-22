import { describe, expect, it } from 'vitest';
import {
  overlayAssets,
  parseAssetStore,
  robotForSeason,
  robotSeasons,
  teamsWithAssets,
  withAsset,
  withShrunkImages,
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

    expect(parseAssetStore(raw)).toEqual({
      23502: { logo: LOGO, robot: ROBOT },
      12: { logo: 'https://example.com/logo.png' },
    });
  });

  it('accepts the relative paths the PHP library writes', () => {
    const raw = JSON.stringify({
      10136: { logo: 'media/10136-logo-ab12cd34.png', robots: { 2026: 'media/10136-robot-2026-ef56.png' } },
    });

    expect(parseAssetStore(raw)).toEqual({
      10136: {
        logo: 'media/10136-logo-ab12cd34.png',
        robots: { 2026: 'media/10136-robot-2026-ef56.png' },
      },
    });
  });

  it('still refuses a source that is not an image', () => {
    const raw = JSON.stringify({
      1: { logo: 'javascript:alert(1)' },
      2: { logo: 'data:text/html;base64,PHNjcmlwdD4=' },
      3: { logo: 'mailto:team@example.com' },
      4: { logo: 'media/ok.png' },
    });

    expect(parseAssetStore(raw)).toEqual({ 4: { logo: 'media/ok.png' } });
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

describe('overlayAssets', () => {
  it('returns the baseline when the browser has nothing saved', () => {
    const shared: AssetStore = { 10136: { logo: LOGO, robots: { 2026: ROBOT } } };
    expect(overlayAssets(shared, {})).toEqual(shared);
  });

  it('lets the browser copy win, asset by asset', () => {
    const shared: AssetStore = { 10136: { logo: LOGO, robots: { 2026: ROBOT } } };
    const local: AssetStore = { 10136: { logo: 'data:image/png;base64,LOCAL' } };

    expect(overlayAssets(shared, local)['10136']).toEqual({
      logo: 'data:image/png;base64,LOCAL',
      robots: { 2026: ROBOT },
    });
  });

  it('mixes a season of robot photos from both sides', () => {
    const shared: AssetStore = { 10136: { robots: { 2025: ROBOT_2025 } } };
    const local: AssetStore = { 10136: { robots: { 2026: ROBOT } } };

    expect(overlayAssets(shared, local)['10136']?.robots).toEqual({ 2025: ROBOT_2025, 2026: ROBOT });
  });

  it('adds teams that only one side knows about', () => {
    const merged = overlayAssets({ 1: { logo: LOGO } }, { 2: { logo: LOGO } });
    expect(teamsWithAssets(merged)).toEqual([1, 2]);
  });
});

describe('withShrunkImages', () => {
  it('replaces oversized images and leaves the rest alone', async () => {
    const store: AssetStore = {
      10136: { logo: LOGO, robots: { 2026: ROBOT, 2025: ROBOT_2025 } },
      23502: { logo: 'data:image/png;base64,SMALL' },
    };

    const next = await withShrunkImages(store, async (dataUrl, kind) =>
      kind === 'logo' && dataUrl === LOGO ? 'data:image/png;base64,TINY' : null,
    );

    expect(next['10136']?.logo).toBe('data:image/png;base64,TINY');
    expect(next['10136']?.robots).toEqual({ 2026: ROBOT, 2025: ROBOT_2025 });
    expect(next['23502']).toEqual({ logo: 'data:image/png;base64,SMALL' });
    // The original is not mutated, so a failed save cannot corrupt what is on screen.
    expect(store['10136']?.logo).toBe(LOGO);
  });

  it('shrinks every season of a robot image and reports the kind', async () => {
    const kinds: string[] = [];
    const store: AssetStore = { 10136: { robot: ROBOT, robots: { 2026: ROBOT, 2025: ROBOT_2025 } } };

    const next = await withShrunkImages(store, async (dataUrl, kind) => {
      kinds.push(kind);
      return `${dataUrl}-small`;
    });

    expect(next['10136']?.robot).toBe(`${ROBOT}-small`);
    expect(next['10136']?.robots).toEqual({
      2026: `${ROBOT}-small`,
      2025: `${ROBOT_2025}-small`,
    });
    expect(kinds).toEqual(['robot', 'robot', 'robot']);
  });

  it('hands back the same store when nothing needed shrinking', async () => {
    const store: AssetStore = { 10136: { logo: LOGO } };
    await expect(withShrunkImages(store, async () => null)).resolves.toBe(store);
  });
});
