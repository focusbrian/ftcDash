import { useMemo, useState } from 'react';
import firstLogo from '../assets/first-logo.webp';
import { InfoIcon } from './InfoIcon';
import { TeamSummary } from './TeamSummary';
import { useTeamHover } from '../hooks/useTeamHover';
import { fmtPoints } from '../lib/format';
import { sortTeamsBy, oprPositions, type TeamSort } from '../lib/teams';
import type { AssetStore } from '../lib/assets';
import type { TeamStrength } from '../types';

interface Props {
  teams: readonly TeamStrength[];
  /** Every team at the event, so OPR positions stay event-wide when the list is filtered. */
  allTeams?: readonly TeamStrength[];
  highlightTeams: readonly number[];
  assets: AssetStore;
  onOpenTeam?: (teamNumber: number) => void;
  /** Alliance selection: clicking a row crosses a team off instead of highlighting it. */
  selectionMode?: boolean;
  onToggleSelectionMode?: () => void;
  draftedTeams?: readonly number[];
  onToggleDrafted?: (teamNumber: number) => void;
  onClearDrafted?: () => void;
}

/**
 * The row's OPR column. A team with no OPR at this event yet carries its season OPR instead, in
 * parentheses — the same way the hover card marks a carried value.
 */
function OprCells({ team, rank }: { team: TeamStrength; rank: string | null }) {
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
        {rank ? `${rank} · ` : ''}
        {team.hasOpr ? (team.oprFromSeason ? `Season OPR · ${split}` : split) : 'No OPR published yet'}
        {team.rp === null ? '' : ` · RP ${fmtPoints(team.rp)}`}
        {team.matchesPlayed > 0
          ? ` · ${team.matchesPlayed} match${team.matchesPlayed === 1 ? '' : 'es'}`
          : ''}
      </span>
    </>
  );
}

export function TeamList({
  teams,
  allTeams,
  highlightTeams,
  assets,
  onOpenTeam,
  selectionMode = false,
  onToggleSelectionMode,
  draftedTeams = [],
  onToggleDrafted,
  onClearDrafted,
}: Props) {
  const [sort, setSort] = useState<TeamSort>('rank');
  const highlighted = new Set(highlightTeams);
  const drafted = new Set(draftedTeams);
  const { hovered, pinned, show, hide, togglePin, unpin } = useTeamHover();
  const ordered = useMemo(() => sortTeamsBy(teams, sort), [teams, sort]);
  // Numbering comes from the whole event, so filtering out teams does not renumber the ones left.
  const oprRank = useMemo(() => oprPositions(allTeams ?? teams), [allTeams, teams]);

  // While picking alliances, teams already taken drop to the bottom so the top names are all free.
  const rows = useMemo(() => {
    if (!selectionMode) return ordered;
    return [...ordered].sort(
      (a, b) => Number(drafted.has(a.teamNumber)) - Number(drafted.has(b.teamNumber)),
    );
  }, [ordered, selectionMode, drafted]);
  const remaining = ordered.filter((team) => !drafted.has(team.teamNumber)).length;

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
      <div className="teams__tools">
        <div className="segmented" role="group" aria-label="Sort the ranking">
          <button
            type="button"
            className={sort === 'rank' ? 'segmented__option segmented__option--active' : 'segmented__option'}
            aria-pressed={sort === 'rank'}
            onClick={() => setSort('rank')}
          >
            Rank
          </button>
          <button
            type="button"
            className={sort === 'opr' ? 'segmented__option segmented__option--active' : 'segmented__option'}
            aria-pressed={sort === 'opr'}
            onClick={() => setSort('opr')}
          >
            OPR
          </button>
        </div>
        <button
          type="button"
          className={
            selectionMode ? 'teams__draft teams__draft--on' : 'teams__draft'
          }
          aria-pressed={selectionMode}
          title="Alliance selection: click teams to cross them off as they are taken"
          onClick={onToggleSelectionMode}
        >
          Draft
        </button>
      </div>

      {selectionMode ? (
        <p className="teams__pool">
          <span>
            {remaining} of {ordered.length} left
          </span>
          {drafted.size > 0 ? (
            <button type="button" className="teams__reset" onClick={onClearDrafted}>
              Reset
            </button>
          ) : null}
        </p>
      ) : null}

      <ul className="teams__list">
        {rows.map((team) => {
          const logo = assets[String(team.teamNumber)]?.logo;
          const isOn = highlighted.has(team.teamNumber);
          const isDrafted = drafted.has(team.teamNumber);
          const isOpen = pinned && hovered?.team.teamNumber === team.teamNumber;
          // Ordering by OPR makes the left column the OPR position, so the official rank moves to the
          // detail line rather than sitting there out of sequence.
          const position = oprRank.get(team.teamNumber) ?? null;
          const official = team.rank === null ? 'unranked' : `now #${team.rank}`;
          const classes = ['teams__row'];
          if (isOn) classes.push('teams__row--on');
          // The board is only shown while selecting; the crossings themselves are remembered per event.
          if (isDrafted && selectionMode) classes.push('teams__row--drafted');

          return (
            <li key={team.teamNumber} className={classes.join(' ')}>
              <button
                type="button"
                className="teamrow"
                aria-pressed={selectionMode ? isDrafted : undefined}
                title={
                  selectionMode
                    ? isDrafted
                      ? `Put ${team.teamNumber} back in the pool`
                      : `Cross ${team.teamNumber} off as taken`
                    : `Open team ${team.teamNumber}`
                }
                onClick={() =>
                  selectionMode
                    ? onToggleDrafted?.(team.teamNumber)
                    : onOpenTeam?.(team.teamNumber)
                }
                onMouseEnter={(event) => show(team, event.currentTarget)}
                onMouseLeave={hide}
                onFocus={(event) => show(team, event.currentTarget)}
                onBlur={hide}
              >
                <span className="teamrow__rank">
                  {sort === 'opr' ? (
                    position === null ? (
                      <span className="teamrow__rank--none">—</span>
                    ) : (
                      `#${position}`
                    )
                  ) : team.rank === null ? (
                    <span className="teamrow__rank--none">—</span>
                  ) : (
                    `#${team.rank}`
                  )}
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
                <OprCells team={team} rank={sort === 'opr' ? official : null} />
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
        hint="Click to open the team page"
      />
    </div>
  );
}
