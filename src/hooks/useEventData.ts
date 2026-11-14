import { useCallback, useEffect, useRef, useState } from 'react';
import { gql } from '../api/client';
import { normalizeEvent } from '../api/normalize';
import { EVENT_QUERY } from '../api/queries';
import type { RawEvent } from '../api/raw';
import type { EventData } from '../types';

export interface EventDataState {
  data: EventData | null;
  /** True only for a load the user is waiting on (first load, event switch, manual refresh). */
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Re-fetch in the background: keeps the current event on screen and never shows a spinner. */
  refresh: () => void;
}

export function useEventData(season: number, code: string | null): EventDataState {
  const [data, setData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState({ token: 0, silent: false });
  const dataRef = useRef<EventData | null>(null);

  const reload = useCallback(() => {
    setRequest((current) => ({ token: current.token + 1, silent: false }));
  }, []);

  const refresh = useCallback(() => {
    setRequest((current) => ({ token: current.token + 1, silent: true }));
  }, []);

  useEffect(() => {
    if (!code) {
      dataRef.current = null;
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const current = dataRef.current;
    const sameEvent = current?.code === code && current.season === season;
    // A background refresh of the event already on screen: no spinner, no cleared content.
    const silent = request.silent && sameEvent;

    if (!silent) {
      setLoading(true);
      setError(null);
      if (!sameEvent) {
        dataRef.current = null;
        setData(null);
      }
    }

    gql<{ eventByCode: RawEvent | null }>(EVENT_QUERY, { season, code }, controller.signal)
      .then(({ eventByCode }) => {
        if (controller.signal.aborted) return;
        if (!eventByCode) {
          dataRef.current = null;
          setData(null);
          setError(`No event "${code}" found in the ${season} season.`);
          return;
        }
        const next = normalizeEvent(eventByCode, season);
        dataRef.current = next;
        setData(next);
        setError(null);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (failure instanceof DOMException && failure.name === 'AbortError') return;
        // A failed background refresh keeps the last good data on screen.
        if (silent) return;
        dataRef.current = null;
        setData(null);
        setError(failure instanceof Error ? failure.message : 'Failed to load event data.');
      })
      .finally(() => {
        if (!controller.signal.aborted && !silent) setLoading(false);
      });

    return () => controller.abort();
  }, [season, code, request]);

  return { data, loading, error, reload, refresh };
}
