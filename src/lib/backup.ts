import { parseAssetStore, type AssetStore, type TeamAsset } from './assets';

export const BACKUP_APP = 'ftcdash';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  teams: AssetStore;
}

export interface MergeResult {
  store: AssetStore;
  /** Assets that only existed in the backup. */
  addedAssets: number;
  /** Assets already present here, which merge keeps as-is. */
  keptAssets: number;
  /** Teams that had no assets before the merge. */
  addedTeams: number;
}

export function countAssets(store: AssetStore): number {
  return Object.values(store).reduce(
    (total, assets) =>
      total +
      (assets.logo ? 1 : 0) +
      (assets.robot ? 1 : 0) +
      Object.keys(assets.robots ?? {}).length,
    0,
  );
}

export function createBackup(store: AssetStore, now = new Date()): BackupFile {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    teams: store,
  };
}

export function serializeBackup(store: AssetStore, now = new Date()): string {
  return JSON.stringify(createBackup(store, now), null, 2);
}

export function backupFileName(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `ftcdash-assets-${now.getFullYear()}-${month}-${day}.json`;
}

/**
 * Reads a backup file. Accepts this app's envelope or a bare `{ "23502": { logo, robot } }`
 * map, and rejects files that contain no usable images.
 */
export function parseBackup(raw: string): AssetStore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('That file is not an FTCDash assets backup.');
  }

  const record = parsed as Record<string, unknown>;
  const candidate = 'teams' in record ? record.teams : parsed;
  const store = parseAssetStore(JSON.stringify(candidate ?? {}));

  if (Object.keys(store).length === 0) {
    throw new Error('That backup contains no team logos or robot photos.');
  }
  return store;
}

/** Combines a backup with the current store, keeping whatever is already saved on conflicts. */
export function mergeAssetStores(current: AssetStore, incoming: AssetStore): MergeResult {
  const store: AssetStore = { ...current };
  let addedAssets = 0;
  let keptAssets = 0;
  let addedTeams = 0;

  for (const [team, incomingAssets] of Object.entries(incoming)) {
    const existing = store[team];
    const merged: TeamAsset = { ...existing };

    if (incomingAssets.logo) {
      if (merged.logo) {
        keptAssets += 1;
      } else {
        merged.logo = incomingAssets.logo;
        addedAssets += 1;
      }
    }

    if (incomingAssets.robot) {
      if (merged.robot) {
        keptAssets += 1;
      } else {
        merged.robot = incomingAssets.robot;
        addedAssets += 1;
      }
    }

    const robots = { ...existing?.robots };
    for (const [season, image] of Object.entries(incomingAssets.robots ?? {})) {
      if (robots[season]) {
        keptAssets += 1;
      } else {
        robots[season] = image;
        addedAssets += 1;
      }
    }
    if (Object.keys(robots).length > 0) merged.robots = robots;

    if (merged.logo || merged.robot || merged.robots) {
      if (!existing) addedTeams += 1;
      store[team] = merged;
    }
  }

  return { store, addedAssets, keptAssets, addedTeams };
}

/** Triggers a browser download of the current assets as JSON. */
export function downloadBackup(store: AssetStore, now = new Date()): void {
  const blob = new Blob([serializeBackup(store, now)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = backupFileName(now);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
