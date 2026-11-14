import { useMemo, useState } from 'react';
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

  const sorted = useMemo(() => sortEventsForPicker(events), [events]);
  const filtered = useMemo(() => filterEvents(sorted, query), [sorted, query]);
  const visible = filtered.slice(0, MAX_OPTIONS);
  const selected = events.find((event) => event.code === selectedCode) ?? null;
  const truncated = filtered.length > visible.length;

  return (
    <div className="picker">
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
          onChange={(event) => onSelect(event.target.value)}
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
  );
}
