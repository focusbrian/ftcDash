import { useMemo } from 'react';
import firstLogo from '../assets/first-logo.webp';
import { TeamSummary } from './TeamSummary';
import { useTeamHover } from '../hooks/useTeamHover';
import { fmtPoints, fmtTime, groupByLevel, matchShortLabel, singleAllianceLabel } from '../lib/format';
import type { AssetStore } from '../lib/assets';
import type { EventRecords } from '../lib/records';
import type { MatchView, SideView } from '../lib/model';

interface Props {
  views: MatchView[];
  selectedId: number | null;
  highlightTeams: readonly number[];
  timezone: string;
  assets: AssetStore;
  records: EventRecords;
  onSelect: (matchId: number) => void;
}

function hasProjectionData(side: SideView): boolean {
  return side.entries.some((entry) => !entry.noShow && entry.strength?.hasOpr);
}

function sideTotal(side: SideView, projected: boolean): string {
  if (projected && !hasProjectionData(side)) return '—';
  return fmtPoints(side.total, projected ? 1 : 0);
}

export function MatchList({
  views,
  selectedId,
  highlightTeams,
  timezone,
  assets,
  records,
  onSelect,
}: Props) {
  const groups = useMemo(() => groupByLevel(views, (view) => view.match.level), [views]);
  const highlightSet = useMemo(() => new Set(highlightTeams), [highlightTeams]);
  const { hovered, show, hide } = useTeamHover();

  if (views.length === 0) {
    return (
      <p className="empty">
        No matches have been published for this event yet. FTC Scout usually adds the schedule a
        few days before the event starts.
      </p>
    );
  }

  return (
    <div className={highlightSet.size === 0 ? 'matches' : 'matches matches--focused'}>
      {groups.map((group) => (
        <section key={group.level} className="matches__group">
          <h3 className="matches__title">
            {group.label}
            <span className="matches__count">{group.items.length}</span>
          </h3>
          {group.items.map((view) => {
            const topTotal = Math.max(...view.sides.map((side) => side.total));
            const highlighted =
              highlightSet.size > 0 &&
              view.sides.some((side) =>
                side.entries.some((entry) => highlightSet.has(entry.teamNumber)),
              );
            const isHighTotal = records.total.matches.has(view.match.id);
            const isHighAuto = records.auto.matches.has(view.match.id);
            const isHighTeleop = records.teleop.matches.has(view.match.id);
            const hasRecord = isHighTotal || isHighAuto || isHighTeleop;

            return (
              <button
                key={view.match.id}
                type="button"
                className={highlighted ? 'card card--highlight' : 'card'}
                aria-pressed={view.match.id === selectedId}
                onClick={() => onSelect(view.match.id)}
              >
                <span className="card__head">
                  <span className="card__label">
                    {matchShortLabel(view.match)}
                    {singleAllianceLabel(view.match)}
                  </span>
                  <span className="card__time">
                    {fmtTime(view.match.scheduledStartTime, timezone)}
                  </span>
                  {hasRecord ? (
                    <span className="card__records">
                      {isHighTotal ? (
                        <span
                          className="card__record card__record--total"
                          role="img"
                          aria-label="Highest alliance score at this event"
                          title={`Highest alliance score at this event: ${fmtPoints(records.total.value)}`}
                        >
                          ★
                        </span>
                      ) : null}
                      {isHighAuto ? (
                        <span
                          className="card__record card__record--auto"
                          role="img"
                          aria-label="Highest autonomous score at this event"
                          title={`Highest autonomous score at this event: ${fmtPoints(records.auto.value)}`}
                        >
                          ★
                        </span>
                      ) : null}
                      {isHighTeleop ? (
                        <span
                          className="card__record card__record--teleop"
                          role="img"
                          aria-label="Highest teleop score at this event"
                          title={`Highest teleop score at this event: ${fmtPoints(records.teleop.value)}`}
                        >
                          ★
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {view.projected ? (
                    <span className="chip chip--proj" title="Projected from team OPR">
                      PROJ
                    </span>
                  ) : (
                    <span className="chip chip--final">FINAL</span>
                  )}
                </span>
                {view.sides.map((side) => (
                  <span
                    key={side.alliance}
                    className={`card__side card__side--${side.alliance.toLowerCase()}`}
                  >
                    <span className="card__teams">
                      {side.entries
                        .filter((entry) => !entry.noShow)
                        .map((entry) => {
                          const logo = assets[String(entry.teamNumber)]?.logo;
                          return (
                            <span
                              key={`${entry.teamNumber}-${entry.station}`}
                              className={
                                highlightSet.has(entry.teamNumber)
                                  ? 'card__team card__team--on'
                                  : 'card__team'
                              }
                              onMouseEnter={(event) => show(entry.strength, event.currentTarget)}
                              onMouseLeave={hide}
                            >
                              {logo ? (
                                <img
                                  className="card__team-logo"
                                  src={logo}
                                  alt=""
                                  title={`Team ${entry.teamNumber} logo`}
                                />
                              ) : (
                                <img
                                  className="card__team-logo card__team-logo--placeholder"
                                  src={firstLogo}
                                  alt=""
                                  title="No team logo yet — showing the FIRST logo"
                                />
                              )}
                              {entry.teamNumber}
                            </span>
                          );
                        })}
                    </span>
                    <span
                      className={`card__total${
                        view.sides.length > 1 && side.total === topTotal && topTotal > 0
                          ? ' card__total--lead'
                          : ''
                      }`}
                    >
                      {sideTotal(side, view.projected)}
                    </span>
                  </span>
                ))}
              </button>
            );
          })}
        </section>
      ))}
      <TeamSummary state={hovered} />
    </div>
  );
}
