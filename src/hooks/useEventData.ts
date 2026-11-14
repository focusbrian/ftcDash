import { useCallback, useEffect, useState } from 'react';
import { gql } from '../api/client';
import { normalizeEvent } from '../api/normalize';
import { EVENT_QUERY } from '../api/queries';
import type { RawEvent } from '../api/raw';
import type { EventData } from '../types';

export interface EventDataState {
  data: EventData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useEventData(season: number, code: string | null): EventDataState {
  const [data, setData] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!code) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setData(null);
    setLoading(true);
    setError(null);

    gql<{ eventByCode: RawEvent | null }>(EVENT_QUERY, { season, code }, controller.signal)
      .then(({ eventByCode }) => {
        if (controller.signal.aborted) return;
        if (!eventByCode) {
          setData(null);
          setError(`No event "${code}" found in the ${season} season.`);
          return;
        }
        setData(normalizeEvent(eventByCode, season));
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (failure instanceof DOMException && failure.name === 'AbortError') return;
        setData(null);
        setError(failure instanceof Error ? failure.message : 'Failed to load event data.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [season, code, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { data, loading, error, reload };
}
