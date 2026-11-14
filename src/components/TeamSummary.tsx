import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Sparkline } from './Sparkline';
import { useEventCharts } from './EventChartsContext';
import { useTeamOprHistory } from '../hooks/useTeamOprHistory';
import { fmtPoints } from '../lib/format';
import { rollingOprForTeam } from '../lib/opr';
import type { TeamHoverState } from '../hooks/useTeamHover';

interface Props {
  state: TeamHoverState | null;
  hint?: string;
  /** Opened by an info button rather than hover: centred sheet with a backdrop. */
  pinned?: boolean;
  onClose?: () => void;
}

const CARD_WIDTH = 268;
const ESTIMATED_HEIGHT = 366;
const GAP = 12;

/** Colours shared with the record stars on the schedule cards. */
const AUTO_COLOR = '#6fb3f2';
const TELEOP_COLOR = '#4ade80';
const TOTAL_COLOR = '#ffc861';

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

  const seasonSeries = [
    { label: 'Auton', color: AUTO_COLOR, values: seasonOpr.points.map((point) => point.auto) },
    { label: 'Teleop', color: TELEOP_COLOR, values: seasonOpr.points.map((point) => point.teleop) },
    { label: 'Total', color: TOTAL_COLOR, values: seasonOpr.points.map((point) => point.total) },
  ];
  const eventSeries = [
    { label: 'Auton', color: AUTO_COLOR, values: eventOpr.map((point) => point.auto) },
    { label: 'Teleop', color: TELEOP_COLOR, values: eventOpr.map((point) => point.teleop) },
    { label: 'Total', color: TOTAL_COLOR, values: eventOpr.map((point) => point.total) },
  ];

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
          <Stat label="OPR auto" value={team.hasOpr ? fmtPoints(auto) : '—'} tone={AUTO_COLOR} />
          <Stat
            label="OPR teleop"
            value={team.hasOpr ? fmtPoints(teleop) : '—'}
            tone={TELEOP_COLOR}
          />
          <Stat
            label="OPR total"
            value={team.hasOpr ? fmtPoints(auto + teleop) : '—'}
            tone={TOTAL_COLOR}
          />
          <Stat label="Avg RP" value={team.rp === null ? '—' : fmtPoints(team.rp)} />
        </dl>

        <Sparkline
          title="OPR by event"
          caption={
            seasonOpr.status === 'loading'
              ? 'loading…'
              : seasonOpr.status === 'error'
                ? 'unavailable'
                : countLabel(seasonOpr.points.length, 'event', 'events')
          }
          empty={
            seasonOpr.status === 'loading'
              ? 'Loading season OPR…'
              : seasonOpr.status === 'error'
                ? 'Season OPR unavailable'
                : 'No other events this season'
          }
          series={seasonSeries}
        />
        <Sparkline
          title="OPR this event"
          caption={countLabel(eventOpr.length, 'match', 'matches')}
          empty="No qualification matches yet"
          series={eventSeries}
        />

        {hint ? <p className="teamcard__hint">{hint}</p> : null}
      </div>
    </>,
    document.body,
  );
}
