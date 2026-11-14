export type RouteView = 'dashboard' | 'config';

export interface Route {
  view: RouteView;
  season: number;
  code: string | null;
  matchId: number | null;
}

/** FTC seasons are named for the calendar year the game launches (Sept–Apr). */
export function defaultSeason(date = new Date()): number {
  return date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
}

export function parseRoute(hash: string): Route {
  const segments = hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  if (segments[0] === 'config') {
    return { view: 'config', season: defaultSeason(), code: null, matchId: null };
  }

  const season = Number(segments[0]);
  const code = segments[1] ? segments[1].toUpperCase() : null;
  const matchIndex = segments.indexOf('m');
  const matchId = matchIndex >= 0 ? Number(segments[matchIndex + 1]) : NaN;

  return {
    view: 'dashboard',
    season: Number.isInteger(season) && season > 2000 ? season : defaultSeason(),
    code,
    matchId: Number.isInteger(matchId) ? matchId : null,
  };
}

export function buildHash(route: Route): string {
  if (route.view === 'config') return '#/config';

  const parts = [`#/${route.season}`];
  if (route.code) parts.push(route.code);
  if (route.code && route.matchId !== null) parts.push('m', String(route.matchId));
  return parts.join('/');
}
