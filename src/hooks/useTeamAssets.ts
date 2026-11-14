import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ASSETS_CHANGED_EVENT,
  loadAssetStore,
  saveAssetStore,
  withAsset,
  withShrunkImages,
  withoutAsset,
  type AssetKind,
  type AssetStore,
} from '../lib/assets';
import { MAX_ASSET_SIZE, shrinkImageDataUrl } from '../lib/image';

export interface TeamAssetsState {
  assets: AssetStore;
  error: string | null;
  setAsset: (teamNumber: number, kind: AssetKind, dataUrl: string, season?: number) => void;
  removeAsset: (teamNumber: number, kind: AssetKind, season?: number) => void;
  /** Replaces the whole store (used by backup import). */
  replaceAll: (store: AssetStore) => void;
}

export function useTeamAssets(): TeamAssetsState {
  const [assets, setAssets] = useState<AssetStore>(() => loadAssetStore());
  const [error, setError] = useState<string | null>(null);
  const storeRef = useRef(assets);

  useEffect(() => {
    const sync = () => {
      const next = loadAssetStore();
      storeRef.current = next;
      setAssets(next);
    };
    window.addEventListener(ASSETS_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ASSETS_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const commit = useCallback((next: AssetStore) => {
    try {
      saveAssetStore(next);
      storeRef.current = next;
      setAssets(next);
      setError(null);
      window.dispatchEvent(new Event(ASSETS_CHANGED_EVENT));
    } catch {
      setError('Browser storage is full — remove a logo or photo and try again.');
    }
  }, []);

  // Images saved before the size limits existed (or restored from an older backup) are shrunk in
  // place once, so they take no more room than a fresh upload.
  useEffect(() => {
    let cancelled = false;
    withShrunkImages(assets, (dataUrl, kind) => shrinkImageDataUrl(dataUrl, MAX_ASSET_SIZE[kind]))
      .then((next) => {
        if (cancelled || next === assets) return;
        commit(next);
      })
      .catch(() => {
        // A decode failure just leaves that image at its stored size.
      });
    return () => {
      cancelled = true;
    };
  }, [assets, commit]);

  const setAsset = useCallback(
    (teamNumber: number, kind: AssetKind, dataUrl: string, season?: number) => {
      commit(withAsset(storeRef.current, teamNumber, kind, dataUrl, season));
    },
    [commit],
  );

  const removeAsset = useCallback(
    (teamNumber: number, kind: AssetKind, season?: number) => {
      commit(withoutAsset(storeRef.current, teamNumber, kind, season));
    },
    [commit],
  );

  const replaceAll = useCallback(
    (store: AssetStore) => {
      commit(store);
    },
    [commit],
  );

  return { assets, error, setAsset, removeAsset, replaceAll };
}
