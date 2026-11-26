import { useRef, useState } from 'react';
import firstLogo from '../assets/first-logo.webp';
import kitbot from '../assets/kitbot.webp';
import { Sparkline } from './Sparkline';
import { useTeamAwards } from '../hooks/useTeamAwards';
import { useTeamOprHistory } from '../hooks/useTeamOprHistory';
import { useTeamRank } from '../hooks/useTeamRank';
import type { RankSlot } from '../hooks/useTeamRank';
import { awardLabel, placementLabel } from '../lib/awards';
import { fmtDate, fmtPoints, matchShortLabel, singleAllianceLabel } from '../lib/format';
import { OPR_COLORS, eventSparkSeries, seasonSparkSeries } from '../lib/oprSeries';
import { rollingOprForTeam } from '../lib/opr';
import { regionLabel } from '../lib/region';
import { robotForSeason, type AssetKind, type TeamAsset } from '../lib/assets';
import { fileToImageDataUrl, isImageFile, MAX_ASSET_SIZE } from '../lib/image';
import type { MatchView, SideView } from '../lib/model';
import type { EventData, TeamStrength } from '../types';

interface Props {
  team: TeamStrength;
  event: EventData;
  views: readonly MatchView[];
  asset: TeamAsset | undefined;
  /** Whether this team is in the highlight list that drives the filter. */
  highlighted: boolean;
  onToggleHighlight: () => void;
  onSetAsset: (teamNumber: number, kind: AssetKind, dataUrl: string, season?: number) => void;
  onRemoveAsset: (teamNumber: number, kind: AssetKind, season?: number) => void;
  /** Set when the browser refused to store an upload. */
  assetError?: string | null;
  onBack: () => void;
  onSelectMatch: (matchId: number) => void;
  /** Jump to another event of the season, from the "OPR by event" chart. */
  onOpenEvent: (code: string) => void;
}

interface TeamMatch {
  id: number;
  label: string;
  detail: string;
  outcome: 'win' | 'loss' | 'tie' | 'open';
  score: string;
}

function RankTile({ label, slot }: { label: string; slot: RankSlot }) {
  const place = slot.place;
  return (
    <div className="rank-tile">
      <span className="rank-tile__label">{label}</span>
      <span className="rank-tile__rank">{place ? `#${place.rank}` : '#—'}</span>
      <span className="rank-tile__pool">
        {place
          ? `of ${place.pool.toLocaleString('en-US')} teams`
          : slot.status === 'loading'
            ? 'counting…'
            : slot.status === 'error'
              ? 'unavailable'
              : 'no OPR published'}
      </span>
    </div>
  );
}

function sideOf(view: MatchView, teamNumber: number): SideView | null {
  return (
    view.sides.find((side) => side.entries.some((entry) => entry.teamNumber === teamNumber)) ?? null
  );
}

/** The team's own matches at this event, in schedule order, with who they played alongside. */
function teamMatches(views: readonly MatchView[], teamNumber: number): TeamMatch[] {
  const rows: TeamMatch[] = [];

  for (const view of views) {
    const own = sideOf(view, teamNumber);
    if (!own) continue;
    const other = view.sides.find((side) => side !== own) ?? null;
    const partners = own.entries
      .filter((entry) => entry.teamNumber !== teamNumber && !entry.noShow)
      .map((entry) => entry.teamNumber);
    const opponents = (other?.entries ?? [])
      .filter((entry) => !entry.noShow)
      .map((entry) => entry.teamNumber);

    let outcome: TeamMatch['outcome'] = 'open';
    if (!view.projected && other) {
      if (own.total === other.total) outcome = 'tie';
      else outcome = own.total > other.total ? 'win' : 'loss';
    }

    rows.push({
      id: view.match.id,
      label: `${matchShortLabel(view.match)}${singleAllianceLabel(view.match)}`,
      detail:
        partners.length > 0
          ? `with ${partners.join(' & ')} · vs ${opponents.join(' & ') || '—'}`
          : `vs ${opponents.join(' & ') || '—'}`,
      outcome,
      score: other
        ? `${fmtPoints(own.total, view.projected ? 1 : 0)}–${fmtPoints(other.total, view.projected ? 1 : 0)}`
        : fmtPoints(own.total, view.projected ? 1 : 0),
    });
  }

  return rows;
}

const OUTCOME_MARK: Record<TeamMatch['outcome'], string> = {
  win: 'W',
  loss: 'L',
  tie: 'T',
  open: '·',
};

/** Full-page summary of one team, opened in the detail panel from any of the left-hand lists. */
export function TeamPage({
  team,
  event,
  views,
  asset,
  highlighted,
  onToggleHighlight,
  onSetAsset,
  onRemoveAsset,
  assetError = null,
  onBack,
  onSelectMatch,
  onOpenEvent,
}: Props) {
  const seasonOpr = useTeamOprHistory(team.teamNumber, event.season);
  const awards = useTeamAwards(team.teamNumber, event.season);
  const rank = useTeamRank(team.teamNumber, event.season, event.regionCode);
  const regionName = regionLabel(event.regionCode);
  const eventOpr = rollingOprForTeam(views, team.teamNumber);
  const matches = teamMatches(views, team.teamNumber);
  // What the chart tooltip says under each match — partners on the left, opposition on the right.
  const matchDetails = new Map(matches.map((match) => [match.id, match.detail]));
  const eventSeriesPoints = eventOpr.map((point) => ({
    ...point,
    detail: point.matchId === undefined ? undefined : matchDetails.get(point.matchId),
  }));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<AssetKind | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const robotInput = useRef<HTMLInputElement>(null);
  const record = matches.reduce(
    (counts, match) => {
      if (match.outcome === 'win') counts.wins += 1;
      else if (match.outcome === 'loss') counts.losses += 1;
      else if (match.outcome === 'tie') counts.ties += 1;
      return counts;
    },
    { wins: 0, losses: 0, ties: 0 },
  );

  const logo = asset?.logo;
  const robot = robotForSeason(asset, event.season);
  // Removing the season image would leave the legacy all-seasons one showing, so pick the right one.
  const seasonRobot = asset?.robots?.[String(event.season)];
  const auto = Math.max(0, team.oprAuto);
  const teleop = Math.max(0, team.oprTeleop);

  const seasonNote = seasonOpr.points.find((point) => point.kind === 'prior')
    ? `${event.season - 1} OPR as the start`
    : undefined;
  const eventsPlayed = seasonOpr.points.filter((point) => point.kind !== 'prior').length;

  const handleFile = async (kind: AssetKind, file: File | undefined) => {
    if (!file) return;
    if (!isImageFile(file)) {
      setLocalError('Choose an image file (PNG, JPEG, WebP, SVG, …).');
      return;
    }

    setBusy(kind);
    setLocalError(null);
    try {
      const dataUrl = await fileToImageDataUrl(file, MAX_ASSET_SIZE[kind]);
      onSetAsset(team.teamNumber, kind, dataUrl, kind === 'robot' ? event.season : undefined);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Could not read that image.');
    } finally {
      setBusy(null);
    }
  };

  const assetTile = (
    kind: AssetKind,
    title: string,
    hint: string,
    value: string | undefined,
    remove: () => void,
  ) => {
    const inputRef = kind === 'logo' ? logoInput : robotInput;

    return (
      <div className="asset" key={kind}>
        <span className="asset__label">{title}</span>
        <div className="asset__preview">
          {value ? (
            <img className="asset__image" src={value} alt={`Team ${team.teamNumber} ${kind}`} />
          ) : (
            <span className="asset__empty">{hint}</span>
          )}
        </div>
        <div className="asset__actions">
          <input
            ref={inputRef}
            className="asset__input"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void handleFile(kind, file);
            }}
          />
          <button
            type="button"
            className="button button--small"
            disabled={busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            {busy === kind ? 'Processing…' : value ? 'Replace image' : 'Upload image'}
          </button>
          {value ? (
            <button
              type="button"
              className="button button--small button--danger"
              disabled={busy !== null}
              onClick={remove}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="team-page detail--enter">
      <header className="team-page__head">
        <div className="team-page__bar">
          <button type="button" className="button button--ghost button--small" onClick={onBack}>
            ← Back
          </button>
          <div className="team-page__bar-actions">
            <button
              type="button"
              className={editing ? 'team-page__hl team-page__hl--on' : 'team-page__hl'}
              aria-pressed={editing}
              title={
                editing
                  ? 'Close the logo and robot editor'
                  : `Change the logo and robot photo for ${team.teamNumber}`
              }
              onClick={() => {
                setEditing((on) => !on);
                setLocalError(null);
              }}
            >
              {editing ? '✓ Editing' : '✎ Edit'}
            </button>
            <button
              type="button"
              className={
                highlighted ? 'team-page__hl team-page__hl--on' : 'team-page__hl'
              }
              aria-pressed={highlighted}
              title={
                highlighted
                  ? `Remove ${team.teamNumber} from the highlight list`
                  : `Add ${team.teamNumber} to the highlight list`
              }
              onClick={onToggleHighlight}
            >
              {highlighted ? '✓ Highlighted' : '+ Highlight'}
            </button>
          </div>
        </div>
        <p className="detail__kicker">{event.name}</p>
        <div className="team-page__id">
          <img
            className={logo ? 'team-page__logo' : 'team-page__logo team-page__logo--placeholder'}
            src={logo ?? firstLogo}
            alt=""
            title={logo ? `Team ${team.teamNumber} logo` : 'No team logo yet — showing the FIRST logo'}
          />
          <div>
            <h2>
              <span className="team-page__num">{team.teamNumber}</span>
              {team.name || 'Unknown team'}
            </h2>
            {team.schoolName ? <p className="team-page__school">{team.schoolName}</p> : null}
          </div>
        </div>
      </header>

      {editing ? (
        <section className="team-page__editor">
          <p className="team-page__editor-hint">
            Stored in this browser only. Logos are scaled to 48 × 48 px and robot photos to
            200 × 200 px, keeping their aspect ratio; the robot photo is saved for the{' '}
            {event.season} season.
          </p>
          <div className="config__assets">
            {assetTile(
              'logo',
              'Team logo',
              'No logo yet — a square image works best.',
              logo,
              () => onRemoveAsset(team.teamNumber, 'logo'),
            )}
            {assetTile(
              'robot',
              `Robot photo · ${event.season}`,
              `No robot photo for ${event.season} yet — transparent PNGs work best.`,
              robot,
              () =>
                seasonRobot
                  ? onRemoveAsset(team.teamNumber, 'robot', event.season)
                  : onRemoveAsset(team.teamNumber, 'robot'),
            )}
          </div>
          {localError ? <p className="team-page__error">{localError}</p> : null}
          {assetError ? <p className="team-page__error">{assetError}</p> : null}
        </section>
      ) : null}

      <div className="team-page__top">
        <figure className="team-page__robot">
          <img
            className={robot ? 'team-page__robot-img' : 'team-page__robot-img team-page__robot-img--placeholder'}
            src={robot ?? kitbot}
            alt={robot ? `Team ${team.teamNumber} robot` : 'No robot photo yet'}
            title={robot ? `Team ${team.teamNumber} robot` : 'No robot photo yet — showing the kitbot'}
          />
          <figcaption>
            {robot ? `Robot · ${event.season} season` : 'No robot photo yet'}
          </figcaption>
        </figure>

        <dl className="team-page__stats">
          <div>
            <dt>Rank</dt>
            <dd>{team.rank === null ? '—' : `#${team.rank}`}</dd>
          </div>
          <div>
            <dt>Record</dt>
            <dd>
              {record.wins}–{record.losses}
              {record.ties > 0 ? `–${record.ties}` : ''}
            </dd>
          </div>
          <div>
            <dt>Rank pts</dt>
            <dd>{team.rp === null ? '—' : fmtPoints(team.rp)}</dd>
          </div>
          <div>
            <dt>OPR auto</dt>
            <dd style={{ color: OPR_COLORS.auto }}>{team.hasOpr ? fmtPoints(auto) : '—'}</dd>
          </div>
          <div>
            <dt>OPR teleop</dt>
            <dd style={{ color: OPR_COLORS.teleop }}>{team.hasOpr ? fmtPoints(teleop) : '—'}</dd>
          </div>
          <div>
            <dt>OPR total</dt>
            <dd style={{ color: OPR_COLORS.total }}>
              {team.hasOpr ? (team.oprFromSeason ? `(${fmtPoints(auto + teleop)})` : fmtPoints(auto + teleop)) : '—'}
            </dd>
          </div>
        </dl>
      </div>

      <section className="team-page__ranking-block">
        <div className="team-page__ranking">
          <RankTile label="World" slot={rank.world} />
          {regionName ? <RankTile label={`Region · ${regionName}`} slot={rank.region} /> : null}
        </div>
        <p className="team-page__ranking-note">
          Season ranking by OPR total (auto + teleop) among the teams that have played this
          season.
        </p>
      </section>

      {team.oprFromSeason ? (
        <p className="team-page__note">
          This event has not published OPR yet, so the numbers above are the team’s most recent
          season OPR.
        </p>
      ) : null}

      <div className="team-page__charts">
        <Sparkline
          title="OPR by event"
          caption={
            seasonOpr.status === 'loading'
              ? 'loading…'
              : seasonOpr.status === 'error'
                ? 'unavailable'
                : `${eventsPlayed} ${eventsPlayed === 1 ? 'event' : 'events'}`
          }
          empty={seasonOpr.status === 'loading' ? 'Loading season OPR…' : 'No season OPR published'}
          series={seasonSparkSeries(seasonOpr.points)}
          note={seasonNote}
          // The anchor point belongs to the previous season, so there is nothing here to open.
          actionFor={(index) => (seasonOpr.points[index]?.kind === 'prior' ? null : 'Open event')}
          onSelectPoint={(index) => {
            const point = seasonOpr.points[index];
            if (point && point.kind !== 'prior') onOpenEvent(point.code);
          }}
        />
        <Sparkline
          title="OPR this event"
          caption={`${eventOpr.length} match${eventOpr.length === 1 ? '' : 'es'}`}
          empty="No qualification matches yet"
          series={eventSparkSeries(eventSeriesPoints)}
          actionFor={(index) => (eventOpr[index]?.matchId === undefined ? null : 'Open match')}
          onSelectPoint={(index) => {
            const point = eventOpr[index];
            if (point?.matchId !== undefined) onSelectMatch(point.matchId);
          }}
        />
      </div>

      <div className="team-page__lists">
        <section className="team-page__block">
          <h3>Awards this season</h3>
          {awards.status === 'loading' ? <p className="empty">Loading awards…</p> : null}
          {awards.status === 'error' ? <p className="empty">Awards unavailable.</p> : null}
          {awards.status === 'ready' && awards.awards.length === 0 ? (
            <p className="empty">No awards yet this season.</p>
          ) : null}
          {awards.awards.length > 0 ? (
            <ul className="team-page__awards">
              {awards.awards.map((award, at) => {
                const place = placementLabel(award.type, award.placement);
                return (
                  <li
                    key={`${award.eventCode}-${award.type}-${award.placement}-${at}`}
                    className="team-page__award"
                  >
                    <span className="team-page__award-name">
                      {awardLabel(award.type)}
                      {place ? <em>{place}</em> : null}
                      {award.divisionName ? <em>{award.divisionName}</em> : null}
                    </span>
                    <span className="team-page__award-event">
                      {award.eventName}
                      <span> · {fmtDate(award.eventStart, { month: 'short', day: 'numeric' })}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <section className="team-page__block">
          <h3>Matches at this event</h3>
          {matches.length === 0 ? (
            <p className="empty">No matches published for this team yet.</p>
          ) : (
            <ul className="team-page__matches">
              {matches.map((match) => (
                <li key={match.id}>
                  <button
                    type="button"
                    className="team-page__match"
                    onClick={() => onSelectMatch(match.id)}
                  >
                    <span className={`team-page__result team-page__result--${match.outcome}`}>
                      {OUTCOME_MARK[match.outcome]}
                    </span>
                    <span className="team-page__match-label">{match.label}</span>
                    <span className="team-page__match-detail">{match.detail}</span>
                    <span className="team-page__match-score">{match.score}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
