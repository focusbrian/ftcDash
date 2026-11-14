import { useEffect, useState } from 'react';
import { gql } from '../api/client';
import { EVENTS_QUERY } from '../api/queries';
import type { RawEventSummary } from '../api/raw';
import type { EventSummary } from '../types';

const EVENT_LIMIT = 2000;
const cache = new Map<number, EventSummary[]>();

export interface EventListState {
  events: EventSummary[];
  loading: boolean;
  error: string | null;
}

export function useEventList(season: number): EventListState {
  const [state, setState] = useState<EventListState>(() => {
    const cached = cache.get(season);
    return { events: cached ?? [], loading: !cached, error: null };
  });

  useEffect(() => {
    const cached = cache.get(season);
    if (cached) {
      setState({ events: cached, loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    setState({ events: [], loading: true, error: null });

    gql<{ eventsSearch: RawEventSummary[] }>(
      EVENTS_QUERY,
      { season, limit: EVENT_LIMIT },
      controller.signal,
    )
      .then(({ eventsSearch }) => {
        if (controller.signal.aborted) return;
        const events = eventsSearch.map((event) => ({
          code: event.code,
          name: event.name,
          start: event.start,
          end: event.end,
          type: event.type,
          hasMatches: event.hasMatches,
        }));
        cache.set(season, events);
        setState({ events, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          events: [],
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to load events.',
        });
      });

    return () => controller.abort();
  }, [season]);

  return state;
}
