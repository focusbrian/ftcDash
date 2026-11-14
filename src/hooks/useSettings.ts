import { useCallback, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from '../lib/settings';

export interface SettingsState {
  settings: AppSettings;
  setRefreshSeconds: (seconds: number) => void;
  setFollowLatest: (enabled: boolean) => void;
}

export function useSettings(): SettingsState {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const commit = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => {
      const next = { ...DEFAULT_SETTINGS, ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const setRefreshSeconds = useCallback(
    (seconds: number) => commit({ refreshSeconds: seconds }),
    [commit],
  );

  const setFollowLatest = useCallback(
    (enabled: boolean) => commit({ followLatest: enabled }),
    [commit],
  );

  return { settings, setRefreshSeconds, setFollowLatest };
}
