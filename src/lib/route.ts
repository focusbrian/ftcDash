export type RouteView = 'home' | 'dashboard' | 'config' | 'admin' | 'auto';

export interface Route {
  view: RouteView;
  season: number;
  code: string | null;
  matchId: number | null;
  /** Team whose page is open in the detail panel, when one is. */
  teamNumber: number | null;
}

/** FTC seasons are named for the calendar year the game launches (Sept–Apr). */
export function defaultSeason(date = new Date()): number {
  return date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
}

/** FTC Scout's earliest season; asking it for anything older fails the whole query. */
export const EARLIEST_SEASON = 2019;

export function parseRoute(hash: string): Route {
  const segments = hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  // No season and no event: the landing page, not an auto-picked event.
  if (segments.length === 0) {
    return { view: 'home', season: defaultSeason(), code: null, matchId: null, teamNumber: null };
  }

  if (segments[0] === 'config') {
    return { view: 'config', season: defaultSeason(), code: null, matchId: null, teamNumber: null };
  }

  // Unlinked on purpose: the shared-asset editor is reached by typing the hash.
  if (segments[0] === 'admin') {
    return { view: 'admin', season: defaultSeason(), code: null, matchId: null, teamNumber: null };
  }

  // Unlinked too: the autonomous planner for the current season's field.
  if (segments[0] === 'auto') {
    return { view: 'auto', season: defaultSeason(), code: null, matchId: null, teamNumber: null };
  }

  const season = Number(segments[0]);
  const code = segments[1] ? segments[1].toUpperCase() : null;
  const matchIndex = segments.indexOf('m');
  const matchId = matchIndex >= 0 ? Number(segments[matchIndex + 1]) : NaN;
  const teamIndex = segments.indexOf('t');
  const teamNumber = teamIndex >= 0 ? Number(segments[teamIndex + 1]) : NaN;

  // The planner opened from an event keeps that event in the route, so Back returns to it:
  // `#/2026/USMISCO/auto` (and `#/2026/auto` when no event was open).
  const autoSegment = segments[segments.length - 1]?.toLowerCase();
  if (autoSegment === 'auto' && segments.length <= 3) {
    const autoCode = segments.length === 3 ? code : null;
    return {
      view: 'auto',
      season: Number.isInteger(season) && season > 2000 ? season : defaultSeason(),
      code: autoCode,
      matchId: null,
      teamNumber: null,
    };
  }

  return {
    view: 'dashboard',
    season: Number.isInteger(season) && season > 2000 ? season : defaultSeason(),
    code,
    matchId: Number.isInteger(matchId) ? matchId : null,
    teamNumber: Number.isInteger(teamNumber) && teamNumber > 0 ? teamNumber : null,
  };
}

export function buildHash(route: Route): string {
  if (route.view === 'config') return '#/config';
  if (route.view === 'admin') return '#/admin';
  // The planner remembers which event it was opened from; with none, the plain form still works.
  if (route.view === 'auto') {
    return route.code ? `#/${route.season}/${route.code}/auto` : '#/auto';
  }
  if (route.view === 'home') return '#/';

  const parts = [`#/${route.season}`];
  if (route.code) parts.push(route.code);
  if (route.code && route.matchId !== null) parts.push('m', String(route.matchId));
  if (route.code && route.teamNumber !== null) parts.push('t', String(route.teamNumber));
  return parts.join('/');
}
