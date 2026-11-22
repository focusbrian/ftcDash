import { useMemo, useState } from 'react';
import { useTeamEventLookup } from '../hooks/useTeamEventLookup';
import {
  filterEvents,
  groupEvents,
  pickDefaultEvent,
  sortEventsForPicker,
} from '../lib/events';
import { eventTypeLabel, fmtDateRange } from '../lib/format';
import { buildHash } from '../lib/route';
import type { EventSummary } from '../types';

interface Props {
  season: number;
  seasons: number[];
  onSeasonChange: (season: number) => void;
  events: EventSummary[];
  loading: boolean;
  error: string | null;
}

/** Rows per section before the "show everything" switch. */
const SECTION_LIMIT = 6;

function seasonLabel(season: number): string {
  return `${season}–${String((season + 1) % 100).padStart(2, '0')}`;
}

function eventHref(season: number, code: string): string {
  return buildHash({ view: 'dashboard', season, code, matchId: null, teamNumber: null });
}

function EventRow({ season, event }: { season: number; event: EventSummary }) {
  return (
    <li>
      <a className="eventrow" href={eventHref(season, event.code)}>
        <span className="eventrow__body">
          <span className="eventrow__name">{event.name}</span>
          <span className="eventrow__meta">
            {event.code} · {fmtDateRange(event.start, event.end)} · {eventTypeLabel(event.type)}
            {event.hasMatches ? '' : ' · no results yet'}
          </span>
        </span>
        <span className="eventrow__go" aria-hidden="true">
          →
        </span>
      </a>
    </li>
  );
}

interface SectionProps {
  title: string;
  events: EventSummary[];
  season: number;
  /** Section shows these rows before the "show all" switch. */
  limit?: number;
}

function Section({ title, events, season, limit }: SectionProps) {
  if (events.length === 0) return null;
  const shown = limit === undefined ? events : events.slice(0, limit);

  return (
    <section className="home__section">
      <h2 className="home__section-title">
        {title}
        <span className="home__count">{events.length}</span>
      </h2>
      <ul className="home__list">
        {shown.map((event) => (
          <EventRow key={event.code} season={season} event={event} />
        ))}
      </ul>
    </section>
  );
}

/** The landing page: pick a season, find an event, or jump into the one running today. */
export function HomePage({ season, seasons, onSeasonChange, events, loading, error }: Props) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const lookup = useTeamEventLookup(season, query);

  const groups = useMemo(() => groupEvents(events), [events]);
  const featured = useMemo(() => pickDefaultEvent(events), [events]);
  const ordered = useMemo(() => sortEventsForPicker(events), [events]);

  // A bare team number answers with that team's events, exactly like the header picker.
  const teamCodes = useMemo(
    () =>
      lookup.status === 'ready' && lookup.codes.length > 0 ? new Set(lookup.codes) : null,
    [lookup.status, lookup.codes],
  );
  const filtering = query.trim().length > 0;
  const results = useMemo(() => {
    if (lookup.teamNumber !== null) {
      return teamCodes ? ordered.filter((event) => teamCodes.has(event.code)) : [];
    }
    return filtering ? filterEvents(ordered, query) : [];
  }, [ordered, filtering, query, lookup.teamNumber, teamCodes]);

  const hint = (() => {
    const number = lookup.teamNumber;
    if (number === null) return null;
    if (lookup.status === 'loading') return `Looking up team ${number}…`;
    if (lookup.status === 'error') return `Could not look up team ${number}.`;
    const label = lookup.teamName ? `${lookup.teamName} (${number})` : `Team ${number}`;
    if (lookup.codes.length === 0) return `${label} played no events this season.`;
    if (!teamCodes) return `${label} played ${lookup.codes.length} events, none in this season's list.`;
    return `${label} — ${lookup.codes.length} event${lookup.codes.length === 1 ? '' : 's'} this season.`;
  })();

  const featuredIsLive = featured !== null && groups.live.some((event) => event.code === featured.code);
  const truncated =
    groups.live.length > SECTION_LIMIT ||
    groups.upcoming.length > SECTION_LIMIT ||
    groups.recent.length > SECTION_LIMIT;

  return (
    <div className="home">
      <header className="home__hero">
        <p className="home__eyebrow">FTC scouting / {seasonLabel(season)} season</p>
        <h1 className="home__title">
          Every match.
          <br />
          <span>Every number.</span>
        </h1>
        <p className="home__intro">
          Pick an event to see its schedule, the real results as FIRST reports them, and OPR-based
          projections for the matches still to come.
        </p>
        {featured ? (
          <div className="home__cta">
            <a className="button home__cta-button" href={eventHref(season, featured.code)}>
              {featuredIsLive ? 'Open the live event' : 'Latest results'} — {featured.name}
            </a>
          </div>
        ) : null}
      </header>

      <div className="home__controls">
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

        <label className="field home__search">
          <span className="field__label">Find an event or team</span>
          <input
            className="field__control"
            type="search"
            value={query}
            placeholder="Event code or name, or a team number such as 10136"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {hint ? <p className="home__hint">{hint}</p> : null}
      {error ? <p className="home__hint home__hint--error">{error}</p> : null}

      {loading ? (
        <p className="home__status">Loading events…</p>
      ) : filtering || lookup.teamNumber !== null ? (
        results.length > 0 ? (
          <Section title="Matching events" events={results} season={season} />
        ) : (
          <p className="home__status">
            {lookup.teamNumber !== null
              ? 'No events to show for that team this season.'
              : `No event matches “${query.trim()}”.`}
          </p>
        )
      ) : events.length === 0 ? (
        <p className="home__status">
          FTC Scout has no events for this season yet. Try another season above.
        </p>
      ) : showAll ? (
        <>
          <Section title="All events" events={ordered} season={season} />
          <button type="button" className="button button--ghost home__more" onClick={() => setShowAll(false)}>
            Back to the highlights
          </button>
        </>
      ) : (
        <>
          <Section title="Happening now" events={groups.live} season={season} limit={SECTION_LIMIT} />
          <Section title="Upcoming" events={groups.upcoming} season={season} limit={SECTION_LIMIT} />
          <Section title="Recently finished" events={groups.recent} season={season} limit={SECTION_LIMIT} />
          {truncated ? (
            <button type="button" className="button button--ghost home__more" onClick={() => setShowAll(true)}>
              Show all {events.length} events
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
