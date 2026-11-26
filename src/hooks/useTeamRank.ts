import { useEffect, useState } from 'react';
import { loadRegionRank, loadWorldRank, type RankPlace } from '../api/rankings';

export type RankStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface RankSlot {
  status: RankStatus;
  place: RankPlace | null;
}

export interface TeamRankState {
  world: RankSlot;
  region: RankSlot;
}

const IDLE: RankSlot = { status: 'idle', place: null };
const LOADING: RankSlot = { status: 'loading', place: null };

interface State {
  key: string | null;
  world: RankSlot;
  region: RankSlot;
}

/**
 * The team's OPR standing for the season: worldwide as FTC Scout ranks it, and counted out of the
 * teams in the event's region. Both load in the background, so the page never waits on them.
 */
export function useTeamRank(
  teamNumber: number | null,
  season: number | null,
  region: string | null,
): TeamRankState {
  const key = teamNumber === null || season === null ? null : `${season}:${region ?? ''}:${teamNumber}`;
  const [state, setState] = useState<State>({ key: null, world: IDLE, region: IDLE });

  useEffect(() => {
    if (teamNumber === null || season === null) {
      setState({ key: null, world: IDLE, region: IDLE });
      return;
    }

    const controller = new AbortController();
    setState({ key, world: LOADING, region: region === null ? IDLE : LOADING });

    loadWorldRank(season, teamNumber)
      .then((place) => {
        if (controller.signal.aborted) return;
        setState((current) => ({ ...current, world: { status: place ? 'ready' : 'idle', place } }));
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setState((current) => ({ ...current, world: { status: 'error', place: null } }));
      });

    if (region !== null) {
      loadRegionRank(season, region, teamNumber)
        .then((place) => {
          if (controller.signal.aborted) return;
          setState((current) => ({ ...current, region: { status: place ? 'ready' : 'idle', place } }));
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setState((current) => ({ ...current, region: { status: 'error', place: null } }));
        });
    }

    return () => {
      controller.abort();
    };
  }, [teamNumber, season, region, key]);

  // Never show the previous team's places while the new ones are still loading.
  if (state.key !== key) {
    if (key === null) return { world: IDLE, region: IDLE };
    return { world: LOADING, region: region === null ? IDLE : LOADING };
  }
  return { world: state.world, region: state.region };
}
