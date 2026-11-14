import firstLogo from '../assets/first-logo.webp';
import { Confetti } from './Confetti';
import { TeamSummary } from './TeamSummary';
import { fmtPoints } from '../lib/format';
import { useTeamHover } from '../hooks/useTeamHover';
import type { AssetStore } from '../lib/assets';
import type { SideView } from '../lib/model';

interface Props {
  side: SideView;
  projected: boolean;
  assets: AssetStore;
  highlightTeams: readonly number[];
  onToggleTeam: (teamNumber: number) => void;
  celebrate?: boolean;
}

function Stat({ label, value, total }: { label: string; value: string; total?: boolean }) {
  return (
    <div className={total ? 'split split--total' : 'split'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function AllianceCard({
  side,
  projected,
  assets,
  highlightTeams,
  onToggleTeam,
  celebrate,
}: Props) {
  // Remote seasons recorded alliance totals without an auto/teleop breakdown.
  const breakdownMissing = !projected && side.total > 0 && side.auto === 0 && side.teleop === 0;
  const digits = projected ? 1 : 0;
  const highlighted = new Set(highlightTeams);
  const { hovered, show, hide } = useTeamHover();

  return (
    <article className={`alliance alliance--${side.alliance.toLowerCase()}`}>
      {celebrate ? <Confetti tone={side.alliance.toLowerCase()} /> : null}
      <header className="alliance__head">
        <h3>{side.alliance === 'Solo' ? 'Solo run' : `${side.alliance} Alliance`}</h3>
        <span className="alliance__total">
          {projected ? '≈' : ''}
          {fmtPoints(side.total, digits)}
        </span>
      </header>

      <ul className="alliance__teams">
        {side.entries.map((entry) => {
          const logo = assets[String(entry.teamNumber)]?.logo;
          const classes = ['team'];
          if (entry.noShow) classes.push('team--out');
          if (highlighted.has(entry.teamNumber)) classes.push('team--highlight');
          // A carried season OPR is shown in parentheses so it never reads as earned here.
          const marked = (value: number) =>
            entry.strength?.oprFromSeason ? `(${fmtPoints(value)})` : fmtPoints(value);

          return (
            <li key={`${entry.teamNumber}-${entry.station}`} className={classes.join(' ')}>
              <button
                type="button"
                className="team__hit"
                aria-pressed={highlighted.has(entry.teamNumber)}
                title={`Highlight team ${entry.teamNumber}`}
                onClick={() => onToggleTeam(entry.teamNumber)}
                onMouseEnter={(event) => show(entry.strength, event.currentTarget)}
                onMouseLeave={hide}
                onFocus={(event) => show(entry.strength, event.currentTarget)}
                onBlur={hide}
              >
                <span className="team__num">
                  {logo ? (
                    <img className="team__logo" src={logo} alt={`Team ${entry.teamNumber} logo`} />
                  ) : (
                    <img
                      className="team__logo team__logo--placeholder"
                      src={firstLogo}
                      alt=""
                      title="No team logo yet — showing the FIRST logo"
                    />
                  )}
                  {entry.teamNumber}
                </span>
                <span className="team__name">{entry.name || 'Unknown team'}</span>
                <span className="team__flags">
                  {entry.strength?.rank ? (
                    <span className="team__rank" title="Event rank">
                      #{entry.strength.rank}
                    </span>
                  ) : null}
                  {entry.surrogate ? (
                    <span
                      className="team__flag"
                      title="Surrogate — score does not count for this team"
                    >
                      SUR
                    </span>
                  ) : null}
                  {entry.dq ? (
                    <span className="team__flag" title="Disqualified">
                      DQ
                    </span>
                  ) : null}
                  {entry.noShow ? (
                    <span className="team__flag" title="No show">
                      DNS
                    </span>
                  ) : null}
                </span>
                <span
                  className="team__opr"
                  title={
                    entry.strength?.oprFromSeason
                      ? 'No OPR at this event yet — using the team’s most recent season OPR (auto + teleop)'
                      : "This team's OPR: auto + teleop"
                  }
                >
                  {entry.contribution
                    ? `OPR A ${marked(entry.contribution.auto)} · T ${marked(entry.contribution.teleop)}`
                    : 'no OPR'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <TeamSummary state={hovered} hint="Click to highlight this team’s matches" />

      <dl className="alliance__splits">
        <Stat label="Auto" value={breakdownMissing ? '—' : fmtPoints(side.auto, digits)} />
        <Stat label="Teleop" value={breakdownMissing ? '—' : fmtPoints(side.teleop, digits)} />
        {side.penalties > 0 ? <Stat label="Penalty pts" value={`+${side.penalties}`} /> : null}
        <Stat label="Total" value={fmtPoints(side.total, digits)} total />
      </dl>

      {projected && side.missingTeams.length > 0 ? (
        <p className="alliance__note">
          No OPR for {side.missingTeams.join(', ')} yet — counted as zero.
        </p>
      ) : null}
      {breakdownMissing ? (
        <p className="alliance__note">Auto and teleop splits were not recorded for this match.</p>
      ) : null}
    </article>
  );
}
