import { describe, expect, it } from 'vitest';
import {
  parseAssetStore,
  teamsWithAssets,
  withAsset,
  withoutAsset,
  type AssetStore,
} from './assets';

const LOGO = 'data:image/png;base64,AAAA';
const ROBOT = 'data:image/png;base64,BBBB';

describe('parseAssetStore', () => {
  it('returns an empty store for missing or broken data', () => {
    expect(parseAssetStore(null)).toEqual({});
    expect(parseAssetStore('not json')).toEqual({});
    expect(parseAssetStore('[]')).toEqual({});
  });

  it('keeps valid PNG entries and drops everything else', () => {
    const raw = JSON.stringify({
      23502: { logo: LOGO, robot: ROBOT },
      12: { logo: 'https://example.com/logo.png' },
      abc: { logo: LOGO },
      7: {},
    });

    expect(parseAssetStore(raw)).toEqual({ 23502: { logo: LOGO, robot: ROBOT } });
  });
});

describe('asset store updates', () => {
  it('adds and replaces assets without mutating the original', () => {
    const original: AssetStore = {};
    const withLogo = withAsset(original, 23502, 'logo', LOGO);
    const withBoth = withAsset(withLogo, 23502, 'robot', ROBOT);

    expect(original).toEqual({});
    expect(withBoth['23502']).toEqual({ logo: LOGO, robot: ROBOT });
  });

  it('drops the team entirely when its last asset is removed', () => {
    const store = withAsset(withAsset({}, 100, 'logo', LOGO), 100, 'robot', ROBOT);

    const withoutLogo = withoutAsset(store, 100, 'logo');
    expect(withoutLogo['100']).toEqual({ robot: ROBOT });

    expect(withoutAsset(withoutLogo, 100, 'robot')).toEqual({});
  });

  it('lists teams that have assets in numeric order', () => {
    const store = withAsset(withAsset({}, 34235, 'logo', LOGO), 1234, 'robot', ROBOT);
    expect(teamsWithAssets(store)).toEqual([1234, 34235]);
  });
});
