import { useEffect, useId, useRef, useState } from 'react';
import { REFRESH_OPTIONS, refreshDescription, refreshLabel } from '../lib/settings';

interface Props {
  seconds: number;
  lastUpdated: Date | null;
  disabled: boolean;
  onSelect: (seconds: number) => void;
  onRefresh: () => void;
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

export function RefreshSettings({
  seconds,
  lastUpdated,
  disabled,
  onSelect,
  onRefresh,
  onOpenAssets,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

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
        aria-label="Refresh settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        title="Refresh settings"
        onClick={() => setOpen((current) => !current)}
      >
        <GearIcon />
      </button>

      {open ? (
        <div className="settings" id={panelId} role="dialog" aria-label="Refresh settings">
          <p className="settings__title">Match list refresh</p>
          <div className="settings__options">
            {REFRESH_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={
                  option === seconds
                    ? 'settings__option settings__option--active'
                    : 'settings__option'
                }
                aria-pressed={option === seconds}
                onClick={() => onSelect(option)}
              >
                {refreshLabel(option)}
              </button>
            ))}
          </div>
          <p className="settings__hint">
            {refreshDescription(seconds)} Last update {formatClock(lastUpdated)}.
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
