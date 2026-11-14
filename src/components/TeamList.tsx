import firstLogo from '../assets/first-logo.webp';
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

export function TeamList({ teams, highlightTeams, assets, onToggleTeam }: Props) {
  const highlighted = new Set(highlightTeams);
  const { hovered, show, hide } = useTeamHover();

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
          const auto = Math.max(0, team.oprAuto);
          const teleop = Math.max(0, team.oprTeleop);
          const isOn = highlighted.has(team.teamNumber);

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
                <span className="teamrow__opr">
                  <span className="teamrow__total">{team.hasOpr ? fmtPoints(auto + teleop) : '—'}</span>
                  <span className="teamrow__total-label">OPR</span>
                </span>
                <span className="teamrow__detail">
                  {team.hasOpr
                    ? `Auton ${fmtPoints(auto)} · Teleop ${fmtPoints(teleop)}`
                    : 'No OPR published yet'}
                  {team.rp === null ? '' : ` · RP ${fmtPoints(team.rp)}`}
                  {team.matchesPlayed > 0
                    ? ` · ${team.matchesPlayed} match${team.matchesPlayed === 1 ? '' : 'es'}`
                    : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <TeamSummary state={hovered} hint="Click to highlight this team’s matches" />
    </div>
  );
}
