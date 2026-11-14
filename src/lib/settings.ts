export interface AppSettings {
  /** Auto-refresh interval for the match list, in seconds. 0 disables it. */
  refreshSeconds: number;
  /** Keep the most recently played match open in the detail panel. */
  followLatest: boolean;
  /** Left-column lists hiding everything that does not involve a highlighted team. */
  hideUnhighlighted: boolean;
  /** Left-column lists in the auto-scroll cycle, in tab order. Empty means auto-scroll is off. */
  autoScrollViews: AutoScrollView[];
  /** Auto-scroll speed, in CSS pixels per second. */
  scrollSpeed: number;
}

/** The left-column lists that can take part in the auto-scroll cycle. */
export type AutoScrollView = 'matches' | 'ranking' | 'predict';

export const AUTO_SCROLL_VIEWS: AutoScrollView[] = ['matches', 'ranking', 'predict'];

export const AUTO_SCROLL_LABELS: Record<AutoScrollView, string> = {
  matches: 'Matches',
  ranking: 'Ranking',
  predict: 'Predict',
};

export const SETTINGS_STORAGE_KEY = 'ftcdash.settings.v1';

/** Choices offered in the refresh menu: off, then 10 s up to 2 min. */
export const REFRESH_OPTIONS = [0, 10, 15, 30, 60, 120] as const;

/** Auto-scroll speeds in px/s: a slow read, a comfortable one, and a fast one for a busy screen. */
export const SCROLL_SPEED_OPTIONS = [20, 40, 80] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  refreshSeconds: 30,
  followLatest: false,
  hideUnhighlighted: false,
  autoScrollViews: [],
  scrollSpeed: 40,
};

function isAutoScrollView(value: unknown): value is AutoScrollView {
  return typeof value === 'string' && (AUTO_SCROLL_VIEWS as string[]).includes(value);
}

/** Keeps only known views, drops duplicates, and restores tab order so the cycle always reads left to right. */
function parseAutoScrollViews(value: unknown): AutoScrollView[] {
  if (!Array.isArray(value)) return DEFAULT_SETTINGS.autoScrollViews;
  const picked = new Set(value.filter(isAutoScrollView));
  return AUTO_SCROLL_VIEWS.filter((view) => picked.has(view));
}

export function parseSettings(raw: string | null): AppSettings {
  if (!raw) return DEFAULT_SETTINGS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS;

  const record = parsed as Record<string, unknown>;
  const refreshSeconds =
    typeof record.refreshSeconds === 'number' &&
    REFRESH_OPTIONS.includes(record.refreshSeconds as (typeof REFRESH_OPTIONS)[number])
      ? record.refreshSeconds
      : DEFAULT_SETTINGS.refreshSeconds;

  const scrollSpeed =
    typeof record.scrollSpeed === 'number' &&
    SCROLL_SPEED_OPTIONS.includes(record.scrollSpeed as (typeof SCROLL_SPEED_OPTIONS)[number])
      ? record.scrollSpeed
      : DEFAULT_SETTINGS.scrollSpeed;

  return {
    refreshSeconds,
    followLatest:
      typeof record.followLatest === 'boolean' ? record.followLatest : DEFAULT_SETTINGS.followLatest,
    hideUnhighlighted:
      typeof record.hideUnhighlighted === 'boolean'
        ? record.hideUnhighlighted
        : DEFAULT_SETTINGS.hideUnhighlighted,
    autoScrollViews: parseAutoScrollViews(record.autoScrollViews),
    scrollSpeed,
  };
}

export function loadSettings(): AppSettings {
  try {
    return parseSettings(window.localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Settings are a convenience; ignore storage failures (private mode, quota).
  }
}

export function refreshLabel(seconds: number): string {
  if (seconds <= 0) return 'Off';
  if (seconds < 60) return `${seconds}s`;
  const minutes = seconds / 60;
  return Number.isInteger(minutes) ? `${minutes}m` : `${seconds}s`;
}

export function refreshDescription(seconds: number): string {
  if (seconds <= 0) return 'The match list only updates when you refresh it.';
  const unit = seconds < 60 ? `${seconds} seconds` : `${seconds / 60} minute${seconds === 60 ? '' : 's'}`;
  return `The match list refreshes every ${unit} while this tab is open.`;
}

export function scrollSpeedLabel(speed: number): string {
  const slowest = SCROLL_SPEED_OPTIONS[0];
  const fastest = SCROLL_SPEED_OPTIONS[SCROLL_SPEED_OPTIONS.length - 1] ?? slowest;
  if (speed <= slowest) return 'Slow';
  if (speed >= fastest) return 'Fast';
  return 'Medium';
}

export function autoScrollDescription(views: readonly AutoScrollView[], speed: number): string {
  if (views.length === 0) return 'Pick a list to scroll it automatically.';
  const names = views.map((view) => AUTO_SCROLL_LABELS[view].toLowerCase()).join(', then ');
  return `Scrolls ${names} at ${speed} px/s, then cycles back to the first.`;
}

/** The next list in the cycle after `current`, or the first one when `current` is not in it. */
export function nextAutoScrollView(
  views: readonly AutoScrollView[],
  current: AutoScrollView,
): AutoScrollView | null {
  if (views.length === 0) return null;
  const at = views.indexOf(current);
  return at === -1 ? views[0]! : views[(at + 1) % views.length]!;
}
