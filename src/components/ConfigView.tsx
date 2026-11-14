import { useRef, useState } from 'react';
import firstLogo from '../assets/first-logo.webp';
import { useTeamLookup } from '../hooks/useTeamLookup';
import { teamsWithAssets, type AssetKind, type AssetStore } from '../lib/assets';
import { fileToImageDataUrl, isImageFile } from '../lib/image';
import { searchTeams } from '../lib/teamSearch';
import type { TeamStrength } from '../types';

interface Props {
  /** Teams at the currently loaded event, used for name lookups and suggestions. */
  teams: TeamStrength[];
  assets: AssetStore;
  storageError: string | null;
  onSetAsset: (teamNumber: number, kind: AssetKind, dataUrl: string) => void;
  onRemoveAsset: (teamNumber: number, kind: AssetKind) => void;
  onBack: () => void;
}

const MAX_EDGE: Record<AssetKind, number> = { logo: 192, robot: 640 };

export function ConfigView({
  teams,
  assets,
  storageError,
  onSetAsset,
  onRemoveAsset,
  onBack,
}: Props) {
  const [teamInput, setTeamInput] = useState('');
  const [busy, setBusy] = useState<AssetKind | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const robotInput = useRef<HTMLInputElement>(null);

  const trimmed = teamInput.trim();
  const teamNumber = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  const knownTeam = teamNumber === null ? null : teams.find((team) => team.teamNumber === teamNumber);
  const suggestions = teamNumber === null && trimmed ? searchTeams(teams, trimmed, 6) : [];
  const current = teamNumber === null ? undefined : assets[String(teamNumber)];

  const lookup = useTeamLookup(knownTeam ? null : teamNumber);
  const displayName = knownTeam?.name ?? lookup.name;
  const displaySchool = knownTeam?.schoolName ?? lookup.schoolName;

  const handleFile = async (kind: AssetKind, file: File | undefined) => {
    if (!file || teamNumber === null) return;
    if (!isImageFile(file)) {
      setLocalError('Choose an image file (PNG, JPEG, WebP, SVG, …).');
      return;
    }

    setBusy(kind);
    setLocalError(null);
    try {
      const dataUrl = await fileToImageDataUrl(file, MAX_EDGE[kind]);
      onSetAsset(teamNumber, kind, dataUrl);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Could not read that image.');
    } finally {
      setBusy(null);
    }
  };

  const renderTile = (kind: AssetKind, title: string, hint: string) => {
    const dataUrl = current?.[kind];
    const inputRef = kind === 'logo' ? logoInput : robotInput;

    return (
      <div className="asset">
        <span className="asset__label">{title}</span>
        <div className="asset__preview">
          {dataUrl ? (
            <img
              className="asset__image"
              src={dataUrl}
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
            {busy === kind ? 'Processing…' : dataUrl ? 'Replace image' : 'Upload image'}
          </button>
          {dataUrl ? (
            <button
              type="button"
              className="button button--small button--danger"
              disabled={busy !== null}
              onClick={() => teamNumber !== null && onRemoveAsset(teamNumber, kind)}
            >
              Remove
            </button>
          ) : null}
        </div>
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
              Transparent PNGs of the robot work best.
            </p>
          </div>
          <button type="button" className="button button--ghost" onClick={onBack}>
            ← Back to dashboard
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
                {renderTile('logo', 'Team logo', 'No logo yet — a square image works best.')}
                {renderTile('robot', 'Robot photo', 'No photo yet — it shows in the match view.')}
              </div>
            </>
          ) : null}

          {localError ? <p className="config__error">{localError}</p> : null}
          {storageError ? <p className="config__error">{storageError}</p> : null}
        </section>

        <section className="config__panel">
          <h2>Saved teams</h2>
          <p className="config__hint">
            Logos and robot photos you have added, in this browser. Select one to edit it.
          </p>
          {teamsWithAssets(assets).length === 0 ? (
            <p className="empty">Nothing saved yet.</p>
          ) : (
            <div className="config__library">
              {teamsWithAssets(assets).map((number) => {
                const asset = assets[String(number)];
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
