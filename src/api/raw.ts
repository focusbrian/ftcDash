/** Shapes returned by https://api.ftcscout.org/graphql. Only the fields we request are declared. */

export interface RawStatGroup {
  autoPoints: number;
  dcPoints: number;
  totalPoints: number;
  totalPointsNp: number;
}

export interface RawScoreValues {
  autoPoints: number;
  dcPoints: number;
  totalPoints: number;
  totalPointsNp: number;
}

export interface RawScores extends Partial<RawScoreValues> {
  __typename: string;
  red?: RawScoreValues | null;
  blue?: RawScoreValues | null;
}

export interface RawMatchTeam {
  alliance: string;
  station: string;
  teamNumber: number;
  surrogate: boolean;
  noShow: boolean;
  dq: boolean;
  onField: boolean;
}

export interface RawMatch {
  id: number;
  matchNum: number;
  tournamentLevel: string;
  series: number;
  description: string;
  hasBeenPlayed: boolean;
  scheduledStartTime: string | null;
  actualStartTime: string | null;
  teams: RawMatchTeam[];
  scores: RawScores | null;
}

export interface RawTeamStats {
  rank: number;
  rp: number;
  qualMatchesPlayed: number;
  opr: RawStatGroup | null;
  dev: RawStatGroup | null;
  tot: RawStatGroup | null;
}

export interface RawEventParticipation {
  teamNumber: number;
  team: { number: number; name: string; schoolName: string };
  stats: RawTeamStats | null;
}

export interface RawEvent {
  code: string;
  name: string;
  start: string;
  end: string;
  timezone: string;
  hasMatches: boolean;
  address: string | null;
  website: string | null;
  liveStreamURL: string | null;
  type: string;
  fieldCount: number | null;
  location: { venue: string | null; city: string; state: string; country: string };
  matches: RawMatch[];
  teams: RawEventParticipation[];
}

export interface RawEventSummary {
  code: string;
  name: string;
  start: string;
  end: string;
  type: string;
  hasMatches: boolean;
}

export interface RawTeamSeason {
  number: number;
  name: string;
  events: { event: RawEventSummary }[];
}

export interface RawTeamOprEvent {
  event: { code: string; name: string; start: string };
  stats: RawTeamStats | null;
}

export interface RawTeamOprHistory {
  number: number;
  events: RawTeamOprEvent[];
}
