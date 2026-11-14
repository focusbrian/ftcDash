export type AssetKind = 'logo' | 'robot';

export interface TeamAsset {
  /** Image data URL (PNG or JPEG). */
  logo?: string;
  /** Image data URL (PNG or JPEG). */
  robot?: string;
}

export type AssetStore = Record<string, TeamAsset>;

export const ASSET_STORAGE_KEY = 'ftcdash.teamAssets.v1';
export const ASSETS_CHANGED_EVENT = 'ftcdash:assets-changed';

function isDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/');
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
    if (asset.logo || asset.robot) store[key] = asset;
  }
  return store;
}

export function withAsset(
  store: AssetStore,
  teamNumber: number,
  kind: AssetKind,
  dataUrl: string,
): AssetStore {
  const key = String(teamNumber);
  return { ...store, [key]: { ...store[key], [kind]: dataUrl } };
}

export function withoutAsset(store: AssetStore, teamNumber: number, kind: AssetKind): AssetStore {
  const key = String(teamNumber);
  const existing = store[key];
  if (!existing) return store;

  const asset: TeamAsset = { ...existing };
  delete asset[kind];

  const next = { ...store };
  if (asset.logo || asset.robot) {
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
