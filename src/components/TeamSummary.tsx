import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { fmtPoints } from '../lib/format';
import type { TeamHoverState } from '../hooks/useTeamHover';

interface Props {
  state: TeamHoverState | null;
  hint?: string;
}

const CARD_WIDTH = 236;
const ESTIMATED_HEIGHT = 178;
const GAP = 12;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="teamcard__stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Small fixed-position summary shown while hovering a team. */
export function TeamSummary({ state, hint }: Props) {
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

  const style: CSSProperties = { width: CARD_WIDTH, left, top };

  const auto = Math.max(0, team.oprAuto);
  const teleop = Math.max(0, team.oprTeleop);

  return createPortal(
    <div className="teamcard" role="tooltip" style={style}>
      <header className="teamcard__head">
        <span className="teamcard__num">{team.teamNumber}</span>
        <span className="teamcard__name">{team.name || 'Unknown team'}</span>
      </header>
      {team.schoolName ? <p className="teamcard__school">{team.schoolName}</p> : null}

      <dl className="teamcard__stats">
        <Stat label="Rank" value={team.rank ? `#${team.rank}` : '—'} />
        <Stat label="Matches" value={String(team.matchesPlayed)} />
        <Stat label="OPR auto" value={team.hasOpr ? fmtPoints(auto) : '—'} />
        <Stat label="OPR teleop" value={team.hasOpr ? fmtPoints(teleop) : '—'} />
        <Stat label="OPR total" value={team.hasOpr ? fmtPoints(auto + teleop) : '—'} />
        <Stat label="Avg RP" value={team.rp === null ? '—' : fmtPoints(team.rp)} />
      </dl>

      {hint ? <p className="teamcard__hint">{hint}</p> : null}
    </div>,
    document.body,
  );
}
