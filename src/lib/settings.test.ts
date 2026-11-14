import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  REFRESH_OPTIONS,
  parseSettings,
  refreshDescription,
  refreshLabel,
} from './settings';

describe('parseSettings', () => {
  it('falls back to defaults for missing or broken data', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[]')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{}')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps a supported refresh interval, including off', () => {
    expect(parseSettings(JSON.stringify({ refreshSeconds: 0 }))).toEqual({
      refreshSeconds: 0,
      followLatest: false,
    });
    expect(parseSettings(JSON.stringify({ refreshSeconds: 60 }))).toEqual({
      refreshSeconds: 60,
      followLatest: false,
    });
  });

  it('rejects values outside the offered options', () => {
    expect(parseSettings(JSON.stringify({ refreshSeconds: 7 }))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ refreshSeconds: -30 }))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ refreshSeconds: '30' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('reads the follow-latest flag', () => {
    expect(parseSettings(JSON.stringify({ refreshSeconds: 30, followLatest: true }))).toEqual({
      refreshSeconds: 30,
      followLatest: true,
    });
    expect(parseSettings(JSON.stringify({ followLatest: 'yes' }))).toEqual(DEFAULT_SETTINGS);
  });
});

describe('refresh labels', () => {
  it('describes every option', () => {
    expect(REFRESH_OPTIONS.map(refreshLabel)).toEqual(['Off', '10s', '15s', '30s', '1m', '2m']);
  });

  it('explains the behaviour', () => {
    expect(refreshDescription(0)).toMatch(/only updates when you refresh/);
    expect(refreshDescription(30)).toBe('The match list refreshes every 30 seconds while this tab is open.');
    expect(refreshDescription(60)).toMatch(/every 1 minute/);
    expect(refreshDescription(120)).toMatch(/every 2 minutes/);
  });
});
