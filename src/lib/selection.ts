const KEY_PREFIX = 'ftcdash.selection.v1.';

/** Crossings are kept per event, so a reload mid-selection does not lose the board. */
function keyFor(season: number, code: string): string {
  return `${KEY_PREFIX}${season}.${code}`;
}

/** Teams already taken in this event's alliance selection, as remembered in this browser. */
export function loadDrafted(season: number, code: string): number[] {
  try {
    const raw = window.localStorage.getItem(keyFor(season, code));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is number => Number.isInteger(value));
  } catch {
    return [];
  }
}

export function saveDrafted(season: number, code: string, teams: readonly number[]): void {
  try {
    window.localStorage.setItem(keyFor(season, code), JSON.stringify(teams));
  } catch {
    // Crossing teams off is a convenience; ignore storage failures (private mode, quota).
  }
}
