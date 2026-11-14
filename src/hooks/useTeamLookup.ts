import { useEffect, useState } from 'react';
import { gql } from '../api/client';

const TEAM_QUERY = `
query TeamName($number: Int!) {
  teamByNumber(number: $number) {
    number
    name
    schoolName
  }
}`;

interface TeamNameResult {
  teamByNumber: { number: number; name: string; schoolName: string } | null;
}

export interface TeamLookup {
  name: string | null;
  schoolName: string | null;
  loading: boolean;
}

/** Resolves a team number to a name so assets can be configured for teams outside the loaded event. */
export function useTeamLookup(teamNumber: number | null): TeamLookup {
  const [lookup, setLookup] = useState<TeamLookup>({ name: null, schoolName: null, loading: false });

  useEffect(() => {
    if (teamNumber === null) {
      setLookup({ name: null, schoolName: null, loading: false });
      return;
    }

    const controller = new AbortController();
    setLookup({ name: null, schoolName: null, loading: true });

    const timer = window.setTimeout(() => {
      gql<TeamNameResult>(TEAM_QUERY, { number: teamNumber }, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return;
          setLookup({
            name: result.teamByNumber?.name ?? null,
            schoolName: result.teamByNumber?.schoolName ?? null,
            loading: false,
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setLookup({ name: null, schoolName: null, loading: false });
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [teamNumber]);

  return lookup;
}
