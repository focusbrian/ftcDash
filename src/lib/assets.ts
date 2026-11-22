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
/** Where the repo-committed library lives, relative to the app's base path. */
export const SHARED_ASSETS_FILE = 'shared-assets.json';
/** Unsaved edits on the admin page, so a long upload session survives a reload. */
export const SHARED_DRAFT_KEY = 'ftcdash.sharedDraft.v1';

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const HTTP_URL = /^https?:\/\//i;
const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|svg|avif|bmp|ico)$/i;

/**
 * An image the browser can load: an image data URL, an http(s) URL, or a path relative to the site
 * (the PHP library stores files under `media/`). Anything else — `javascript:`, `data:text/html`, a
 * stray word — is refused, because manifests and backups are data and must not become code.
 */
export function isImageSource(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (/^data:/i.test(trimmed)) return /^data:image\//i.test(trimmed);
  if (HTTP_URL.test(trimmed)) return true;
  if (HAS_SCHEME.test(trimmed)) return false;
  // A relative path needs either a folder or a recognised image extension to count as one.
  return trimmed.includes('/') || IMAGE_EXTENSION.test(trimmed);
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

    if (isImageSource(entry.logo)) asset.logo = entry.logo;
    if (isImageSource(entry.robot)) asset.robot = entry.robot;

    if (isNonEmptyObject(entry.robots)) {
      const robots: Record<string, string> = {};
      for (const [season, image] of Object.entries(entry.robots)) {
        if (/^\d{4}$/.test(season) && isImageSource(image)) robots[season] = image;
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

/**
 * Layers one store over another, asset by asset: anything the visitor saved in this browser wins,
 * and the shipped library fills in the rest. A team can take its logo from one and its robot from
 * the other.
 */
export function overlayAssets(base: AssetStore, overrides: AssetStore): AssetStore {
  const merged: AssetStore = {};

  for (const key of new Set([...Object.keys(base), ...Object.keys(overrides)])) {
    const shared = base[key];
    const local = overrides[key];
    const asset: TeamAsset = {};

    const logo = local?.logo ?? shared?.logo;
    if (logo) asset.logo = logo;

    const robot = local?.robot ?? shared?.robot;
    if (robot) asset.robot = robot;

    const robots = { ...shared?.robots, ...local?.robots };
    if (Object.keys(robots).length > 0) asset.robots = robots;

    if (asset.logo || asset.robot || asset.robots) merged[key] = asset;
  }

  return merged;
}

/** Draft edits from the admin page, or null when it has never been used in this browser. */
export function loadSharedDraft(): AssetStore | null {
  try {
    const raw = window.localStorage.getItem(SHARED_DRAFT_KEY);
    return raw ? parseAssetStore(raw) : null;
  } catch {
    return null;
  }
}

export function saveSharedDraft(store: AssetStore): void {
  window.localStorage.setItem(SHARED_DRAFT_KEY, JSON.stringify(store));
}

export function clearSharedDraft(): void {
  window.localStorage.removeItem(SHARED_DRAFT_KEY);
}

/**
 * Runs every stored image through `shrink`, which returns a smaller replacement or null to keep the
 * original. Handing back the same store when nothing changed keeps callers from re-saving needlessly.
 */
export async function withShrunkImages(
  store: AssetStore,
  shrink: (dataUrl: string, kind: AssetKind) => Promise<string | null>,
): Promise<AssetStore> {
  let changed = false;

  const shrinkInto = async (
    asset: TeamAsset,
    key: 'logo' | 'robot',
  ): Promise<void> => {
    const original = asset[key];
    if (!original) return;
    const smaller = await shrink(original, key);
    if (!smaller) return;
    asset[key] = smaller;
    changed = true;
  };

  const entries = await Promise.all(
    Object.entries(store).map(async ([key, source]) => {
      const asset: TeamAsset = { ...source };
      await shrinkInto(asset, 'logo');
      await shrinkInto(asset, 'robot');
      if (asset.robots) {
        const robots: Record<string, string> = { ...asset.robots };
        for (const season of Object.keys(robots)) {
          const smaller = await shrink(robots[season]!, 'robot');
          if (smaller) {
            robots[season] = smaller;
            changed = true;
          }
        }
        asset.robots = robots;
      }
      return [key, asset] as const;
    }),
  );

  if (!changed) return store;
  const next: AssetStore = {};
  for (const [key, asset] of entries) next[key] = asset;
  return next;
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
