import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Sparkline } from './Sparkline';
import { useEventCharts } from './EventChartsContext';
import { useTeamOprHistory } from '../hooks/useTeamOprHistory';
import { fmtPoints } from '../lib/format';
import { rollingOprForTeam } from '../lib/opr';
import { OPR_COLORS, eventSparkSeries, seasonSparkSeries } from '../lib/oprSeries';
import type { TeamHoverState } from '../hooks/useTeamHover';

interface Props {
  state: TeamHoverState | null;
  hint?: string;
  /** Opened by an info button rather than hover: centred sheet with a backdrop. */
  pinned?: boolean;
  onClose?: () => void;
}

const CARD_WIDTH = 268;
const ESTIMATED_HEIGHT = 380;
const GAP = 12;

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="teamcard__stat">
      <dt>{label}</dt>
      <dd style={tone ? { color: tone } : undefined}>{value}</dd>
    </div>
  );
}

function countLabel(count: number, one: string, many: string): string {
  if (count === 0) return 'none yet';
  return `${count} ${count === 1 ? one : many}`;
}

/** Small fixed-position summary shown while hovering a team, or as a sheet when tapped open. */
export function TeamSummary({ state, hint, pinned = false, onClose }: Props) {
  const charts = useEventCharts();
  const teamNumber = state?.team.teamNumber ?? null;
  const season = charts?.season ?? null;
  const seasonOpr = useTeamOprHistory(teamNumber, season);

  const eventOpr = useMemo(() => {
    if (!charts || teamNumber === null) return [];
    return rollingOprForTeam(charts.views, teamNumber);
  }, [charts, teamNumber]);

  const seasonLines = useMemo(() => seasonSparkSeries(seasonOpr.points), [seasonOpr.points]);
  const eventLines = useMemo(() => eventSparkSeries(eventOpr), [eventOpr]);

  if (!state) return null;

  const { team, rect } = state;
  const viewportWidth = typeof window === 'undefined' ? CARD_WIDTH : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;

  // Sit beside the row so the summary never hides the team it describes, and fall
  // back to the other side when there is no room.
  const maxLeft = Math.max(8, viewportWidth - CARD_WIDTH - 8);
  const beside = rect.right + GAP;
  const left =
    beside <= maxLeft
      ? beside
      : rect.left - CARD_WIDTH - GAP >= 8
        ? rect.left - CARD_WIDTH - GAP
        : Math.min(Math.max(8, rect.left), maxLeft);
  const top = Math.min(
    Math.max(8, rect.top - 6),
    Math.max(8, viewportHeight - ESTIMATED_HEIGHT - 8),
  );

  const style: CSSProperties | undefined = pinned
    ? undefined
    : { width: CARD_WIDTH, left, top };

  const auto = Math.max(0, team.oprAuto);
  const teleop = Math.max(0, team.oprTeleop);

  const seasonEventCount = seasonOpr.points.filter((point) => point.kind !== 'prior').length;
  const pending = seasonOpr.points.filter((point) => point.kind === 'estimate').length;
  const anchor = seasonOpr.points.find((point) => point.kind === 'prior') ?? null;
  const seasonNote = [
    anchor ? `${anchor.season} OPR as the start` : null,
    pending > 0 ? `${countLabel(pending, 'event', 'events')} without OPR yet` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return createPortal(
    <>
      {pinned ? <div className="teamcard__backdrop" onPointerDown={onClose} /> : null}
      <div
        className={pinned ? 'teamcard teamcard--pinned' : 'teamcard'}
        role={pinned ? 'dialog' : 'tooltip'}
        aria-label={pinned ? `Team ${team.teamNumber} summary` : undefined}
        style={style}
      >
        <header className="teamcard__head">
          <span className="teamcard__num">{team.teamNumber}</span>
          <span className="teamcard__name">{team.name || 'Unknown team'}</span>
          {pinned ? (
            <button
              type="button"
              className="teamcard__close"
              aria-label="Close team summary"
              onClick={onClose}
            >
              ×
            </button>
          ) : null}
        </header>

        {team.schoolName ? <p className="teamcard__school">{team.schoolName}</p> : null}

        <dl className="teamcard__stats">
          <Stat label="Rank" value={team.rank ? `#${team.rank}` : '—'} />
          <Stat label="Matches" value={String(team.matchesPlayed)} />
          <Stat label="OPR auto" value={team.hasOpr ? fmtPoints(auto) : '—'} tone={OPR_COLORS.auto} />
          <Stat
            label="OPR teleop"
            value={team.hasOpr ? fmtPoints(teleop) : '—'}
            tone={OPR_COLORS.teleop}
          />
          <Stat
            label="OPR total"
            value={team.hasOpr ? fmtPoints(auto + teleop) : '—'}
            tone={OPR_COLORS.total}
          />
          <Stat label="Rank pts" value={team.rp === null ? '—' : fmtPoints(team.rp)} />
        </dl>

        {team.oprFromSeason ? (
          <p className="teamcard__note">OPR from the season so far — this event has none yet.</p>
        ) : null}

        <Sparkline
          title="OPR by event"
          caption={
            seasonOpr.status === 'loading'
              ? 'loading…'
              : seasonOpr.status === 'error'
                ? 'unavailable'
                : countLabel(seasonEventCount, 'event', 'events')
          }
          empty={
            seasonOpr.status === 'loading'
              ? 'Loading season OPR…'
              : seasonOpr.status === 'error'
                ? 'Season OPR unavailable'
                : 'No OPR published yet'
          }
          series={seasonLines}
          note={seasonOpr.status === 'ready' ? seasonNote : undefined}
        />
        <Sparkline
          title="OPR this event"
          caption={countLabel(eventOpr.length, 'match', 'matches')}
          empty="No qualification matches yet"
          series={eventLines}
        />

        {hint ? <p className="teamcard__hint">{hint}</p> : null}
      </div>
    </>,
    document.body,
  );
}
