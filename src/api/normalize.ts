import type {
  RawEvent,
  RawEventParticipation,
  RawMatch,
  RawScores,
  RawScoreValues,
  RawTeamStats,
} from './raw';
import type {
  Alliance,
  EventData,
  Match,
  MatchSide,
  MatchTeamEntry,
  RealScores,
  Station,
  TeamStrength,
  TournamentLevel,
} from '../types';

const ALLIANCE_ORDER: Alliance[] = ['Red', 'Blue', 'Solo'];

const LEVEL_ORDER: Record<TournamentLevel, number> = {
  Quals: 0,
  DoubleElim: 1,
  Semis: 2,
  Finals: 3,
};

function toLevel(value: string): TournamentLevel {
  return value === 'Semis' || value === 'Finals' || value === 'DoubleElim' ? value : 'Quals';
}

function toAlliance(value: string): Alliance {
  return value === 'Red' || value === 'Blue' ? value : 'Solo';
}

function toStation(value: string): Station {
  return value === 'One' || value === 'Two' || value === 'Solo' ? value : 'NotOnField';
}

function scoreGroup(stats: RawTeamStats | null, key: 'opr' | 'dev') {
  return stats?.[key] ?? null;
}

export function normalizeTeamStrength(participation: RawEventParticipation): TeamStrength {
  const stats = participation.stats;
  const opr = scoreGroup(stats, 'opr');
  const dev = scoreGroup(stats, 'dev');

  return {
    teamNumber: participation.teamNumber,
    name: participation.team.name,
    schoolName: participation.team.schoolName,
    rank: stats && stats.rank > 0 ? stats.rank : null,
    rp: stats ? stats.rp : null,
    matchesPlayed: stats?.qualMatchesPlayed ?? 0,
    oprAuto: opr?.autoPoints ?? 0,
    oprTeleop: opr?.dcPoints ?? 0,
    sigma: Math.max(0, dev?.totalPointsNp ?? dev?.totalPoints ?? 0),
    hasOpr: opr !== null,
  };
}

export function normalizeScores(
  scores: RawScores | null,
  alliance: 'red' | 'blue' | 'solo',
): RealScores | null {
  if (!scores) return null;

  let side: RawScoreValues | null | undefined;
  if (alliance === 'solo') {
    // Remote seasons put the single alliance's score on the score object itself.
    side = typeof scores.autoPoints === 'number' ? (scores as RawScoreValues) : null;
  } else {
    side = scores[alliance];
  }

  if (!side) return null;
  return {
    auto: side.autoPoints,
    teleop: side.dcPoints,
    penalties: Math.max(0, side.totalPoints - side.totalPointsNp),
    total: side.totalPoints,
  };
}

export function normalizeMatch(raw: RawMatch, teamNames: Map<number, string>): Match {
  const grouped = new Map<Alliance, MatchTeamEntry[]>();

  for (const team of raw.teams) {
    const alliance = toAlliance(team.alliance);
    const entries = grouped.get(alliance) ?? [];
    entries.push({
      teamNumber: team.teamNumber,
      name: teamNames.get(team.teamNumber) ?? '',
      alliance,
      station: toStation(team.station),
      surrogate: team.surrogate,
      noShow: team.noShow,
      dq: team.dq,
      onField: team.onField,
    });
    grouped.set(alliance, entries);
  }

  const sides: MatchSide[] = ALLIANCE_ORDER.filter((alliance) => grouped.has(alliance)).map(
    (alliance) => ({
      alliance,
      entries: (grouped.get(alliance) ?? []).sort((a, b) => a.station.localeCompare(b.station)),
      scores: normalizeScores(raw.scores, alliance.toLowerCase() as 'red' | 'blue' | 'solo'),
    }),
  );

  return {
    id: raw.id,
    matchNum: raw.matchNum,
    level: toLevel(raw.tournamentLevel),
    series: raw.series,
    description: raw.description,
    played: raw.hasBeenPlayed,
    scheduledStartTime: raw.scheduledStartTime,
    actualStartTime: raw.actualStartTime,
    sides,
  };
}

export function compareMatches(a: Match, b: Match): number {
  const byLevel = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
  if (byLevel !== 0) return byLevel;
  const bySeries = a.series - b.series;
  if (bySeries !== 0) return bySeries;
  return a.matchNum - b.matchNum;
}

export interface PlayedMatchInfo {
  id: number;
  played: boolean;
  actualStartTime: string | null;
  scheduledStartTime: string | null;
}

/**
 * The match that was played most recently, by actual start time (falling back to the
 * scheduled time, then to list order). Used by "follow the latest result".
 */
export function latestPlayedMatchId(matches: readonly PlayedMatchInfo[]): number | null {
  let bestId: number | null = null;
  let bestTime = '';

  for (const match of matches) {
    if (!match.played) continue;
    const time = match.actualStartTime ?? match.scheduledStartTime ?? '';
    if (bestId === null || time >= bestTime) {
      bestId = match.id;
      bestTime = time;
    }
  }
  return bestId;
}

export function normalizeEvent(raw: RawEvent, season: number): EventData {
  const teams = new Map<number, TeamStrength>();
  const names = new Map<number, string>();

  for (const participation of raw.teams) {
    teams.set(participation.teamNumber, normalizeTeamStrength(participation));
    names.set(participation.teamNumber, participation.team.name);
  }

  const matches = raw.matches
    .map((match) => normalizeMatch(match, names))
    .sort(compareMatches);

  return {
    season,
    code: raw.code,
    name: raw.name,
    start: raw.start,
    end: raw.end,
    timezone: raw.timezone,
    address: raw.address ?? null,
    website: raw.website ?? null,
    liveStreamUrl: raw.liveStreamURL ?? null,
    type: raw.type ?? '',
    fieldCount: raw.fieldCount ?? null,
    location: raw.location,
    teams,
    matches,
  };
}
