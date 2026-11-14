export type AssetKind = 'logo' | 'robot';

export interface TeamAsset {
  /** Image data URL (PNG or JPEG). */
  logo?: string;
  /** Season-less robot image, kept for older backups; used when no season-specific image exists. */
  robot?: string;
  /** Robot image per FTC season, keyed by the season number as a string. */
  robots?: Record<string, string>;
}

export type AssetStore = Record<string, TeamAsset>;

export const ASSET_STORAGE_KEY = 'ftcdash.teamAssets.v1';
export const ASSETS_CHANGED_EVENT = 'ftcdash:assets-changed';

function isDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function isNonEmptyObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function parseAssetStore(raw: string | null): AssetStore {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object') return {};

  const store: AssetStore = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^\d+$/.test(key) || !value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    const asset: TeamAsset = {};

    if (isDataUrl(entry.logo)) asset.logo = entry.logo;
    if (isDataUrl(entry.robot)) asset.robot = entry.robot;

    if (isNonEmptyObject(entry.robots)) {
      const robots: Record<string, string> = {};
      for (const [season, image] of Object.entries(entry.robots)) {
        if (/^\d{4}$/.test(season) && isDataUrl(image)) robots[season] = image;
      }
      if (Object.keys(robots).length > 0) asset.robots = robots;
    }

    if (asset.logo || asset.robot || asset.robots) store[key] = asset;
  }
  return store;
}

/** The robot image for a season, falling back to a legacy season-less image. */
export function robotForSeason(asset: TeamAsset | undefined, season: number): string | undefined {
  if (!asset) return undefined;
  return asset.robots?.[String(season)] ?? asset.robot;
}

export function withAsset(
  store: AssetStore,
  teamNumber: number,
  kind: AssetKind,
  dataUrl: string,
  season?: number,
): AssetStore {
  const key = String(teamNumber);
  const existing = store[key];

  if (kind === 'logo') {
    return { ...store, [key]: { ...existing, logo: dataUrl } };
  }
  if (season === undefined) {
    return { ...store, [key]: { ...existing, robot: dataUrl } };
  }

  return {
    ...store,
    [key]: { ...existing, robots: { ...existing?.robots, [String(season)]: dataUrl } },
  };
}

/**
 * Removes an asset. Robot images are removed for one season, or — when no season is given —
 * the legacy season-less image.
 */
export function withoutAsset(
  store: AssetStore,
  teamNumber: number,
  kind: AssetKind,
  season?: number,
): AssetStore {
  const key = String(teamNumber);
  const existing = store[key];
  if (!existing) return store;

  const asset: TeamAsset = { ...existing };

  if (kind === 'logo') {
    delete asset.logo;
  } else if (season === undefined) {
    delete asset.robot;
  } else {
    const robots = { ...asset.robots };
    delete robots[String(season)];
    if (Object.keys(robots).length > 0) {
      asset.robots = robots;
    } else {
      delete asset.robots;
    }
  }

  const next = { ...store };
  if (asset.logo || asset.robot || asset.robots) {
    next[key] = asset;
  } else {
    delete next[key];
  }
  return next;
}

export function teamsWithAssets(store: AssetStore): number[] {
  return Object.keys(store)
    .map(Number)
    .filter((teamNumber) => Number.isInteger(teamNumber))
    .sort((a, b) => a - b);
}

/** Seasons that have a robot image saved for this team, newest first. */
export function robotSeasons(asset: TeamAsset | undefined): number[] {
  if (!asset?.robots) return [];
  return Object.keys(asset.robots)
    .map(Number)
    .filter((season) => Number.isInteger(season))
    .sort((a, b) => b - a);
}

export function loadAssetStore(): AssetStore {
  try {
    return parseAssetStore(window.localStorage.getItem(ASSET_STORAGE_KEY));
  } catch {
    return {};
  }
}

/** Throws when the browser refuses the write (usually a quota error). */
export function saveAssetStore(store: AssetStore): void {
  window.localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(store));
}
