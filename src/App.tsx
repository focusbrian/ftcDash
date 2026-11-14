import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfigView } from './components/ConfigView';
import { EventPicker } from './components/EventPicker';
import { MatchDetail } from './components/MatchDetail';
import { MatchList } from './components/MatchList';
import { RefreshSettings } from './components/RefreshSettings';
import { TeamSearch } from './components/TeamSearch';
import { useEventData } from './hooks/useEventData';
import { useEventList } from './hooks/useEventList';
import { useSettings } from './hooks/useSettings';
import { useTeamAssets } from './hooks/useTeamAssets';
import { pickDefaultEvent } from './lib/events';
import { latestPlayedMatchId } from './api/normalize';
import { fmtDateRange } from './lib/format';
import { buildMatchView } from './lib/model';
import type { MatchView } from './lib/model';
import { buildHash, defaultSeason, parseRoute, type RouteView } from './lib/route';

const EARLIEST_SEASON = 2019;

export default function App() {
  const initialRoute = useMemo(() => parseRoute(window.location.hash), []);
  const [view, setView] = useState<RouteView>(initialRoute.view);
  const [season, setSeason] = useState(initialRoute.season);
  const [code, setCode] = useState<string | null>(initialRoute.code);
  const [matchId, setMatchId] = useState<number | null>(initialRoute.matchId);
  const [highlightTeams, setHighlightTeams] = useState<number[]>([]);
  const [onlyHighlighted, setOnlyHighlighted] = useState(false);

  const { events, loading: eventsLoading, error: eventsError } = useEventList(season);
  const {
    data: event,
    loading: eventLoading,
    error: eventError,
    reload,
    refresh,
  } = useEventData(season, code);
  const {
    assets,
    error: assetError,
    setAsset,
    removeAsset,
    replaceAll: replaceAssets,
  } = useTeamAssets();
  const { settings, setRefreshSeconds, setFollowLatest } = useSettings();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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

  // Auto-refresh the event (and therefore the match list) on the configured interval.
  // Uses the silent refresh so scores update in place without clearing the page.
  useEffect(() => {
    if (settings.refreshSeconds <= 0 || view !== 'dashboard' || !code) return;

    const id = window.setInterval(() => {
      // Skip while the tab is in the background so we don't burn requests.
      if (document.visibilityState === 'visible') refresh();
    }, settings.refreshSeconds * 1000);

    return () => window.clearInterval(id);
  }, [settings.refreshSeconds, view, code, refresh]);

  useEffect(() => {
    if (event) setLastUpdated(new Date());
  }, [event]);

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

  const highlightSet = useMemo(() => new Set(highlightTeams), [highlightTeams]);

  const hasHighlightedTeam = useCallback(
    (candidate: MatchView) =>
      candidate.sides.some((side) =>
        side.entries.some((entry) => highlightSet.has(entry.teamNumber)),
      ),
    [highlightSet],
  );

  const teamMatchCount = useMemo(() => {
    if (highlightSet.size === 0) return 0;
    return views.filter(hasHighlightedTeam).length;
  }, [views, highlightSet, hasHighlightedTeam]);

  const visibleViews = useMemo(() => {
    if (!onlyHighlighted || highlightSet.size === 0) return views;
    return views.filter(hasHighlightedTeam);
  }, [views, onlyHighlighted, highlightSet, hasHighlightedTeam]);

  const selectedView = useMemo(
    () => views.find((candidate) => candidate.match.id === matchId) ?? null,
    [views, matchId],
  );

  const latestPlayedId = useMemo(() => latestPlayedMatchId(event?.matches ?? []), [event]);

  const selectMatch = useCallback(
    (id: number) => {
      setMatchId(id);
      // Picking a match by hand means the viewer no longer wants to follow the newest result.
      if (settings.followLatest) setFollowLatest(false);
    },
    [settings.followLatest, setFollowLatest],
  );

  // "Follow the latest result": keep the newest played match open, including across refreshes.
  useEffect(() => {
    if (!settings.followLatest || latestPlayedId === null) return;
    setMatchId(latestPlayedId);
  }, [settings.followLatest, latestPlayedId]);

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

  const handleAddTeam = useCallback((teamNumber: number) => {
    setHighlightTeams((current) =>
      current.includes(teamNumber) ? current : [...current, teamNumber],
    );
  }, []);

  const handleRemoveTeam = useCallback((teamNumber: number) => {
    setHighlightTeams((current) => current.filter((value) => value !== teamNumber));
  }, []);

  const handleToggleTeam = useCallback((teamNumber: number) => {
    setHighlightTeams((current) =>
      current.includes(teamNumber)
        ? current.filter((value) => value !== teamNumber)
        : [...current, teamNumber],
    );
  }, []);

  const handleClearTeams = useCallback(() => {
    setHighlightTeams([]);
    setOnlyHighlighted(false);
  }, []);

  // The "only these" filter makes no sense without highlighted teams.
  useEffect(() => {
    if (highlightTeams.length === 0) setOnlyHighlighted(false);
  }, [highlightTeams.length]);

  const jumpToNext = useCallback(() => {
    const next = views.find((candidate) => !candidate.match.played) ?? views[0];
    if (next) selectMatch(next.match.id);
  }, [views, selectMatch]);

  const playedCount = event?.matches.filter((match) => match.played).length ?? 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">
            <span className="brand__ftc">FTC</span>
            <span className="brand__dash">DASH</span>
          </span>
          <span className="brand__sub">Schedule · results · OPR projections</span>
          <span className="brand__credit">Created by Team 10136 RobotFalcons</span>
          <a
            className="brand__source"
            href="https://ftcscout.org"
            target="_blank"
            rel="noreferrer noopener"
          >
            Data from FTC Scout
          </a>
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
              <RefreshSettings
                seconds={settings.refreshSeconds}
                lastUpdated={lastUpdated}
                disabled={!code || eventLoading}
                onSelect={setRefreshSeconds}
                onRefresh={reload}
              />
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
          onReplaceAssets={replaceAssets}
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
                  selected={highlightTeams}
                  onAdd={handleAddTeam}
                  onRemove={handleRemoveTeam}
                  onClear={handleClearTeams}
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

              {event && event.matches.length > 0 ? (
                <label
                  className={settings.followLatest ? 'follow follow--on' : 'follow'}
                  title="Automatically open the most recently played match as results come in"
                >
                  <span className="follow__switch">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={settings.followLatest}
                      onChange={(changeEvent) => setFollowLatest(changeEvent.target.checked)}
                    />
                    <span className="follow__track" aria-hidden="true">
                      <span className="follow__thumb" />
                    </span>
                  </span>
                  Follow latest result
                </label>
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
                  highlightTeams={highlightTeams}
                  timezone={event.timezone}
                  assets={assets}
                  onSelect={selectMatch}
                />
              ) : null}
              {onlyHighlighted && highlightTeams.length > 0 && event && visibleViews.length === 0 ? (
                <p className="empty">
                  No matches for the highlighted teams at this event. Untick “Only these” to see the
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
              highlightTeams={highlightTeams}
              onToggleTeam={handleToggleTeam}
              onJumpToNext={jumpToNext}
            />
          </section>
        </main>
      )}
    </div>
  );
}
