import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfigView } from './components/ConfigView';
import { EventChartsProvider } from './components/EventChartsContext';
import { EventInfo } from './components/EventInfo';
import { EventPicker } from './components/EventPicker';
import { MatchDetail } from './components/MatchDetail';
import { MatchList } from './components/MatchList';
import { PredictRanking } from './components/PredictRanking';
import { RefreshSettings } from './components/RefreshSettings';
import { PredictIcon, RankingIcon, ScheduleIcon } from './components/TabIcons';
import { TeamList } from './components/TeamList';
import { TeamSearch } from './components/TeamSearch';
import { useEventData } from './hooks/useEventData';
import { useEventList } from './hooks/useEventList';
import { useSeasonOprFallback } from './hooks/useSeasonOprFallback';
import { useSettings } from './hooks/useSettings';
import { useTeamAssets } from './hooks/useTeamAssets';
import { pickDefaultEvent } from './lib/events';
import { latestPlayedMatchId } from './api/normalize';
import { fmtDateRange, matchShortLabel } from './lib/format';
import { buildMatchView } from './lib/model';
import type { MatchView } from './lib/model';
import { applySeasonOpr, rankTeams } from './lib/teams';
import { eventRecords } from './lib/records';
import { buildHash, defaultSeason, EARLIEST_SEASON, parseRoute, type RouteView } from './lib/route';
import type { TeamStrength } from './types';

/** Which of the two stacked panes a narrow screen shows; ignored on wide layouts. */
type Pane = 'schedule' | 'match';

/** What the left column lists: the match schedule, the team ranking, or the predicted finish. */
type LeftView = 'matches' | 'ranking' | 'predict';

export default function App() {
  const initialRoute = useMemo(() => parseRoute(window.location.hash), []);
  const [view, setView] = useState<RouteView>(initialRoute.view);
  const [season, setSeason] = useState(initialRoute.season);
  const [code, setCode] = useState<string | null>(initialRoute.code);
  const [matchId, setMatchId] = useState<number | null>(initialRoute.matchId);
  const [pane, setPane] = useState<Pane>(initialRoute.matchId !== null ? 'match' : 'schedule');
  const [leftView, setLeftView] = useState<LeftView>('matches');
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

  // Before the event publishes OPR, projections stand on each team's most recent OPR.
  const seasonOpr = useSeasonOprFallback(eventTeams, event?.season ?? null);
  const strengths = useMemo(
    () => (event ? applySeasonOpr(event.teams, seasonOpr) : new Map<number, TeamStrength>()),
    [event, seasonOpr],
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
      if (route.matchId !== null) setPane('match');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const views = useMemo(
    () => (event ? event.matches.map((match) => buildMatchView(match, strengths)) : []),
    [event, strengths],
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

  const rankedTeams = useMemo(() => rankTeams(strengths.values()), [strengths]);

  // Event-wide records, so a filtered list still stars the true high scores.
  const records = useMemo(() => eventRecords(views), [views]);

  const visibleViews = useMemo(() => {
    if (!onlyHighlighted || highlightSet.size === 0) return views;
    return views.filter(hasHighlightedTeam);
  }, [views, onlyHighlighted, highlightSet, hasHighlightedTeam]);

  const selectedView = useMemo(
    () => views.find((candidate) => candidate.match.id === matchId) ?? null,
    [views, matchId],
  );

  const detailPanelRef = useRef<HTMLElement | null>(null);
  const selectedMatchId = selectedView?.match.id ?? null;

  // Opening a different match should start at the top of its detail, not inherit the last scroll.
  useEffect(() => {
    const panel = detailPanelRef.current;
    if (panel) panel.scrollTop = 0;
  }, [selectedMatchId]);

  const latestPlayedId = useMemo(() => latestPlayedMatchId(event?.matches ?? []), [event]);

  const selectMatch = useCallback(
    (id: number) => {
      setMatchId(id);
      // On a phone the two panes are stacked, so opening a match has to bring it into view.
      setPane('match');
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

  const charts = useMemo(() => ({ season, views }), [season, views]);

  return (
    <EventChartsProvider value={charts}>
      <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">
            <span className="brand__ftc">FTC</span>
            <span className="brand__dash">DASH</span>
          </span>
          <span className="brand__sub">Schedule · results · OPR projections</span>
          <span className="brand__credit">
            Created by Team 10136{' '}
            <a
              className="brand__credit-link"
              href="https://frostrobofalcons.org/"
              target="_blank"
              rel="noreferrer noopener"
            >
              RoboFalcons
            </a>
          </span>
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
            trailing={<EventInfo event={event} />}
          />
        ) : null}

        <div className="topbar__actions">
          {view === 'dashboard' ? (
            <RefreshSettings
              seconds={settings.refreshSeconds}
              lastUpdated={lastUpdated}
              disabled={!code || eventLoading}
              onSelect={setRefreshSeconds}
              onRefresh={reload}
              onOpenAssets={() => setView('config')}
            />
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
        <main className={`workspace workspace--${pane}`}>
          <div className="panes" role="group" aria-label="Schedule or match view">
            <button
              type="button"
              className={pane === 'schedule' ? 'panes__tab panes__tab--active' : 'panes__tab'}
              aria-pressed={pane === 'schedule'}
              onClick={() => setPane('schedule')}
            >
              Schedule
              {visibleViews.length > 0 ? (
                <span className="panes__count">{visibleViews.length}</span>
              ) : null}
            </button>
            <button
              type="button"
              className={pane === 'match' ? 'panes__tab panes__tab--active' : 'panes__tab'}
              aria-pressed={pane === 'match'}
              onClick={() => setPane('match')}
            >
              {selectedView ? `Match ${matchShortLabel(selectedView.match)}` : 'Match'}
            </button>
          </div>

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

            <div className="schedule__tabs" role="group" aria-label="Matches, ranking or prediction">
              <button
                type="button"
                className={
                  leftView === 'matches'
                    ? 'schedule__tab schedule__tab--active'
                    : 'schedule__tab'
                }
                aria-pressed={leftView === 'matches'}
                onClick={() => setLeftView('matches')}
              >
                <ScheduleIcon />
                Matches
                {visibleViews.length > 0 ? (
                  <span className="schedule__tab-count">{visibleViews.length}</span>
                ) : null}
              </button>
              <button
                type="button"
                className={
                  leftView === 'ranking' ? 'schedule__tab schedule__tab--active' : 'schedule__tab'
                }
                aria-pressed={leftView === 'ranking'}
                onClick={() => setLeftView('ranking')}
              >
                <RankingIcon />
                Ranking
                {rankedTeams.length > 0 ? (
                  <span className="schedule__tab-count">{rankedTeams.length}</span>
                ) : null}
              </button>
              <button
                type="button"
                className={
                  leftView === 'predict' ? 'schedule__tab schedule__tab--active' : 'schedule__tab'
                }
                aria-pressed={leftView === 'predict'}
                onClick={() => setLeftView('predict')}
              >
                <PredictIcon />
                Predict
              </button>
            </div>

            <div className="schedule__list">
              {eventLoading && !event ? <p className="empty">Loading schedule…</p> : null}
              {!code && !eventLoading ? (
                <p className="empty">Choose an event above to load its match schedule.</p>
              ) : null}

              {leftView === 'ranking' && event ? (
                <TeamList
                  teams={rankedTeams}
                  highlightTeams={highlightTeams}
                  assets={assets}
                  onToggleTeam={handleToggleTeam}
                />
              ) : null}

              {leftView === 'predict' && event ? (
                <PredictRanking
                  teams={rankedTeams}
                  views={views}
                  highlightTeams={highlightTeams}
                  assets={assets}
                  onToggleTeam={handleToggleTeam}
                />
              ) : null}

              {leftView === 'matches' && event && !(onlyHighlighted && visibleViews.length === 0) ? (
                <MatchList
                  views={visibleViews}
                  selectedId={matchId}
                  highlightTeams={highlightTeams}
                  timezone={event.timezone}
                  assets={assets}
                  records={records}
                  onSelect={selectMatch}
                />
              ) : null}
              {leftView === 'matches' &&
              onlyHighlighted &&
              highlightTeams.length > 0 &&
              event &&
              visibleViews.length === 0 ? (
                <p className="empty">
                  No matches for the highlighted teams at this event. Untick “Only these” to see the
                  full schedule.
                </p>
              ) : null}
            </div>
          </section>

          <section className="detail-panel" ref={detailPanelRef}>
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
    </EventChartsProvider>
  );
}
