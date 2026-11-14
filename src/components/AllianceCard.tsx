import firstLogo from '../assets/first-logo.webp';
import { Confetti } from './Confetti';
import { fmtPoints } from '../lib/format';
import type { AssetStore } from '../lib/assets';
import type { SideView } from '../lib/model';

interface Props {
  side: SideView;
  projected: boolean;
  assets: AssetStore;
  highlightTeam: number | null;
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

export function AllianceCard({ side, projected, assets, highlightTeam, celebrate }: Props) {
  // Remote seasons recorded alliance totals without an auto/teleop breakdown.
  const breakdownMissing = !projected && side.total > 0 && side.auto === 0 && side.teleop === 0;
  const digits = projected ? 1 : 0;

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
          if (entry.teamNumber === highlightTeam) classes.push('team--highlight');

          return (
            <li key={`${entry.teamNumber}-${entry.station}`} className={classes.join(' ')}>
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
              <span className="team__opr" title="This team's OPR: auto + teleop">
                {entry.contribution
                  ? `OPR A ${fmtPoints(entry.contribution.auto)} · T ${fmtPoints(entry.contribution.teleop)}`
                  : 'no OPR'}
              </span>
            </li>
          );
        })}
      </ul>

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
