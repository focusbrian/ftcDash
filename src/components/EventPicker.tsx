import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { filterEvents, sortEventsForPicker } from '../lib/events';
import { fmtDate } from '../lib/format';
import type { EventSummary } from '../types';

const MAX_OPTIONS = 250;

interface Props {
  season: number;
  seasons: number[];
  onSeasonChange: (season: number) => void;
  events: EventSummary[];
  loading: boolean;
  error: string | null;
  selectedCode: string | null;
  onSelect: (code: string) => void;
}

function seasonLabel(season: number): string {
  return `${season}–${String((season + 1) % 100).padStart(2, '0')}`;
}

function eventLabel(event: EventSummary): string {
  const played = event.hasMatches ? '' : ' · no results yet';
  return `${event.code} — ${event.name} · ${fmtDate(event.start)}${played}`;
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M12 15.5 5.5 9l1.4-1.4 5.1 5.1 5.1-5.1L18.5 9 12 15.5Z" />
    </svg>
  );
}

export function EventPicker({
  season,
  seasons,
  onSeasonChange,
  events,
  loading,
  error,
  selectedCode,
  onSelect,
}: Props) {
  const [query, setQuery] = useState('');
  // Narrow screens show the fields in a drop-down menu instead of inline in the header.
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const sorted = useMemo(() => sortEventsForPicker(events), [events]);
  const filtered = useMemo(() => filterEvents(sorted, query), [sorted, query]);
  const visible = filtered.slice(0, MAX_OPTIONS);
  const selected = events.find((event) => event.code === selectedCode) ?? null;
  const truncated = filtered.length > visible.length;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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

  const chooseEvent = (code: string) => {
    onSelect(code);
    setOpen(false);
  };

  return (
    <div className={open ? 'picker picker--open' : 'picker'} ref={rootRef}>
      <button
        type="button"
        className="picker__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="picker__toggle-value">
          {selected
            ? `${selected.code} — ${selected.name}`
            : loading
              ? 'Loading events…'
              : 'Select an event'}
        </span>
        <span className="picker__toggle-icon" aria-hidden="true">
          <ChevronIcon />
        </span>
      </button>

      <div className="picker__fields" id={panelId}>
        <label className="field">
          <span className="field__label">Season</span>
          <select
            className="field__control"
            value={season}
            onChange={(event) => onSeasonChange(Number(event.target.value))}
          >
            {seasons.map((value) => (
              <option key={value} value={value}>
                {seasonLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="field field--grow">
          <span className="field__label">Find event</span>
          <input
            className="field__control"
            type="search"
            value={query}
            placeholder="Team event code or name, e.g. USCMP"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <label className="field field--wide">
          <span className="field__label">Event</span>
          <select
            className="field__control"
            value={selectedCode ?? ''}
            disabled={loading || events.length === 0}
            onChange={(event) => chooseEvent(event.target.value)}
          >
            <option value="" disabled>
              {loading ? 'Loading events…' : 'Select an event'}
            </option>
            {selected && !visible.some((event) => event.code === selected.code) ? (
              <option value={selected.code}>{eventLabel(selected)}</option>
            ) : null}
            {visible.map((event) => (
              <option key={event.code} value={event.code}>
                {eventLabel(event)}
              </option>
            ))}
          </select>
        </label>

        {truncated ? (
          <p className="picker__hint">
            Showing {visible.length} of {filtered.length} events — keep typing to narrow it down.
          </p>
        ) : null}
        {error ? <p className="picker__hint picker__hint--error">{error}</p> : null}
      </div>
    </div>
  );
}
