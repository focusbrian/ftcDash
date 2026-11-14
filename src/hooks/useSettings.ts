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
}

export function useSettings(): SettingsState {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const setRefreshSeconds = useCallback((seconds: number) => {
    setSettings((current) => {
      if (current.refreshSeconds === seconds) return current;
      const next = { ...DEFAULT_SETTINGS, ...current, refreshSeconds: seconds };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, setRefreshSeconds };
}
