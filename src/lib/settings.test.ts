import { describe, expect, it } from 'vitest';
import {
  AUTO_SCROLL_LABELS,
  AUTO_SCROLL_VIEWS,
  DEFAULT_SETTINGS,
  REFRESH_OPTIONS,
  SCROLL_SPEED_OPTIONS,
  autoScrollDescription,
  nextAutoScrollView,
  parseSettings,
  refreshDescription,
  refreshLabel,
  scrollSpeedLabel,
} from './settings';

describe('parseSettings', () => {
  it('falls back to defaults for missing or broken data', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[]')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{}')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps a supported refresh interval, including off', () => {
    expect(parseSettings(JSON.stringify({ refreshSeconds: 0 }))).toMatchObject({
      refreshSeconds: 0,
      followLatest: false,
    });
    expect(parseSettings(JSON.stringify({ refreshSeconds: 60 }))).toMatchObject({
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
    expect(parseSettings(JSON.stringify({ refreshSeconds: 30, followLatest: true }))).toMatchObject({
      refreshSeconds: 30,
      followLatest: true,
    });
    expect(parseSettings(JSON.stringify({ followLatest: 'yes' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps known auto-scroll views in tab order and drops anything else', () => {
    expect(
      parseSettings(JSON.stringify({ autoScrollViews: ['predict', 'matches', 'bogus', 'matches'] }))
        .autoScrollViews,
    ).toEqual(['matches', 'predict']);
    expect(parseSettings(JSON.stringify({ autoScrollViews: 'matches' })).autoScrollViews).toEqual([]);
  });

  it('keeps an offered scroll speed and rejects the rest', () => {
    expect(parseSettings(JSON.stringify({ scrollSpeed: 80 })).scrollSpeed).toBe(80);
    expect(parseSettings(JSON.stringify({ scrollSpeed: 45 }))).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ scrollSpeed: '80' }))).toEqual(DEFAULT_SETTINGS);
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

describe('auto-scroll settings', () => {
  it('labels each speed and names every view', () => {
    expect(SCROLL_SPEED_OPTIONS.map(scrollSpeedLabel)).toEqual(['Slow', 'Medium', 'Fast']);
    expect(AUTO_SCROLL_VIEWS.map((view) => AUTO_SCROLL_LABELS[view])).toEqual([
      'Matches',
      'Ranking',
      'Predict',
    ]);
  });

  it('describes what will scroll', () => {
    expect(autoScrollDescription([], 40)).toMatch(/Pick a list/);
    expect(autoScrollDescription(['matches'], 40)).toContain('matches at 40 px/s');
    expect(autoScrollDescription(['matches', 'ranking'], 20)).toContain('matches, then ranking');
  });

  it('cycles in order and wraps, starting at the first view from outside the cycle', () => {
    const views = ['matches', 'ranking', 'predict'] as const;
    expect(nextAutoScrollView(views, 'matches')).toBe('ranking');
    expect(nextAutoScrollView(views, 'ranking')).toBe('predict');
    expect(nextAutoScrollView(views, 'predict')).toBe('matches');
    expect(nextAutoScrollView(['ranking'], 'matches')).toBe('ranking');
    expect(nextAutoScrollView([], 'matches')).toBeNull();
  });
});
