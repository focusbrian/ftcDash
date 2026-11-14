import { useEffect, useId, useRef, useState } from 'react';
import {
  AUTO_SCROLL_LABELS,
  AUTO_SCROLL_VIEWS,
  REFRESH_OPTIONS,
  SCROLL_SPEED_OPTIONS,
  autoScrollDescription,
  refreshDescription,
  refreshLabel,
  scrollSpeedLabel,
  type AppSettings,
  type AutoScrollView,
} from '../lib/settings';

interface Props {
  settings: AppSettings;
  lastUpdated: Date | null;
  disabled: boolean;
  /** True when at least one team is highlighted, so the filter has something to keep. */
  hasHighlights: boolean;
  onSelectRefresh: (seconds: number) => void;
  onRefresh: () => void;
  onFollowLatestChange: (enabled: boolean) => void;
  onHideUnhighlightedChange: (enabled: boolean) => void;
  onAutoScrollViewChange: (view: AutoScrollView, enabled: boolean) => void;
  onScrollSpeedChange: (speed: number) => void;
  onOpenAssets: () => void;
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm9 3.5c0 .5-.04.98-.11 1.44l2 1.55-1.9 3.3-2.36-.95c-.72.62-1.55 1.11-2.46 1.44L15.9 22h-3.8l-.27-2.72a7.4 7.4 0 0 1-2.46-1.44l-2.36.95-1.9-3.3 2-1.55a8.2 8.2 0 0 1 0-2.88l-2-1.55 1.9-3.3 2.36.95c.72-.62 1.55-1.11 2.46-1.44L12.1 2h3.8l.27 2.72c.91.33 1.74.82 2.46 1.44l2.36-.95 1.9 3.3-2 1.55c.07.46.11.94.11 1.44Z"
      />
    </svg>
  );
}

function formatClock(date: Date | null): string {
  if (!date) return 'not yet';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

/** The gear behind the header: refresh, follow-latest, auto-scroll and the way to team assets. */
export function SettingsMenu({
  settings,
  lastUpdated,
  disabled,
  hasHighlights,
  onSelectRefresh,
  onRefresh,
  onFollowLatestChange,
  onHideUnhighlightedChange,
  onAutoScrollViewChange,
  onScrollSpeedChange,
  onOpenAssets,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const followId = useId();
  const hideId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="settings-wrap" ref={wrapRef}>
      <button
        type="button"
        className="iconbutton"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        title="Settings"
        onClick={() => setOpen((current) => !current)}
      >
        <GearIcon />
      </button>

      {open ? (
        <div className="settings" id={panelId} role="dialog" aria-label="Settings">
          <p className="settings__title">Match list refresh</p>
          <div className="settings__options">
            {REFRESH_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={
                  option === settings.refreshSeconds
                    ? 'settings__option settings__option--active'
                    : 'settings__option'
                }
                aria-pressed={option === settings.refreshSeconds}
                onClick={() => onSelectRefresh(option)}
              >
                {refreshLabel(option)}
              </button>
            ))}
          </div>
          <p className="settings__hint">
            {refreshDescription(settings.refreshSeconds)} Last update {formatClock(lastUpdated)}.
          </p>
          <button
            type="button"
            className="button button--small"
            disabled={disabled}
            onClick={() => {
              onRefresh();
              setOpen(false);
            }}
          >
            Refresh now
          </button>

          <div className="settings__section">
            <label className="switch" htmlFor={followId}>
              <span className={settings.followLatest ? 'switch__text switch__text--on' : 'switch__text'}>
                Follow latest result
              </span>
              <span className="switch__control">
                <input
                  id={followId}
                  type="checkbox"
                  role="switch"
                  checked={settings.followLatest}
                  onChange={(event) => onFollowLatestChange(event.target.checked)}
                />
                <span className="switch__track" aria-hidden="true">
                  <span className="switch__thumb" />
                </span>
              </span>
            </label>
            <p className="settings__hint">Opens the most recently played match as results arrive.</p>
          </div>

          <div className="settings__section">
            <label className="switch" htmlFor={hideId}>
              <span
                className={
                  settings.hideUnhighlighted ? 'switch__text switch__text--on' : 'switch__text'
                }
              >
                Only highlighted teams
              </span>
              <span className="switch__control">
                <input
                  id={hideId}
                  type="checkbox"
                  role="switch"
                  checked={settings.hideUnhighlighted}
                  onChange={(event) => onHideUnhighlightedChange(event.target.checked)}
                />
                <span className="switch__track" aria-hidden="true">
                  <span className="switch__thumb" />
                </span>
              </span>
            </label>
            <p className="settings__hint">
              {hasHighlights
                ? 'Hides matches, ranking rows and predictions that do not involve a highlighted team.'
                : 'Hides everything except the teams you highlight in the search box.'}
            </p>
          </div>

          <div className="settings__section">
            <p className="settings__title">Auto-scroll</p>
            <div className="settings__options">
              {AUTO_SCROLL_VIEWS.map((view) => {
                const on = settings.autoScrollViews.includes(view);
                return (
                  <button
                    key={view}
                    type="button"
                    className={
                      on ? 'settings__option settings__option--active' : 'settings__option'
                    }
                    aria-pressed={on}
                    onClick={() => onAutoScrollViewChange(view, !on)}
                  >
                    {AUTO_SCROLL_LABELS[view]}
                  </button>
                );
              })}
            </div>
            <p className="settings__label">Speed</p>
            <div className="settings__options">
              {SCROLL_SPEED_OPTIONS.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className={
                    speed === settings.scrollSpeed
                      ? 'settings__option settings__option--active'
                      : 'settings__option'
                  }
                  aria-pressed={speed === settings.scrollSpeed}
                  onClick={() => onScrollSpeedChange(speed)}
                >
                  {scrollSpeedLabel(speed)}
                </button>
              ))}
            </div>
            <p className="settings__hint">
              {autoScrollDescription(settings.autoScrollViews, settings.scrollSpeed)}
            </p>
          </div>

          <button
            type="button"
            className="settings__link"
            onClick={() => {
              onOpenAssets();
              setOpen(false);
            }}
          >
            Team assets
            <span className="settings__link-hint">Team logos, robot photos and backups</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
