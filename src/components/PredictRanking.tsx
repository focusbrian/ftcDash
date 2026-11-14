import { useMemo, useState } from 'react';
import firstLogo from '../assets/first-logo.webp';
import { InfoIcon } from './InfoIcon';
import { TeamSummary } from './TeamSummary';
import { useTeamHover } from '../hooks/useTeamHover';
import { fmtPoints } from '../lib/format';
import { predictRankings } from '../lib/predict';
import type { TeamPrediction } from '../lib/predict';
import type { MatchView } from '../lib/model';
import type { AssetStore } from '../lib/assets';
import type { TeamStrength } from '../types';

interface Props {
  /** Every team at the event — the prediction runs over all of them, then the rows are filtered. */
  teams: readonly TeamStrength[];
  views: readonly MatchView[];
  /** When set, only these teams are listed; ranks stay relative to the whole event. */
  filterTo?: ReadonlySet<number> | null;
  highlightTeams: readonly number[];
  assets: AssetStore;
  onToggleTeam: (teamNumber: number) => void;
}

type Mode = 'predicted' | 'difficulty';

function deltaLabel(entry: TeamPrediction): string {
  if (entry.currentRank === null || entry.remaining === 0) return '';
  const move = entry.currentRank - entry.predictedRank;
  if (move === 0) return ' · holds';
  return move > 0 ? ` · ▲${move}` : ` · ▼${-move}`;
}

/**
 * Predicted finish and remaining-schedule difficulty. Both are ordered rankings over the same event,
 * so the switch stays at the top and the row layout matches the ranking list.
 */
export function PredictRanking({
  teams,
  views,
  filterTo = null,
  highlightTeams,
  assets,
  onToggleTeam,
}: Props) {
  const [mode, setMode] = useState<Mode>('predicted');
  const highlighted = new Set(highlightTeams);
  const { hovered, pinned, show, hide, togglePin, unpin } = useTeamHover();

  const predictions = useMemo(
    () => predictRankings(views, new Map(teams.map((team) => [team.teamNumber, team]))),
    [teams, views],
  );
  const byTeam = useMemo(
    () => new Map(teams.map((team) => [team.teamNumber, team])),
    [teams],
  );

  const remainingMatches = useMemo(
    () => views.filter((view) => view.projected && view.match.level === 'Quals').length,
    [views],
  );

  const rows = useMemo(() => {
    const all =
      mode === 'predicted'
        ? predictions
        : // Hardest schedule first, then whoever has nothing left to play.
          [...predictions].sort((a, b) => {
            if (a.difficultyRank !== null && b.difficultyRank !== null) {
              return a.difficultyRank - b.difficultyRank;
            }
            if (a.difficultyRank !== null) return -1;
            if (b.difficultyRank !== null) return 1;
            return a.teamNumber - b.teamNumber;
          });
    return filterTo ? all.filter((entry) => filterTo.has(entry.teamNumber)) : all;
  }, [mode, predictions, filterTo]);

  if (teams.length === 0) {
    return (
      <p className="empty">
        No teams have been published for this event yet, so there is nothing to predict.
      </p>
    );
  }

  return (
    <div className="predict">
      <div className="predict__switch" role="group" aria-label="Predicted ranking or schedule difficulty">
        <button
          type="button"
          className={
            mode === 'predicted'
              ? 'predict__option predict__option--active'
              : 'predict__option'
          }
          aria-pressed={mode === 'predicted'}
          onClick={() => setMode('predicted')}
        >
          Predicted finish
        </button>
        <button
          type="button"
          className={
            mode === 'difficulty'
              ? 'predict__option predict__option--active'
              : 'predict__option'
          }
          aria-pressed={mode === 'difficulty'}
          onClick={() => setMode('difficulty')}
        >
          Schedule difficulty
        </button>
      </div>

      <p className="predict__hint">
        {mode === 'predicted'
          ? remainingMatches > 0
            ? `Ranks teams by ranking points earned plus the points ${remainingMatches} unscored qualification match${remainingMatches === 1 ? '' : 'es'} are expected to add at each team's projected win odds.`
            : 'Every qualification match has a recorded score, so this is the official ranking.'
          : 'Ranks teams by the projected OPR of the alliances they still have to face — hardest remaining schedule first. Each row also shows the partner it draws and how its own OPR compares with the opposition.'}
      </p>

      <ul className="teams__list">
        {rows.map((entry) => {
          const team = byTeam.get(entry.teamNumber);
          const logo = assets[String(entry.teamNumber)]?.logo;
          const isOn = highlighted.has(entry.teamNumber);
          const isOpen = pinned && hovered?.team.teamNumber === entry.teamNumber;
          const rank = mode === 'predicted' ? entry.predictedRank : entry.difficultyRank;

          return (
            <li
              key={entry.teamNumber}
              className={isOn ? 'teams__row teams__row--on' : 'teams__row'}
            >
              <button
                type="button"
                className="teamrow"
                aria-pressed={isOn}
                title={`Highlight team ${entry.teamNumber}`}
                onClick={() => onToggleTeam(entry.teamNumber)}
                onMouseEnter={(event) => team && show(team, event.currentTarget)}
                onMouseLeave={hide}
                onFocus={(event) => team && show(team, event.currentTarget)}
                onBlur={hide}
              >
                <span className="teamrow__rank">
                  {rank === null ? <span className="teamrow__rank--none">—</span> : `#${rank}`}
                </span>
                <img
                  className={logo ? 'teamrow__logo' : 'teamrow__logo teamrow__logo--placeholder'}
                  src={logo ?? firstLogo}
                  alt=""
                  title={logo ? `Team ${entry.teamNumber} logo` : 'No team logo yet — showing the FIRST logo'}
                />
                <span className="teamrow__id">
                  <span className="teamrow__num">{entry.teamNumber}</span>
                  <span className="teamrow__name">{entry.name || 'Unknown team'}</span>
                </span>
                <span className="teamrow__opr">
                  <span
                    className={
                      mode === 'predicted'
                        ? 'teamrow__total'
                        : entry.oprMargin === null
                          ? 'teamrow__total'
                          : entry.oprMargin >= 0
                            ? 'teamrow__total predict__margin predict__margin--up'
                            : 'teamrow__total predict__margin predict__margin--down'
                    }
                  >
                    {mode === 'predicted'
                      ? fmtPoints(entry.projectedRp)
                      : entry.oprMargin === null
                        ? '—'
                        : `${entry.oprMargin >= 0 ? '+' : '−'}${fmtPoints(Math.abs(entry.oprMargin))}`}
                  </span>
                  <span className="teamrow__total-label">
                    {mode === 'predicted' ? 'RP proj' : 'vs opp'}
                  </span>
                </span>
                <span className="teamrow__detail">
                  {mode === 'predicted' ? (
                    <>
                      {entry.currentRank === null
                        ? `unranked${deltaLabel(entry)} · RP ${fmtPoints(entry.currentRp)}`
                        : `now #${entry.currentRank}${deltaLabel(entry)} · RP ${fmtPoints(entry.currentRp)}`}
                      {entry.played > 0
                        ? ` · ${entry.wins}–${entry.losses}${entry.ties > 0 ? `–${entry.ties}` : ''}`
                        : ''}
                    </>
                  ) : (
                    <>
                      {entry.partnerOpr === null
                        ? 'Partner —'
                        : `Partner ${fmtPoints(entry.partnerOpr)}`}
                      {` · Opp ${entry.difficulty === null ? '—' : fmtPoints(entry.difficulty)}`}
                      {` · You ${fmtPoints(entry.oprTotal)}`}
                    </>
                  )}
                  {entry.remaining > 0 ? ` · ${entry.remaining} to play` : ' · done'}
                </span>
              </button>
              <button
                type="button"
                className={isOpen ? 'teamrow__info teamrow__info--on' : 'teamrow__info'}
                aria-label={`Team ${entry.teamNumber} summary`}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                onClick={(event) => {
                  if (team) togglePin(team, event.currentTarget);
                }}
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
