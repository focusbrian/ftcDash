import { useEffect, useMemo, useRef, useState } from 'react';
import { cachedSeasonOpr, loadSeasonOpr } from '../api/seasonOpr';
import type { SeasonOprFallback } from '../lib/teams';
import type { TeamStrength } from '../types';

/** Series fetched at once: enough to keep a big event moving, few enough to stay polite. */
const BATCH = 6;

interface State {
  key: string;
  values: SeasonOprFallback;
}

const NONE: SeasonOprFallback = new Map();

/**
 * The most recent OPR of every team that has none at this event yet, so projections have something
 * to work with before the first match is scored. Reads and fills the shared season cache, so the
 * hover card and the rankings re-use exactly these numbers.
 */
export function useSeasonOprFallback(
  teams: readonly TeamStrength[],
  season: number | null,
): SeasonOprFallback {
  const pending = useMemo(
    () => teams.filter((team) => !team.hasOpr).map((team) => team.teamNumber),
    [teams],
  );
  const key = season === null ? '' : `${season}:${pending.join(',')}`;

  // The list is only read by the effect, which is keyed by the cheaper string above.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const [state, setState] = useState<State>({ key: '', values: NONE });

  useEffect(() => {
    if (season === null) {
      setState({ key, values: NONE });
      return;
    }

    const teamNumbers = pendingRef.current;
    if (teamNumbers.length === 0) {
      setState({ key, values: NONE });
      return;
    }

    const controller = new AbortController();
    const values: SeasonOprFallback = new Map();
    const missing: number[] = [];

    for (const teamNumber of teamNumbers) {
      const series = cachedSeasonOpr(season, teamNumber);
      if (series === undefined) {
        missing.push(teamNumber);
        continue;
      }
      const latest = series.at(-1);
      if (latest) values.set(teamNumber, { auto: latest.auto, teleop: latest.teleop, total: latest.total });
    }

    setState({ key, values: new Map(values) });
    if (missing.length === 0) return;

    const load = async () => {
      for (let at = 0; at < missing.length; at += BATCH) {
        const batch = missing.slice(at, at + BATCH);
        const loaded = await Promise.all(
          batch.map(async (teamNumber) => {
            const series = await loadSeasonOpr(season, teamNumber, controller.signal).catch(
              () => null,
            );
            return [teamNumber, series] as const;
          }),
        );
        if (controller.signal.aborted) return;
        for (const [teamNumber, series] of loaded) {
          const latest = series?.at(-1);
          if (latest) {
            values.set(teamNumber, { auto: latest.auto, teleop: latest.teleop, total: latest.total });
          }
        }
        setState({ key, values: new Map(values) });
      }
    };
    void load();

    return () => controller.abort();
  }, [key, season]);

  return state.key === key ? state.values : NONE;
}
