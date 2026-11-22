import { useMemo, useRef, useState, type ReactNode } from 'react';
import firstLogo from '../assets/first-logo.webp';
import { useTeamLookup } from '../hooks/useTeamLookup';
import {
  overlayAssets,
  robotSeasons,
  teamsWithAssets,
  type AssetKind,
  type AssetStore,
} from '../lib/assets';
import {
  countAssets,
  downloadBackup,
  mergeAssetStores,
  parseBackup,
} from '../lib/backup';
import { fileToImageDataUrl, isImageFile, MAX_ASSET_SIZE } from '../lib/image';
import { defaultSeason, EARLIEST_SEASON } from '../lib/route';
import { searchTeams } from '../lib/teamSearch';
import type { TeamStrength } from '../types';

interface Props {
  /** Teams at the currently loaded event, used for name lookups and suggestions. */
  teams: TeamStrength[];
  assets: AssetStore;
  /** Logos and photos that ship with the site; the browser's own copies win. */
  sharedAssets?: AssetStore;
  storageError: string | null;
  onSetAsset: (teamNumber: number, kind: AssetKind, dataUrl: string, season?: number) => void;
  onRemoveAsset: (teamNumber: number, kind: AssetKind, season?: number) => void;
  onReplaceAssets: (store: AssetStore) => void;
  onBack: () => void;
  /** Where "back" leads, so the caption matches (the landing page has no dashboard behind it). */
  backLabel?: string;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

const SHARED_NOTE = 'From the shared library — upload your own image to override it.';

function seasonOptions(extra: number[]): number[] {
  const seasons = new Set<number>([defaultSeason() + 1, defaultSeason(), ...extra]);
  for (let season = defaultSeason(); season >= EARLIEST_SEASON; season -= 1) seasons.add(season);
  return [...seasons].sort((a, b) => b - a);
}

export function ConfigView({
  teams,
  assets,
  sharedAssets = {},
  storageError,
  onSetAsset,
  onRemoveAsset,
  onReplaceAssets,
  onBack,
  backLabel = 'Back to dashboard',
}: Props) {
  const [teamInput, setTeamInput] = useState('');
  const [busy, setBusy] = useState<AssetKind | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [robotSeason, setRobotSeason] = useState(() => defaultSeason());
  const [backupMode, setBackupMode] = useState<'merge' | 'replace'>('merge');
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const robotInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);

  const trimmed = teamInput.trim();
  const teamNumber = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  const knownTeam = teamNumber === null ? null : teams.find((team) => team.teamNumber === teamNumber);
  const suggestions = teamNumber === null && trimmed ? searchTeams(teams, trimmed, 6) : [];
  // Editing shows what the dashboard shows; a team can take its logo from the library and its
  // robot photo from here.
  const merged = useMemo(() => overlayAssets(sharedAssets, assets), [sharedAssets, assets]);
  const current = teamNumber === null ? undefined : assets[String(teamNumber)];
  const live = teamNumber === null ? undefined : merged[String(teamNumber)];
  const libraryTeams = teamsWithAssets(merged);
  const sharedCount = teamsWithAssets(sharedAssets).length;

  const lookup = useTeamLookup(knownTeam ? null : teamNumber);
  const displayName = knownTeam?.name ?? lookup.name;
  const displaySchool = knownTeam?.schoolName ?? lookup.schoolName;

  const savedRobotSeasons = robotSeasons(live);
  const seasonRobot = live?.robots?.[String(robotSeason)];
  const robotImage = seasonRobot ?? live?.robot;
  // The browser's own copy, if any; without one the image is coming from the shared library.
  const localRobot = current?.robots?.[String(robotSeason)] ?? current?.robot;
  const seasons = seasonOptions(savedRobotSeasons);

  const handleFile = async (kind: AssetKind, file: File | undefined) => {
    if (!file || teamNumber === null) return;
    if (!isImageFile(file)) {
      setLocalError('Choose an image file (PNG, JPEG, WebP, SVG, …).');
      return;
    }

    setBusy(kind);
    setLocalError(null);
    try {
      const dataUrl = await fileToImageDataUrl(file, MAX_ASSET_SIZE[kind]);
      onSetAsset(teamNumber, kind, dataUrl, kind === 'robot' ? robotSeason : undefined);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Could not read that image.');
    } finally {
      setBusy(null);
    }
  };

  const openBackupPicker = (mode: 'merge' | 'replace') => {
    setBackupMode(mode);
    setBackupMessage(null);
    setBackupError(null);
    backupInput.current?.click();
  };

  const handleBackupFile = async (file: File | undefined) => {
    if (!file) return;
    setBackupMessage(null);
    setBackupError(null);

    try {
      const incoming = parseBackup(await file.text());

      if (backupMode === 'replace') {
        onReplaceAssets(incoming);
        setBackupMessage(
          `Replaced with ${plural(countAssets(incoming), 'image')} from ${plural(
            Object.keys(incoming).length,
            'team',
          )}.`,
        );
        return;
      }

      const { store, addedAssets, keptAssets, addedTeams } = mergeAssetStores(assets, incoming);
      if (addedAssets === 0) {
        setBackupMessage(
          `Nothing new in that backup; ${plural(keptAssets, 'existing image')} left untouched.`,
        );
        return;
      }
      onReplaceAssets(store);
      setBackupMessage(
        `Merged ${plural(addedAssets, 'new image')} across ${plural(addedTeams, 'team')}${
          keptAssets > 0 ? `; ${plural(keptAssets, 'existing image')} left untouched` : ''
        }.`,
      );
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'Could not read that backup.');
    }
  };

  const renderTile = (
    kind: AssetKind,
    title: string,
    hint: string,
    value: string | undefined,
    extra?: { header?: ReactNode; note?: string; onRemove?: () => void },
  ) => {
    const inputRef = kind === 'logo' ? logoInput : robotInput;

    return (
      <div className="asset">
        <span className="asset__label">{title}</span>
        {extra?.header}
        <div className="asset__preview">
          {value ? (
            <img
              className="asset__image"
              src={value}
              alt={`Team ${teamNumber ?? ''} ${kind}`}
            />
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
            disabled={teamNumber === null || busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            {busy === kind ? 'Processing…' : value ? 'Replace image' : 'Upload image'}
          </button>
          {value && extra?.onRemove ? (
            <button
              type="button"
              className="button button--small button--danger"
              disabled={busy !== null}
              onClick={extra.onRemove}
            >
              Remove
            </button>
          ) : null}
        </div>
        {extra?.note ? <p className="asset__note">{extra.note}</p> : null}
      </div>
    );
  };

  return (
    <div className="config">
      <div className="config__inner">
        <header className="config__head">
          <div>
            <p className="detail__kicker">Configuration</p>
            <h1>Team assets</h1>
            <p className="config__intro">
              Upload a logo for a team and a photo of its robot — any image file your browser can
              open (PNG, JPEG, WebP, SVG, …). They are stored in this browser only and appear in the
              match view: logos next to team numbers, robot photos standing above the alliance card.
              Transparent PNGs of the robot work best. Uploads are scaled to fit 48 × 48 px for logos
              and 200 × 200 px for robots, keeping their aspect ratio.
              {sharedCount > 0
                ? ` The site also ships ${plural(sharedCount, 'team')} of logos and photos; those show by default, and anything you add here takes precedence.`
                : ''}
            </p>
          </div>
          <button type="button" className="button button--ghost" onClick={onBack}>
            ← {backLabel}
          </button>
        </header>

        <section className="config__panel">
          <h2>Team</h2>
          <p className="config__hint">
            Type a team number, or search the loaded event by number or name.
          </p>
          <input
            className="field__control"
            type="text"
            inputMode="numeric"
            placeholder="Team number or name, e.g. 23502 or Nexus"
            value={teamInput}
            onChange={(event) => {
              setTeamInput(event.target.value);
              setLocalError(null);
            }}
          />

          {suggestions.length > 0 ? (
            <ul className="teamsearch__menu">
              {suggestions.map((hit) => (
                <li key={hit.teamNumber}>
                  <button
                    type="button"
                    className="teamsearch__option"
                    onClick={() => setTeamInput(String(hit.teamNumber))}
                  >
                    <span className="teamsearch__number">{hit.teamNumber}</span>
                    <span className="teamsearch__name">{hit.name}</span>
                    {hit.rank ? <span className="teamsearch__rank">#{hit.rank}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {teamNumber !== null ? (
            <>
              <p className="teamsearch__status">
                <span className="chip chip--team">{teamNumber}</span>
                <strong>
                  {displayName ?? (lookup.loading ? 'Looking up team…' : 'Unknown team')}
                </strong>
                {displaySchool ? <span>· {displaySchool}</span> : null}
              </p>
              <div className="config__assets">
                {renderTile('logo', 'Team logo', 'No logo yet — a square image works best.', live?.logo, {
                  note: live?.logo && !current?.logo ? SHARED_NOTE : undefined,
                  onRemove:
                    current?.logo && teamNumber !== null
                      ? () => onRemoveAsset(teamNumber, 'logo')
                      : undefined,
                })}
                {renderTile(
                  'robot',
                  'Robot photo',
                  `No robot image for ${robotSeason} yet — transparent PNGs work best.`,
                  robotImage,
                  {
                    header: (
                      <>
                        <div className="asset__season">
                          <label htmlFor="robot-season">Season</label>
                          <select
                            id="robot-season"
                            className="field__control"
                            value={robotSeason}
                            onChange={(event) => setRobotSeason(Number(event.target.value))}
                          >
                            {seasons.map((season) => (
                              <option key={season} value={season}>
                                {season}
                              </option>
                            ))}
                          </select>
                        </div>
                        {savedRobotSeasons.length > 0 ? (
                          <div className="asset__seasons">
                            {savedRobotSeasons.map((season) => (
                              <button
                                key={season}
                                type="button"
                                className={
                                  season === robotSeason
                                    ? 'asset__season-chip asset__season-chip--active'
                                    : 'asset__season-chip'
                                }
                                onClick={() => setRobotSeason(season)}
                              >
                                {season} ✓
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </>
                    ),
                    note:
                      !seasonRobot && live?.robot
                        ? `No image for ${robotSeason} — showing the image saved for all seasons.`
                        : robotImage && !localRobot
                          ? SHARED_NOTE
                          : undefined,
                    onRemove:
                      localRobot && teamNumber !== null
                        ? () => onRemoveAsset(teamNumber, 'robot', seasonRobot ? robotSeason : undefined)
                        : undefined,
                  },
                )}
              </div>
            </>
          ) : null}

          {localError ? <p className="config__error">{localError}</p> : null}
          {storageError ? <p className="config__error">{storageError}</p> : null}
        </section>

        <section className="config__panel">
          <h2>Backup</h2>
          <p className="config__hint">
            Save every logo and robot photo to a JSON file, or load one from another computer.
            “Merge” fills in what is missing and keeps anything already saved here; “Replace”
            swaps in the backup’s contents entirely.
          </p>
          <div className="asset__actions">
            <input
              ref={backupInput}
              className="asset__input"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void handleBackupFile(file);
              }}
            />
            <button
              type="button"
              className="button button--small"
              disabled={countAssets(assets) === 0}
              onClick={() => downloadBackup(assets)}
            >
              Download backup
            </button>
            <button
              type="button"
              className="button button--small button--ghost"
              onClick={() => openBackupPicker('merge')}
            >
              Merge backup…
            </button>
            <button
              type="button"
              className="button button--small button--ghost"
              onClick={() => openBackupPicker('replace')}
            >
              Replace from backup…
            </button>
          </div>
          {backupMessage ? <p className="config__note">{backupMessage}</p> : null}
          {backupError ? <p className="config__error">{backupError}</p> : null}
        </section>

        <section className="config__panel">
          <h2>Saved teams</h2>
          <p className="config__hint">
            Logos and robot photos in this browser, plus any the site ships. Select one to edit it.
          </p>
          {libraryTeams.length === 0 ? (
            <p className="empty">Nothing saved yet.</p>
          ) : (
            <div className="config__library">
              {libraryTeams.map((number) => {
                const asset = merged[String(number)];
                const mine = assets[String(number)];
                const name =
                  number === teamNumber
                    ? displayName
                    : teams.find((team) => team.teamNumber === number)?.name;
                return (
                  <button
                    key={number}
                    type="button"
                    className="library-card"
                    onClick={() => setTeamInput(String(number))}
                  >
                    {asset?.logo ? (
                      <img
                        className="library-card__logo"
                        src={asset.logo}
                        alt={`Team ${number} logo`}
                      />
                    ) : (
                      <img
                        className="library-card__logo library-card__logo--placeholder"
                        src={firstLogo}
                        alt=""
                        title="No team logo yet — showing the FIRST logo"
                      />
                    )}
                    <span className="library-card__body">
                      <span className="library-card__number">{number}</span>
                      {name ? <span className="library-card__name">{name}</span> : null}
                      <span className="library-card__tags">
                        {asset?.logo ? <span>logo</span> : null}
                        {asset?.robot ? <span>robot</span> : null}
                        {mine ? null : <span>shared</span>}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
