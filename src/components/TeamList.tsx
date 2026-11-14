import firstLogo from '../assets/first-logo.webp';
import { InfoIcon } from './InfoIcon';
import { TeamSummary } from './TeamSummary';
import { useTeamHover } from '../hooks/useTeamHover';
import { fmtPoints } from '../lib/format';
import type { AssetStore } from '../lib/assets';
import type { TeamStrength } from '../types';

interface Props {
  teams: readonly TeamStrength[];
  highlightTeams: readonly number[];
  assets: AssetStore;
  onToggleTeam: (teamNumber: number) => void;
}

/**
 * The row's OPR column. A team with no OPR at this event yet carries its season OPR instead, in
 * parentheses — the same way the hover card marks a carried value.
 */
function OprCells({ team }: { team: TeamStrength }) {
  const auto = Math.max(0, team.oprAuto);
  const teleop = Math.max(0, team.oprTeleop);
  const total = fmtPoints(auto + teleop);
  const split = `Auton ${fmtPoints(auto)} · Teleop ${fmtPoints(teleop)}`;

  return (
    <>
      <span className="teamrow__opr">
        <span className="teamrow__total">
          {team.hasOpr ? (team.oprFromSeason ? `(${total})` : total) : '—'}
        </span>
        <span className="teamrow__total-label">OPR</span>
      </span>
      <span className="teamrow__detail">
        {team.hasOpr ? (team.oprFromSeason ? `Season OPR · ${split}` : split) : 'No OPR published yet'}
        {team.rp === null ? '' : ` · RP ${fmtPoints(team.rp)}`}
        {team.matchesPlayed > 0
          ? ` · ${team.matchesPlayed} match${team.matchesPlayed === 1 ? '' : 'es'}`
          : ''}
      </span>
    </>
  );
}

export function TeamList({ teams, highlightTeams, assets, onToggleTeam }: Props) {
  const highlighted = new Set(highlightTeams);
  const { hovered, pinned, show, hide, togglePin, unpin } = useTeamHover();

  if (teams.length === 0) {
    return (
      <p className="empty">
        No teams have been published for this event yet. FTC Scout usually adds them a few days
        before the event starts.
      </p>
    );
  }

  return (
    <div className="teams">
      <ul className="teams__list">
        {teams.map((team) => {
          const logo = assets[String(team.teamNumber)]?.logo;
          const isOn = highlighted.has(team.teamNumber);
          const isOpen = pinned && hovered?.team.teamNumber === team.teamNumber;

          return (
            <li key={team.teamNumber} className={isOn ? 'teams__row teams__row--on' : 'teams__row'}>
              <button
                type="button"
                className="teamrow"
                aria-pressed={isOn}
                title={`Highlight team ${team.teamNumber}`}
                onClick={() => onToggleTeam(team.teamNumber)}
                onMouseEnter={(event) => show(team, event.currentTarget)}
                onMouseLeave={hide}
                onFocus={(event) => show(team, event.currentTarget)}
                onBlur={hide}
              >
                <span className="teamrow__rank">
                  {team.rank === null ? <span className="teamrow__rank--none">—</span> : `#${team.rank}`}
                </span>
                <img
                  className={logo ? 'teamrow__logo' : 'teamrow__logo teamrow__logo--placeholder'}
                  src={logo ?? firstLogo}
                  alt=""
                  title={logo ? `Team ${team.teamNumber} logo` : 'No team logo yet — showing the FIRST logo'}
                />
                <span className="teamrow__id">
                  <span className="teamrow__num">{team.teamNumber}</span>
                  <span className="teamrow__name">{team.name || 'Unknown team'}</span>
                </span>
                <OprCells team={team} />
              </button>
              <button
                type="button"
                className={isOpen ? 'teamrow__info teamrow__info--on' : 'teamrow__info'}
                aria-label={`Team ${team.teamNumber} summary`}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                onClick={(event) => togglePin(team, event.currentTarget)}
              >
                <InfoIcon size={15} />
              </button>
            </li>
          );
        })}
      </ul>
      <TeamSummary
        state={hovered}
        pinned={pinned}
        onClose={unpin}
        hint="Click to highlight this team’s matches"
      />
    </div>
  );
}
