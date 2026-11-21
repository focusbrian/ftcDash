import type { RawTeamAward, RawTeamAwardType } from '../api/raw';

export interface TeamAward {
  type: RawTeamAwardType;
  placement: number;
  divisionName: string | null;
  personName: string | null;
  eventCode: string;
  eventName: string;
  eventStart: string;
}

const LABELS: Record<RawTeamAwardType, string> = {
  DeansListFinalist: "Dean's List Finalist",
  DeansListSemiFinalist: "Dean's List Semi-Finalist",
  DeansListWinner: "Dean's List Winner",
  JudgesChoice: "Judges' Choice Award",
  DivisionFinalist: 'Division Finalist',
  DivisionWinner: 'Division Winner',
  ConferenceFinalist: 'Conference Finalist',
  Compass: 'Compass Award',
  Promote: 'Promote Award',
  Control: 'Control Award',
  Motivate: 'Motivate Award',
  Reach: 'Reach Award',
  Sustain: 'Sustain Award',
  Design: 'Design Award',
  Innovate: 'Innovate Award',
  Connect: 'Connect Award',
  Think: 'Think Award',
  TopRanked: 'Top Ranked',
  Inspire: 'Inspire Award',
  Winner: 'Winning Alliance',
  Finalist: 'Finalist Alliance',
};

/** Awards that exist only as a single honour, so an ordinal after them would read as noise. */
const UNPLACED = new Set<RawTeamAwardType>([
  'Winner',
  'Finalist',
  'DivisionWinner',
  'DivisionFinalist',
  'ConferenceFinalist',
]);

export function awardLabel(type: RawTeamAwardType): string {
  return LABELS[type] ?? type;
}

/** "1st", "2nd", "3rd", … for judged awards; empty for the unique alliance honours. */
export function placementLabel(type: RawTeamAwardType, placement: number): string {
  if (UNPLACED.has(type)) return '';
  if (!Number.isInteger(placement) || placement < 1) return '';
  const suffix =
    placement % 100 >= 11 && placement % 100 <= 13
      ? 'th'
      : placement % 10 === 1
        ? 'st'
        : placement % 10 === 2
          ? 'nd'
          : placement % 10 === 3
            ? 'rd'
            : 'th';
  return `${placement}${suffix}`;
}

/** Most recent event first, then the higher honour. */
export function sortAwards(awards: readonly TeamAward[]): TeamAward[] {
  return [...awards].sort(
    (a, b) =>
      b.eventStart.localeCompare(a.eventStart) ||
      a.placement - b.placement ||
      a.eventCode.localeCompare(b.eventCode) ||
      awardLabel(a.type).localeCompare(awardLabel(b.type)),
  );
}

export function normalizeAward(raw: RawTeamAward): TeamAward {
  return {
    type: raw.type,
    placement: raw.placement,
    divisionName: raw.divisionName,
    personName: raw.personName,
    eventCode: raw.event.code,
    eventName: raw.event.name,
    eventStart: raw.event.start,
  };
}
