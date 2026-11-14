export interface AppSettings {
  /** Auto-refresh interval for the match list, in seconds. 0 disables it. */
  refreshSeconds: number;
}

export const SETTINGS_STORAGE_KEY = 'ftcdash.settings.v1';

/** Choices offered in the refresh menu: off, then 10 s up to 2 min. */
export const REFRESH_OPTIONS = [0, 10, 15, 30, 60, 120] as const;

export const DEFAULT_SETTINGS: AppSettings = { refreshSeconds: 30 };

export function parseSettings(raw: string | null): AppSettings {
  if (!raw) return DEFAULT_SETTINGS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS;

  const value = (parsed as Record<string, unknown>).refreshSeconds;
  const refreshSeconds =
    typeof value === 'number' && REFRESH_OPTIONS.includes(value as (typeof REFRESH_OPTIONS)[number])
      ? value
      : DEFAULT_SETTINGS.refreshSeconds;

  return { refreshSeconds };
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
