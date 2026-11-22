import { useEffect, useState } from 'react';
import { SHARED_ASSETS_FILE, type AssetStore } from '../lib/assets';
import { parseBackup } from '../lib/backup';

export interface SharedAssetsState {
  assets: AssetStore;
  status: 'loading' | 'ready' | 'empty';
}

const EMPTY: AssetStore = {};
const LOADING: SharedAssetsState = { assets: EMPTY, status: 'loading' };
const FAILED: SharedAssetsState = { assets: EMPTY, status: 'empty' };

/** One fetch per page load, shared by every caller. */
let pending: Promise<AssetStore> | null = null;

async function fetchSharedAssets(): Promise<AssetStore> {
  const url = `${import.meta.env.BASE_URL}${SHARED_ASSETS_FILE}`;
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) return EMPTY;
  // The file is written in the same envelope as a backup, so the reader accepts both shapes.
  return parseBackup(await response.text());
}

/**
 * The logos and robot photos committed with the site. They are the default everywhere; anything the
 * visitor uploads in this browser takes precedence.
 */
export function useSharedAssets(): SharedAssetsState {
  const [state, setState] = useState<SharedAssetsState>(LOADING);

  useEffect(() => {
    let cancelled = false;
    pending ??= fetchSharedAssets().catch(() => EMPTY);

    pending.then((assets) => {
      if (cancelled) return;
      setState(Object.keys(assets).length > 0 ? { assets, status: 'ready' } : FAILED);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
