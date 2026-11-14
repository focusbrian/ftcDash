/**
 * FTC Scout publishes season-specific score/stats types (one union member per game).
 * The season-invariant fields we care about exist on every member, so the query is
 * assembled from a single field list instead of hand-written fragments.
 */
const ALLIANCE_FIELDS = 'autoPoints dcPoints totalPoints totalPointsNp';

/** Score types that carry per-alliance (red/blue) breakdowns. */
const SCORE_TYPES_WITH_ALLIANCES = [
  'MatchScores2019',
  'MatchScores2020Trad',
  'MatchScores2021Trad',
  'MatchScores2022',
  'MatchScores2023',
  'MatchScores2024',
  'MatchScores2025',
  'MatchScores2026',
];

/** 2020/2021 remote seasons record a single alliance's run, so the score sits on the root type. */
const REMOTE_SCORE_TYPES = ['MatchScores2020Remote', 'MatchScores2021Remote'];

const STATS_TYPES = [
  'TeamEventStats2019',
  'TeamEventStats2020Trad',
  'TeamEventStats2020Remote',
  'TeamEventStats2021Trad',
  'TeamEventStats2021Remote',
  'TeamEventStats2022',
  'TeamEventStats2023',
  'TeamEventStats2024',
  'TeamEventStats2025',
  'TeamEventStats2026',
];

const scoreFragments = SCORE_TYPES_WITH_ALLIANCES.map(
  (type) => `
        ... on ${type} {
          red { ${ALLIANCE_FIELDS} }
          blue { ${ALLIANCE_FIELDS} }
        }`,
).join('');

const remoteScoreFragments = REMOTE_SCORE_TYPES.map(
  (type) => `
        ... on ${type} { ${ALLIANCE_FIELDS} }`,
).join('');

const statsFragments = STATS_TYPES.map(
  (type) => `
        ... on ${type} {
          rank
          rp
          qualMatchesPlayed
          opr { ${ALLIANCE_FIELDS} }
          dev { ${ALLIANCE_FIELDS} }
          tot { ${ALLIANCE_FIELDS} }
        }`,
).join('');

export const EVENT_QUERY = `
query EventData($season: Int!, $code: String!) {
  eventByCode(season: $season, code: $code) {
    code
    name
    start
    end
    timezone
    hasMatches
    location { venue city state country }
    matches {
      id
      matchNum
      tournamentLevel
      series
      description
      hasBeenPlayed
      scheduledStartTime
      actualStartTime
      teams { alliance station teamNumber surrogate noShow dq onField }
      scores {
        __typename${scoreFragments}${remoteScoreFragments}
      }
    }
    teams {
      teamNumber
      team { number name schoolName }
      stats {
        __typename${statsFragments}
      }
    }
  }
}`;

export const EVENTS_QUERY = `
query SeasonEvents($season: Int!, $limit: Int!) {
  eventsSearch(season: $season, limit: $limit) {
    code
    name
    start
    end
    type
    hasMatches
  }
}`;
