import { useEffect, useState } from 'react';
import { gql } from '../api/client';
import { TEAM_OPR_HISTORY_QUERY } from '../api/queries';
import type { RawTeamOprHistory } from '../api/raw';

/** Delay so sweeping the pointer across a list of teams doesn't fire a request per row. */
const DEBOUNCE_MS = 180;

export interface SeasonOprPoint {
  code: string;
  name: string;
  start: string;
  auto: number;
  teleop: number;
  total: number;
}

export interface SeasonOprHistory {
  status: 'idle' | 'loading' | 'ready' | 'error';
  points: SeasonOprPoint[];
}

const cache = new Map<string, SeasonOprPoint[]>();
const EMPTY: SeasonOprHistory = { status: 'idle', points: [] };

interface HistoryState {
  key: string | null;
  history: SeasonOprHistory;
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
    if (key === null) {
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
      gql<{ teamByNumber: RawTeamOprHistory | null }>(
        TEAM_OPR_HISTORY_QUERY,
        { season, number: teamNumber },
        controller.signal,
      )
        .then(({ teamByNumber }) => {
          if (controller.signal.aborted) return;
          const points = (teamByNumber?.events ?? [])
            .filter((entry) => entry.stats?.opr)
            .map((entry) => ({
              code: entry.event.code,
              name: entry.event.name,
              start: entry.event.start,
              auto: Math.max(0, entry.stats?.opr?.autoPoints ?? 0),
              teleop: Math.max(0, entry.stats?.opr?.dcPoints ?? 0),
              total: Math.max(0, entry.stats?.opr?.totalPointsNp ?? 0),
            }))
            .sort((a, b) => a.start.localeCompare(b.start));

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
