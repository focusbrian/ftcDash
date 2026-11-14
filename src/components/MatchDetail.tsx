import kitbot from '../assets/kitbot.webp';
import { AllianceCard } from './AllianceCard';
import { fmtPercent, fmtPoints, fmtTime, matchLongLabel, singleAllianceLabel } from '../lib/format';
import { robotForSeason, type AssetStore } from '../lib/assets';
import type { MatchView, SideView } from '../lib/model';
import type { EventData } from '../types';

interface Props {
  view: MatchView | null;
  event: EventData | null;
  loading: boolean;
  error: string | null;
  assets: AssetStore;
  highlightTeams: readonly number[];
  onToggleTeam: (teamNumber: number) => void;
  onJumpToNext: () => void;
}

interface RobotPhoto {
  teamNumber: number;
  name: string;
  url: string;
  /** True when this is the kitbot stand-in, not a photo of the team's robot. */
  placeholder: boolean;
}

/** Robot photos for the teams that actually take the field for one alliance, for the event's season. */
function robotPhotos(side: SideView, assets: AssetStore, season: number): RobotPhoto[] {
  const seen = new Set<number>();
  const photos: RobotPhoto[] = [];

  for (const entry of side.entries) {
    if (entry.noShow || seen.has(entry.teamNumber)) continue;
    seen.add(entry.teamNumber);
    const url = robotForSeason(assets[String(entry.teamNumber)], season);
    photos.push({
      teamNumber: entry.teamNumber,
      name: entry.name,
      url: url ?? kitbot,
      placeholder: !url,
    });
  }
  return photos;
}

function redWinChance(view: MatchView): number | null {
  const leader = view.leader;
  if (!view.projected || !leader?.probability) return null;
  return leader.alliance === 'Red' ? leader.probability : 1 - leader.probability;
}

function hasAnyOpr(view: MatchView): boolean {
  return view.sides.some((side) =>
    side.entries.some((entry) => !entry.noShow && entry.strength?.hasOpr),
  );
}

function ScoreLine({ view }: { view: MatchView }) {
  const red = view.sides.find((side) => side.alliance === 'Red') ?? null;
  const blue = view.sides.find((side) => side.alliance === 'Blue') ?? null;
  const digits = view.projected ? 1 : 0;

  if (!red || !blue) {
    return (
      <p className="verdict__score">
        {view.sides
          .map((side) => `${side.alliance} ${fmtPoints(side.total, digits)}`)
          .join('  ·  ')}
      </p>
    );
  }

  return (
    <p className="verdict__score">
      <span className="verdict__side verdict__side--red">{fmtPoints(red.total, digits)}</span>
      <span className="verdict__dash">–</span>
      <span className="verdict__side verdict__side--blue">{fmtPoints(blue.total, digits)}</span>
    </p>
  );
}

function Verdict({ view }: { view: MatchView }) {
  const redChance = redWinChance(view);
  const leader = view.leader;

  return (
    <section className={`verdict${view.projected ? ' verdict--proj' : ' verdict--final'}`}>
      <div className="verdict__top">
        <span className="verdict__tag">{view.projected ? 'Projected outcome' : 'Final result'}</span>
        {view.projected && !hasAnyOpr(view) ? (
          <span className="verdict__detail">No OPR data published for this event yet</span>
        ) : leader ? (
          <span className="verdict__detail">
            {leader.alliance} {view.projected ? 'favored' : 'wins'} by{' '}
            {fmtPoints(leader.margin, view.projected ? 1 : 0)}
            {leader.probability !== null ? ` · ${fmtPercent(leader.probability)}` : ''}
          </span>
        ) : (
          <span className="verdict__detail">
            {view.sides.length < 2 ? 'Single-alliance run' : 'Dead heat'}
          </span>
        )}
      </div>

      <ScoreLine view={view} />

      {redChance !== null ? (
        <div className="prob">
          <div className="prob__bar">
            <span className="prob__red" style={{ width: `${redChance * 100}%` }} />
          </div>
          <div className="prob__labels">
            <span>{fmtPercent(redChance)} Red</span>
            <span>{fmtPercent(1 - redChance)} Blue</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function MatchDetail({
  view,
  event,
  loading,
  error,
  assets,
  highlightTeams,
  onToggleTeam,
  onJumpToNext,
}: Props) {
  if (error) {
    return (
      <div className="placeholder placeholder--error">
        <h2>Could not load this event</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="placeholder">
        {loading ? <p>Loading event…</p> : <p>Pick a season and event to see its schedule.</p>}
      </div>
    );
  }

  if (!view) {
    if (event.matches.length === 0) {
      return (
        <div className="placeholder">
          <h2>No schedule yet</h2>
          <p>
            FTC Scout has not published match data for {event.name} yet. Schedules usually appear a
            few days before an event starts.
          </p>
        </div>
      );
    }

    return (
      <div className="placeholder">
        <h2>Select a match</h2>
        <p>
          Pick a match on the left to see the recorded result, or the projected auto and teleop
          scores for matches that have not been played yet.
        </p>
        <button type="button" className="button" onClick={onJumpToNext}>
          Jump to the next unplayed match
        </button>
      </div>
    );
  }

  const scheduled = fmtTime(view.match.scheduledStartTime, event.timezone);
  const actual = fmtTime(view.match.actualStartTime, event.timezone);
  const lineups = view.sides.map((side) => ({
    side,
    photos: robotPhotos(side, assets, event.season),
  }));
  const anyRobots = lineups.some((lineup) => lineup.photos.length > 0);

  return (
    <div className="detail detail--enter" key={view.match.id}>
      <header className="detail__head">
        <div>
          <p className="detail__kicker">{event.name}</p>
          <h2>
            {matchLongLabel(view.match)}
            {singleAllianceLabel(view.match)}
          </h2>
        </div>
        <dl className="detail__meta">
          {scheduled ? (
            <div>
              <dt>Scheduled</dt>
              <dd>{scheduled}</dd>
            </div>
          ) : null}
          {actual ? (
            <div>
              <dt>Started</dt>
              <dd>{actual}</dd>
            </div>
          ) : null}
          <div>
            <dt>Status</dt>
            <dd>{view.match.played ? (view.projected ? 'Awaiting scores' : 'Played') : 'Upcoming'}</dd>
          </div>
        </dl>
      </header>

      <Verdict view={view} />

      <div className="alliances">
        {lineups.map(({ side, photos }) => (
          <div key={side.alliance} className="alliance-stack">
            {anyRobots ? (
              <div
                className={photos.length > 1 ? 'lineup lineup--group' : 'lineup'}
                aria-hidden={photos.length === 0 ? true : undefined}
              >
                {photos.map((photo) => (
                  <img
                    key={photo.teamNumber}
                    className={
                      photo.placeholder ? 'lineup__robot lineup__robot--placeholder' : 'lineup__robot'
                    }
                    src={photo.url}
                    alt={
                      photo.placeholder
                        ? `Placeholder robot for team ${photo.teamNumber}`
                        : `Team ${photo.teamNumber} robot`
                    }
                    title={
                      photo.placeholder
                        ? `${photo.teamNumber} · ${photo.name} — no robot photo yet`
                        : `${photo.teamNumber} · ${photo.name}`
                    }
                  />
                ))}
              </div>
            ) : null}
            <AllianceCard
              side={side}
              projected={view.projected}
              assets={assets}
              highlightTeams={highlightTeams}
              onToggleTeam={onToggleTeam}
              celebrate={!view.projected && view.leader?.alliance === side.alliance}
            />
          </div>
        ))}
      </div>

      {view.projected ? (
        <p className="detail__note">
          Projected scores add each team’s OPR from this event’s matches: auto plus teleop
          (driver-controlled). Penalty points are excluded. Win chances treat each alliance total as a
          normal distribution around its projection.
        </p>
      ) : null}
    </div>
  );
}
