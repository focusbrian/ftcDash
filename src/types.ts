export type Alliance = 'Red' | 'Blue' | 'Solo';

export type Station = 'One' | 'Two' | 'NotOnField' | 'Solo';

export type TournamentLevel = 'Quals' | 'Semis' | 'Finals' | 'DoubleElim';

/** Per-team, per-event strength derived from FTC Scout's OPR regression. */
export interface TeamStrength {
  teamNumber: number;
  name: string;
  schoolName: string;
  rank: number | null;
  rp: number | null;
  matchesPlayed: number;
  oprAuto: number;
  oprTeleop: number;
  /** Standard deviation of match totals, used for forecast confidence. */
  sigma: number;
  hasOpr: boolean;
}

export interface MatchTeamEntry {
  teamNumber: number;
  name: string;
  alliance: Alliance;
  station: Station;
  surrogate: boolean;
  noShow: boolean;
  dq: boolean;
  onField: boolean;
}

/** Recorded score for one alliance. `teleop` is driver-controlled (DC) play. */
export interface RealScores {
  auto: number;
  teleop: number;
  penalties: number;
  total: number;
}

export interface MatchSide {
  alliance: Alliance;
  entries: MatchTeamEntry[];
  scores: RealScores | null;
}

export interface Match {
  id: number;
  matchNum: number;
  level: TournamentLevel;
  series: number;
  description: string;
  played: boolean;
  scheduledStartTime: string | null;
  actualStartTime: string | null;
  sides: MatchSide[];
}

export interface EventLocation {
  venue: string | null;
  city: string;
  state: string;
  country: string;
}

export interface EventData {
  season: number;
  code: string;
  name: string;
  start: string;
  end: string;
  timezone: string;
  location: EventLocation;
  teams: Map<number, TeamStrength>;
  matches: Match[];
}

export interface EventSummary {
  code: string;
  name: string;
  start: string;
  end: string;
  type: string;
  hasMatches: boolean;
}
