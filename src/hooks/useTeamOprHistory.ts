import { useEffect, useState } from 'react';
import { gql } from '../api/client';
import { TEAM_OPR_HISTORY_QUERY } from '../api/queries';
import { seasonOprBaseline, seasonOprSeries } from '../lib/seasonOpr';
import { EARLIEST_SEASON } from '../lib/route';
import type { SeasonOprPoint } from '../lib/seasonOpr';
import type { RawTeamOprEvent, RawTeamOprHistory } from '../api/raw';

/** Delay so sweeping the pointer across a list of teams doesn't fire a request per row. */
const DEBOUNCE_MS = 180;

export interface SeasonOprHistory {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Oldest first; the previous season's final OPR anchors the series when there is one. */
  points: SeasonOprPoint[];
}

const cache = new Map<string, SeasonOprPoint[]>();
const EMPTY: SeasonOprHistory = { status: 'idle', points: [] };

interface HistoryState {
  key: string | null;
  history: SeasonOprHistory;
}

async function eventsOf(
  season: number,
  teamNumber: number,
  signal: AbortSignal,
): Promise<RawTeamOprEvent[]> {
  const { teamByNumber } = await gql<{ teamByNumber: RawTeamOprHistory | null }>(
    TEAM_OPR_HISTORY_QUERY,
    { season, number: teamNumber },
    signal,
  );
  return teamByNumber?.events ?? [];
}

/** One OPR point per event a team played that season, oldest first. */
export function useTeamOprHistory(
  teamNumber: number | null,
  season: number | null,
): SeasonOprHistory {
  const key = teamNumber !== null && season !== null ? `${season}:${teamNumber}` : null;
  const [state, setState] = useState<HistoryState>(() => {
    const cached = key ? cache.get(key) : undefined;
    if (cached) return { key, history: { status: 'ready', points: cached } };
    return { key, history: key ? { status: 'loading', points: [] } : EMPTY };
  });

  useEffect(() => {
    if (key === null || season === null || teamNumber === null) {
      setState({ key, history: EMPTY });
      return;
    }

    const cached = cache.get(key);
    if (cached) {
      setState({ key, history: { status: 'ready', points: cached } });
      return;
    }

    const controller = new AbortController();
    setState({ key, history: { status: 'loading', points: [] } });

    const timer = window.setTimeout(() => {
      const previous = season - 1;
      const hasPrevious = previous >= EARLIEST_SEASON;
      Promise.all([
        eventsOf(season, teamNumber, controller.signal),
        // A team that sat out the previous season is normal — never fail the series over it.
        hasPrevious
          ? eventsOf(previous, teamNumber, controller.signal).catch((): RawTeamOprEvent[] => [])
          : Promise.resolve<RawTeamOprEvent[]>([]),
      ])
        .then(([events, priorEvents]) => {
          if (controller.signal.aborted) return;
          const points = seasonOprSeries(
            season,
            events,
            hasPrevious ? seasonOprBaseline(previous, priorEvents) : null,
          );
          cache.set(key, points);
          setState({ key, history: { status: 'ready', points } });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setState({ key, history: { status: 'error', points: [] } });
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, teamNumber, season]);

  // Never hand back the previous team's series while the new one is still loading.
  if (state.key !== key) return key === null ? EMPTY : { status: 'loading', points: [] };
  return state.history;
}
