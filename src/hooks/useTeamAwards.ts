import { useEffect, useState } from 'react';
import { gql } from '../api/client';
import { TEAM_AWARDS_QUERY } from '../api/queries';
import { normalizeAward, sortAwards, type TeamAward } from '../lib/awards';
import type { RawTeamAwards } from '../api/raw';

export interface TeamAwards {
  status: 'idle' | 'loading' | 'ready' | 'error';
  awards: TeamAward[];
}

const cache = new Map<string, TeamAward[]>();
const EMPTY: TeamAwards = { status: 'idle', awards: [] };

interface State {
  key: string | null;
  awards: TeamAwards;
}

/** Awards a team won this season, most recent event first. One request per team, cached for the session. */
export function useTeamAwards(teamNumber: number | null, season: number | null): TeamAwards {
  const key = teamNumber !== null && season !== null ? `${season}:${teamNumber}` : null;
  const [state, setState] = useState<State>(() => {
    const cached = key ? cache.get(key) : undefined;
    if (cached) return { key, awards: { status: 'ready', awards: cached } };
    return { key, awards: key ? { status: 'loading', awards: [] } : EMPTY };
  });

  useEffect(() => {
    if (key === null || teamNumber === null || season === null) {
      setState({ key, awards: EMPTY });
      return;
    }

    const cached = cache.get(key);
    if (cached) {
      setState({ key, awards: { status: 'ready', awards: cached } });
      return;
    }

    const controller = new AbortController();
    setState({ key, awards: { status: 'loading', awards: [] } });

    gql<{ teamByNumber: RawTeamAwards | null }>(
      TEAM_AWARDS_QUERY,
      { season, number: teamNumber },
      controller.signal,
    )
      .then(({ teamByNumber }) => {
        if (controller.signal.aborted) return;
        const awards = sortAwards((teamByNumber?.awards ?? []).map(normalizeAward));
        cache.set(key, awards);
        setState({ key, awards: { status: 'ready', awards } });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({ key, awards: { status: 'error', awards: [] } });
      });

    return () => controller.abort();
  }, [key, teamNumber, season]);

  if (state.key !== key) return key === null ? EMPTY : { status: 'loading', awards: [] };
  return state.awards;
}
