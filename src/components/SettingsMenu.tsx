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
  onSelectRefresh: (seconds: number) => void;
  onRefresh: () => void;
  onFollowLatestChange: (enabled: boolean) => void;
  onAutoScrollViewChange: (view: AutoScrollView, enabled: boolean) => void;
  onScrollSpeedChange: (speed: number) => void;
  onOpenAssets: () => void;
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <defs>
        {/* The hub is masked out rather than filled, so the button's own background shows through. */}
        <mask id="gear-hub">
          <rect width="24" height="24" fill="#fff" />
          <circle cx="12" cy="12" r="3.1" fill="#000" />
        </mask>
      </defs>
      <g fill="currentColor" mask="url(#gear-hub)">
        <rect x="10.35" y="1.6" width="3.3" height="20.8" rx="1.2" />
        <rect x="10.35" y="1.6" width="3.3" height="20.8" rx="1.2" transform="rotate(45 12 12)" />
        <rect x="10.35" y="1.6" width="3.3" height="20.8" rx="1.2" transform="rotate(90 12 12)" />
        <rect x="10.35" y="1.6" width="3.3" height="20.8" rx="1.2" transform="rotate(135 12 12)" />
        <circle cx="12" cy="12" r="7.5" />
      </g>
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
  onSelectRefresh,
  onRefresh,
  onFollowLatestChange,
  onAutoScrollViewChange,
  onScrollSpeedChange,
  onOpenAssets,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const followId = useId();

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
