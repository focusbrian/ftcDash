import { useCallback, useState } from 'react';
import {
  AUTO_SCROLL_VIEWS,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
  type AutoScrollView,
} from '../lib/settings';

export interface SettingsState {
  settings: AppSettings;
  setRefreshSeconds: (seconds: number) => void;
  setFollowLatest: (enabled: boolean) => void;
  /** Adds or removes a list from the auto-scroll cycle, keeping tab order. */
  toggleAutoScrollView: (view: AutoScrollView, enabled: boolean) => void;
  setScrollSpeed: (speed: number) => void;
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

  const toggleAutoScrollView = useCallback((view: AutoScrollView, enabled: boolean) => {
    setSettings((current) => {
      const picked = new Set(current.autoScrollViews);
      if (enabled) picked.add(view);
      else picked.delete(view);
      const next = {
        ...current,
        autoScrollViews: AUTO_SCROLL_VIEWS.filter((candidate) => picked.has(candidate)),
      };
      saveSettings(next);
      return next;
    });
  }, []);

  const setScrollSpeed = useCallback((speed: number) => commit({ scrollSpeed: speed }), [commit]);

  return { settings, setRefreshSeconds, setFollowLatest, toggleAutoScrollView, setScrollSpeed };
}
