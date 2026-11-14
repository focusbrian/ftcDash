import { useEffect, useState } from 'react';
import { cachedSeasonOpr, loadSeasonOpr } from '../api/seasonOpr';
import type { SeasonOprPoint } from '../lib/seasonOpr';

/** Delay so sweeping the pointer across a list of teams doesn't fire a request per row. */
const DEBOUNCE_MS = 180;

export interface SeasonOprHistory {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Oldest first; the previous season's final OPR anchors the series when there is one. */
  points: SeasonOprPoint[];
}

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
    const cached =
      key !== null && season !== null && teamNumber !== null
        ? cachedSeasonOpr(season, teamNumber)
        : undefined;
    if (cached) return { key, history: { status: 'ready', points: cached } };
    return { key, history: key === null ? EMPTY : { status: 'loading', points: [] } };
  });

  useEffect(() => {
    if (key === null || season === null || teamNumber === null) {
      setState({ key, history: EMPTY });
      return;
    }

    const cached = cachedSeasonOpr(season, teamNumber);
    if (cached) {
      setState({ key, history: { status: 'ready', points: cached } });
      return;
    }

    const controller = new AbortController();
    setState({ key, history: { status: 'loading', points: [] } });

    const timer = window.setTimeout(() => {
      loadSeasonOpr(season, teamNumber, controller.signal)
        .then((points) => {
          if (controller.signal.aborted) return;
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
