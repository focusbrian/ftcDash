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
    address
    website
    liveStreamURL
    type
    fieldCount
    regionCode
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

/** Every event one team attended in a season — powers searching the picker by team number. */
export const TEAM_EVENTS_QUERY = `
query TeamEvents($season: Int!, $number: Int!) {
  teamByNumber(number: $number) {
    number
    name
    events(season: $season) {
      event {
        code
        name
        start
        end
        type
        hasMatches
      }
    }
  }
}`;

/** OPR at each event of a season, oldest first — the season sparkline in the team hover card. */
export const TEAM_OPR_HISTORY_QUERY = `
query TeamOprHistory($season: Int!, $number: Int!) {
  teamByNumber(number: $number) {
    number
    events(season: $season) {
      event {
        code
        name
        start
      }
      stats {
        __typename${statsFragments}
      }
    }
  }
}`;

/** What one team won across a season — the awards list on its page. */
export const TEAM_AWARDS_QUERY = `
query TeamAwards($season: Int!, $number: Int!) {
  teamByNumber(number: $number) {
    number
    awards(season: $season) {
      type
      placement
      divisionName
      personName
      event {
        code
        name
        start
      }
    }
  }
}`;

/** The season's published OPR total and the rank FTC Scout gives it worldwide. */
export const TEAM_RANK_QUERY = `
query TeamRank($season: Int!, $number: Int!) {
  teamByNumber(number: $number) {
    number
    quickStats(season: $season) {
      count
      tot { value rank }
    }
  }
}`;

/** Every team in one region with its OPR total, so a regional rank can be counted out of them. */
export const REGION_TEAMS_QUERY = `
query RegionTeams($season: Int!, $region: RegionOption!) {
  teamsSearch(region: $region) {
    number
    quickStats(season: $season) {
      tot { value }
    }
  }
}`;
