import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ASSETS_CHANGED_EVENT,
  loadAssetStore,
  saveAssetStore,
  withAsset,
  withoutAsset,
  type AssetKind,
  type AssetStore,
} from '../lib/assets';

export interface TeamAssetsState {
  assets: AssetStore;
  error: string | null;
  setAsset: (teamNumber: number, kind: AssetKind, dataUrl: string) => void;
  removeAsset: (teamNumber: number, kind: AssetKind) => void;
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

  const setAsset = useCallback(
    (teamNumber: number, kind: AssetKind, dataUrl: string) => {
      commit(withAsset(storeRef.current, teamNumber, kind, dataUrl));
    },
    [commit],
  );

  const removeAsset = useCallback(
    (teamNumber: number, kind: AssetKind) => {
      commit(withoutAsset(storeRef.current, teamNumber, kind));
    },
    [commit],
  );

  return { assets, error, setAsset, removeAsset };
}
