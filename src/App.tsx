import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfigView } from './components/ConfigView';
import { EventPicker } from './components/EventPicker';
import { MatchDetail } from './components/MatchDetail';
import { MatchList } from './components/MatchList';
import { TeamSearch } from './components/TeamSearch';
import { useEventData } from './hooks/useEventData';
import { useEventList } from './hooks/useEventList';
import { useTeamAssets } from './hooks/useTeamAssets';
import { pickDefaultEvent } from './lib/events';
import { fmtDateRange } from './lib/format';
import { buildMatchView } from './lib/model';
import { buildHash, defaultSeason, parseRoute, type RouteView } from './lib/route';

const EARLIEST_SEASON = 2019;

export default function App() {
  const initialRoute = useMemo(() => parseRoute(window.location.hash), []);
  const [view, setView] = useState<RouteView>(initialRoute.view);
  const [season, setSeason] = useState(initialRoute.season);
  const [code, setCode] = useState<string | null>(initialRoute.code);
  const [matchId, setMatchId] = useState<number | null>(initialRoute.matchId);
  const [highlightTeam, setHighlightTeam] = useState<number | null>(null);
  const [onlyHighlighted, setOnlyHighlighted] = useState(false);

  const { events, loading: eventsLoading, error: eventsError } = useEventList(season);
  const {
    data: event,
    loading: eventLoading,
    error: eventError,
    reload,
  } = useEventData(season, code);
  const { assets, error: assetError, setAsset, removeAsset } = useTeamAssets();

  const seasons = useMemo(() => {
    const latest = Math.max(defaultSeason(), season);
    const list: number[] = [];
    for (let value = latest; value >= EARLIEST_SEASON; value -= 1) list.push(value);
    return list;
  }, [season]);

  const eventTeams = useMemo(
    () => (event ? Array.from(event.teams.values()) : []),
    [event],
  );

  // First visit: land on today's event, or the most recent one with results.
  useEffect(() => {
    if (code || events.length === 0) return;
    const picked = pickDefaultEvent(events);
    if (picked) setCode(picked.code);
  }, [code, events]);

  useEffect(() => {
    const hash = buildHash({ view, season, code, matchId });
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
    }
  }, [view, season, code, matchId]);

  // Follow manual URL edits and back/forward navigation.
  useEffect(() => {
    const onHashChange = () => {
      const route = parseRoute(window.location.hash);
      setView(route.view);
      setSeason(route.season);
      setCode(route.code);
      setMatchId(route.matchId);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const views = useMemo(
    () => (event ? event.matches.map((match) => buildMatchView(match, event.teams)) : []),
    [event],
  );

  const teamMatchCount = useMemo(() => {
    if (highlightTeam === null) return 0;
    return views.filter((candidate) =>
      candidate.sides.some((side) =>
        side.entries.some((entry) => entry.teamNumber === highlightTeam),
      ),
    ).length;
  }, [views, highlightTeam]);

  const visibleViews = useMemo(() => {
    if (!onlyHighlighted || highlightTeam === null) return views;
    return views.filter((candidate) =>
      candidate.sides.some((side) =>
        side.entries.some((entry) => entry.teamNumber === highlightTeam),
      ),
    );
  }, [views, onlyHighlighted, highlightTeam]);

  const selectedView = useMemo(
    () => views.find((candidate) => candidate.match.id === matchId) ?? null,
    [views, matchId],
  );

  // Once an event loads, open the first match that has not been played yet.
  useEffect(() => {
    if (!event || event.code !== code) return;
    if (matchId !== null || views.length === 0) return;
    const next = views.find((candidate) => !candidate.match.played) ?? views[views.length - 1];
    if (next) setMatchId(next.match.id);
  }, [code, event, matchId, views]);

  const handleSeasonChange = useCallback((value: number) => {
    setSeason(value);
    setCode(null);
    setMatchId(null);
  }, []);

  const handleSelectEvent = useCallback((value: string) => {
    setCode(value);
    setMatchId(null);
  }, []);

  const handleSelectTeam = useCallback((teamNumber: number | null) => {
    setHighlightTeam(teamNumber);
    if (teamNumber === null) setOnlyHighlighted(false);
  }, []);

  const jumpToNext = useCallback(() => {
    const next = views.find((candidate) => !candidate.match.played) ?? views[0];
    if (next) setMatchId(next.match.id);
  }, [views]);

  const playedCount = event?.matches.filter((match) => match.played).length ?? 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">FTCDash</span>
          <span className="brand__sub">Schedule · results · OPR projections</span>
        </div>

        {view === 'dashboard' ? (
          <EventPicker
            season={season}
            seasons={seasons}
            onSeasonChange={handleSeasonChange}
            events={events}
            loading={eventsLoading}
            error={eventsError}
            selectedCode={code}
            onSelect={handleSelectEvent}
          />
        ) : null}

        <div className="topbar__actions">
          {view === 'dashboard' ? (
            <>
              <button
                type="button"
                className="button button--ghost"
                onClick={reload}
                disabled={!code || eventLoading}
              >
                {eventLoading ? 'Refreshing…' : 'Refresh'}
              </button>
              <button type="button" className="button" onClick={() => setView('config')}>
                Team assets
              </button>
            </>
          ) : null}
        </div>
      </header>

      {view === 'config' ? (
        <ConfigView
          teams={eventTeams}
          assets={assets}
          storageError={assetError}
          onSetAsset={setAsset}
          onRemoveAsset={removeAsset}
          onBack={() => setView('dashboard')}
        />
      ) : (
        <main className="workspace">
          <section className="schedule">
            <header className="schedule__head">
              <h1>{event?.name ?? (code ? 'Loading event…' : 'No event selected')}</h1>
              {event ? (
                <p className="schedule__meta">
                  {event.code} · {fmtDateRange(event.start, event.end)} ·{' '}
                  {event.location.city || event.location.country}
                </p>
              ) : null}
              {event && event.matches.length > 0 ? (
                <p className="schedule__stats">
                  <strong>{playedCount}</strong> of {event.matches.length} matches played
                  {event.teams.size > 0 ? (
                    <>
                      {' '}
                      · <strong>{event.teams.size}</strong> teams
                    </>
                  ) : null}
                </p>
              ) : null}

              {event && eventTeams.length > 0 ? (
                <TeamSearch
                  teams={eventTeams}
                  selected={highlightTeam}
                  onSelect={handleSelectTeam}
                  statusExtra={
                    <>
                      <span>· {teamMatchCount} matches</span>
                      {teamMatchCount > 0 ? (
                        <label className="teamsearch__toggle">
                          <input
                            type="checkbox"
                            checked={onlyHighlighted}
                            onChange={(changeEvent) => setOnlyHighlighted(changeEvent.target.checked)}
                          />
                          Only these
                        </label>
                      ) : null}
                    </>
                  }
                />
              ) : null}
            </header>

            <div className="schedule__list">
              {eventLoading && !event ? <p className="empty">Loading schedule…</p> : null}
              {!code && !eventLoading ? (
                <p className="empty">Choose an event above to load its match schedule.</p>
              ) : null}
              {event && !(onlyHighlighted && visibleViews.length === 0) ? (
                <MatchList
                  views={visibleViews}
                  selectedId={matchId}
                  highlightTeam={highlightTeam}
                  timezone={event.timezone}
                  assets={assets}
                  onSelect={setMatchId}
                />
              ) : null}
              {onlyHighlighted && highlightTeam !== null && event && visibleViews.length === 0 ? (
                <p className="empty">
                  No matches for team {highlightTeam} at this event. Untick “Only these” to see the
                  full schedule.
                </p>
              ) : null}
            </div>
          </section>

          <section className="detail-panel">
            <MatchDetail
              view={selectedView}
              event={event}
              loading={eventLoading}
              error={eventError}
              assets={assets}
              highlightTeam={highlightTeam}
              onJumpToNext={jumpToNext}
            />
          </section>
        </main>
      )}
    </div>
  );
}
