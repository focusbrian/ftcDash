import { useEffect, useState } from 'react';
import { gql } from '../api/client';
import { TEAM_EVENTS_QUERY } from '../api/queries';
import { teamNumberQuery } from '../lib/events';
import type { RawTeamSeason } from '../api/raw';

const DEBOUNCE_MS = 350;

export interface TeamEventLookup {
  teamNumber: number | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  teamName: string | null;
  /** Event codes the team attended that season; empty when it played nothing or is unknown. */
  codes: string[];
}

const IDLE: TeamEventLookup = { teamNumber: null, status: 'idle', teamName: null, codes: [] };

/** Resolves a team number typed into the event filter into the events that team attended. */
export function useTeamEventLookup(season: number, query: string): TeamEventLookup {
  const teamNumber = teamNumberQuery(query);
  const [state, setState] = useState<TeamEventLookup>(IDLE);

  useEffect(() => {
    if (teamNumber === null) {
      setState(IDLE);
      return;
    }

    const controller = new AbortController();
    setState({ teamNumber, status: 'loading', teamName: null, codes: [] });

    const timer = window.setTimeout(() => {
      gql<{ teamByNumber: RawTeamSeason | null }>(
        TEAM_EVENTS_QUERY,
        { season, number: teamNumber },
        controller.signal,
      )
        .then(({ teamByNumber }) => {
          if (controller.signal.aborted) return;
          setState({
            teamNumber,
            status: 'ready',
            teamName: teamByNumber?.name ?? null,
            codes: teamByNumber ? teamByNumber.events.map((entry) => entry.event.code) : [],
          });
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (error instanceof DOMException && error.name === 'AbortError') return;
          setState({ teamNumber, status: 'error', teamName: null, codes: [] });
        });
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [season, teamNumber]);

  return state;
}
