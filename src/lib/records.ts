import type { MatchView, SideView } from './model';

export interface RecordEntry {
  /** The best value seen at the event, or 0 when nothing qualifies. */
  value: number;
  /** Ids of the matches that reached that value. */
  matches: Set<number>;
}

export interface EventRecords {
  /** Highest single-alliance match total. */
  total: RecordEntry;
  /** Highest autonomous score for one alliance. */
  auto: RecordEntry;
  /** Highest driver-controlled score for one alliance. */
  teleop: RecordEntry;
}

/**
 * Remote seasons recorded one alliance total with no auto/teleop split, so those scores must not be
 * mistaken for zero-point autonomous or teleop runs.
 */
function hasBreakdown(side: SideView): boolean {
  return !(side.auto === 0 && side.teleop === 0 && side.total > 0);
}

function best(views: readonly MatchView[], pick: (side: SideView) => number | null): RecordEntry {
  let value = 0;
  const matches = new Set<number>();

  for (const view of views) {
    for (const side of view.sides) {
      const score = pick(side);
      if (score === null || score <= 0) continue;

      if (score > value) {
        value = score;
        matches.clear();
      }
      if (score === value) matches.add(view.match.id);
    }
  }

  return { value, matches };
}

/** Matches holding the event's high score, high autonomous and high teleop, from played matches only. */
export function eventRecords(views: readonly MatchView[]): EventRecords {
  const scored = views.filter((view) => !view.projected);

  return {
    total: best(scored, (side) => side.total),
    auto: best(scored, (side) => (hasBreakdown(side) ? side.auto : null)),
    teleop: best(scored, (side) => (hasBreakdown(side) ? side.teleop : null)),
  };
}
