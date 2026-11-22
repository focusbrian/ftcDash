import { useMemo, useRef, useState } from 'react';
import firstLogo from '../assets/first-logo.webp';
import { useTeamLookup } from '../hooks/useTeamLookup';
import {
  clearSharedDraft,
  loadSharedDraft,
  robotSeasons,
  saveSharedDraft,
  teamsWithAssets,
  withAsset,
  withoutAsset,
  type AssetKind,
  type AssetStore,
  type TeamAsset,
} from '../lib/assets';
import { countAssets, parseBackup, serializeBackup } from '../lib/backup';
import { fileToImageDataUrl, isImageFile, MAX_ASSET_SIZE } from '../lib/image';
import { defaultSeason } from '../lib/route';
import type { SharedAssetsState } from '../hooks/useSharedAssets';

interface Props {
  published: SharedAssetsState;
  onBack: () => void;
}

/** Not a lock: the key ships in the bundle, it only keeps the page out of casual hands. */
export const ADMIN_KEY = 'frost10136';
const UNLOCK_KEY = 'ftcdash.adminUnlocked.v1';

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function downloadSharedFile(store: AssetStore): void {
  const blob = new Blob([serializeBackup(store)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'shared-assets.json';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function LockedAdmin({ onUnlock }: { onUnlock: (value: string) => boolean }) {
  const [key, setKey] = useState('');
  const [wrong, setWrong] = useState(false);

  return (
    <div className="config">
      <div className="config__inner">
        <section className="config__panel admin-gate">
          <h1 className="admin__title">Shared asset library</h1>
          <p className="config__hint">
            This page is not linked from anywhere. Enter the admin key to edit the logos and robot
            photos that ship with the site.
          </p>
          <form
            className="admin-gate__row"
            onSubmit={(event) => {
              event.preventDefault();
              setWrong(!onUnlock(key.trim()));
            }}
          >
            <input
              className="field__control"
              type="password"
              value={key}
              placeholder="Admin key"
              aria-label="Admin key"
              autoFocus
              onChange={(event) => {
                setKey(event.target.value);
                setWrong(false);
              }}
            />
            <button type="submit" className="button">
              Unlock
            </button>
          </form>
          {wrong ? <p className="config__error">That key does not match.</p> : null}
        </section>
      </div>
    </div>
  );
}

/** Unlinked editor for the committed asset library, which every visitor sees by default. */
export function AdminView({ published, onBack }: Props) {
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return window.sessionStorage.getItem(UNLOCK_KEY) === 'yes';
    } catch {
      return false;
    }
  });

  const [draft, setDraft] = useState<AssetStore | null>(() => loadSharedDraft());
  const [teamInput, setTeamInput] = useState('');
  const [robotSeason, setRobotSeason] = useState(() => defaultSeason());
  const [busy, setBusy] = useState<AssetKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const robotInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Until the editor is touched, the draft is simply what the site ships.
  const store = draft ?? published.assets;
  const teams = useMemo(() => teamsWithAssets(store), [store]);
  const total = useMemo(() => countAssets(store), [store]);

  const trimmed = teamInput.trim();
  const teamNumber = /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  const lookup = useTeamLookup(teamNumber);
  const current: TeamAsset | undefined = teamNumber === null ? undefined : store[String(teamNumber)];
  const savedSeasons = robotSeasons(current);
  const seasonRobot = current?.robots?.[String(robotSeason)];
  const robotImage = seasonRobot ?? current?.robot;

  // Compared against the published file rather than the draft, so the label follows the image.
  const publishedAsset = teamNumber === null ? undefined : published.assets[String(teamNumber)];
  const logoFromPublished = Boolean(current?.logo) && publishedAsset?.logo === current?.logo;
  const robotFromPublished =
    Boolean(robotImage) &&
    (publishedAsset?.robots?.[String(robotSeason)] ?? publishedAsset?.robot) === robotImage;

  const commit = (next: AssetStore) => {
    try {
      saveSharedDraft(next);
      setDraft(next);
      setError(null);
    } catch {
      setError('Browser storage is full — export what you have, then remove an image and retry.');
    }
  };

  const handleFile = async (kind: AssetKind, file: File | undefined) => {
    if (!file || teamNumber === null) return;
    if (!isImageFile(file)) {
      setError('Choose an image file (PNG, JPEG, WebP, SVG, …).');
      return;
    }

    setBusy(kind);
    setError(null);
    try {
      const dataUrl = await fileToImageDataUrl(file, MAX_ASSET_SIZE[kind]);
      commit(withAsset(store, teamNumber, kind, dataUrl, kind === 'robot' ? robotSeason : undefined));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that image.');
    } finally {
      setBusy(null);
    }
  };

  const handleLoadFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setNote(null);
    try {
      const loaded = parseBackup(await file.text());
      commit(loaded);
      setNote(`Loaded ${plural(countAssets(loaded), 'image')} from ${file.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that file.');
    }
  };

  if (!unlocked) {
    return (
      <LockedAdmin
        onUnlock={(value) => {
          if (value !== ADMIN_KEY) return false;
          try {
            window.sessionStorage.setItem(UNLOCK_KEY, 'yes');
          } catch {
            // A browser that refuses sessionStorage still gets the page for this visit.
          }
          setUnlocked(true);
          return true;
        }}
      />
    );
  }

  return (
    <div className="config">
      <div className="config__inner">
        <header className="config__head">
          <div>
            <p className="detail__kicker">Admin</p>
            <h1 className="admin__title">Shared asset library</h1>
            <p className="config__intro">
              These logos and robot photos ship with the site, so every visitor sees them without
              uploading anything; anything a visitor adds in their own browser takes precedence.
              Edit here, then <strong>Download shared-assets.json</strong>, replace
              <code> public/shared-assets.json</code> with it and deploy.
            </p>
          </div>
          <button type="button" className="button button--ghost" onClick={onBack}>
            ← Back
          </button>
        </header>

        <section className="config__panel">
          <h2>Draft</h2>
          <p className="config__hint">
            {plural(teams.length, 'team')} · {plural(total, 'image')} ·{' '}
            {draft === null
              ? 'unchanged from the published file'
              : 'edited in this browser since the published file'}
            {published.status === 'loading' ? ' · reading the published file…' : ''}
          </p>
          <div className="asset__actions">
            <button
              type="button"
              className="button button--small"
              disabled={total === 0}
              onClick={() => downloadSharedFile(store)}
            >
              Download shared-assets.json
            </button>
            <input
              ref={fileInput}
              className="asset__input"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void handleLoadFile(file);
              }}
            />
            <button
              type="button"
              className="button button--small button--ghost"
              onClick={() => fileInput.current?.click()}
            >
              Load file…
            </button>
            <button
              type="button"
              className="button button--small button--danger"
              disabled={draft === null}
              onClick={() => {
                clearSharedDraft();
                setDraft(null);
                setNote('Draft discarded — showing the published file again.');
                setError(null);
              }}
            >
              Discard draft
            </button>
          </div>
          {note ? <p className="config__note">{note}</p> : null}
          {error ? <p className="config__error">{error}</p> : null}
        </section>

        <section className="config__panel">
          <h2>Team</h2>
          <p className="config__hint">Type the team number whose images you want to set.</p>
          <input
            className="field__control"
            type="text"
            inputMode="numeric"
            placeholder="Team number, e.g. 10136"
            value={teamInput}
            onChange={(event) => {
              setTeamInput(event.target.value);
              setError(null);
              setNote(null);
            }}
          />

          {teamNumber !== null ? (
            <>
              <p className="teamsearch__status">
                <span className="chip chip--team">{teamNumber}</span>
                <strong>
                  {lookup.name ?? (lookup.loading ? 'Looking up team…' : 'Unknown team')}
                </strong>
                {lookup.schoolName ? <span>· {lookup.schoolName}</span> : null}
              </p>

              <div className="config__assets">
                <div className="asset">
                  <span className="asset__label">Team logo</span>
                  <div className="asset__preview">
                    {current?.logo ? (
                      <img className="asset__image" src={current.logo} alt="" />
                    ) : (
                      <span className="asset__empty">No logo yet — a square image works best.</span>
                    )}
                  </div>
                  <div className="asset__actions">
                    <input
                      ref={logoInput}
                      className="asset__input"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        void handleFile('logo', file);
                      }}
                    />
                    <button
                      type="button"
                      className="button button--small"
                      disabled={busy !== null}
                      onClick={() => logoInput.current?.click()}
                    >
                      {busy === 'logo' ? 'Processing…' : current?.logo ? 'Replace' : 'Upload'}
                    </button>
                    {current?.logo ? (
                      <button
                        type="button"
                        className="button button--small button--danger"
                        disabled={busy !== null}
                        onClick={() => commit(withoutAsset(store, teamNumber, 'logo'))}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  {logoFromPublished ? (
                    <p className="asset__note">
                      Live in the published file — replacing it here changes it for everyone.
                    </p>
                  ) : null}
                </div>

                <div className="asset">
                  <span className="asset__label">Robot photo</span>
                  <div className="asset__season">
                    <label htmlFor="admin-robot-season">Season</label>
                    <select
                      id="admin-robot-season"
                      className="field__control"
                      value={robotSeason}
                      onChange={(event) => setRobotSeason(Number(event.target.value))}
                    >
                      {[...new Set([seasonRobot ? robotSeason : defaultSeason(), ...savedSeasons])]
                        .sort((a, b) => b - a)
                        .map((season) => (
                          <option key={season} value={season}>
                            {season}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="asset__preview">
                    {robotImage ? (
                      <img className="asset__image" src={robotImage} alt="" />
                    ) : (
                      <span className="asset__empty">
                        No robot image for {robotSeason} yet — transparent PNGs work best.
                      </span>
                    )}
                  </div>
                  <div className="asset__actions">
                    <input
                      ref={robotInput}
                      className="asset__input"
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        void handleFile('robot', file);
                      }}
                    />
                    <button
                      type="button"
                      className="button button--small"
                      disabled={busy !== null}
                      onClick={() => robotInput.current?.click()}
                    >
                      {busy === 'robot' ? 'Processing…' : robotImage ? 'Replace' : 'Upload'}
                    </button>
                    {robotImage ? (
                      <button
                        type="button"
                        className="button button--small button--danger"
                        disabled={busy !== null}
                        onClick={() =>
                          commit(withoutAsset(store, teamNumber, 'robot', seasonRobot ? robotSeason : undefined))
                        }
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  {!seasonRobot && current?.robot ? (
                    <p className="asset__note">
                      No image for {robotSeason} — showing the one saved for every season.
                    </p>
                  ) : null}
                  {robotFromPublished ? (
                    <p className="asset__note">
                      Live in the published file — replacing it here changes it for everyone.
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </section>

        <section className="config__panel">
          <h2>In the library</h2>
          {teams.length === 0 ? (
            <p className="empty">
              Nothing yet. Upload a logo or robot photo above, then download the file.
            </p>
          ) : (
            <div className="config__library">
              {teams.map((number) => {
                const asset = store[String(number)];
                return (
                  <button
                    key={number}
                    type="button"
                    className="library-card"
                    onClick={() => {
                      setTeamInput(String(number));
                      const seasons = robotSeasons(asset);
                      if (seasons[0] !== undefined) setRobotSeason(seasons[0]);
                    }}
                  >
                    {asset?.logo ? (
                      <img className="library-card__logo" src={asset.logo} alt={`Team ${number} logo`} />
                    ) : (
                      <img
                        className="library-card__logo library-card__logo--placeholder"
                        src={firstLogo}
                        alt=""
                      />
                    )}
                    <span className="library-card__body">
                      <span className="library-card__number">{number}</span>
                      <span className="library-card__tags">
                        {asset?.logo ? <span>logo</span> : null}
                        {asset?.robot ? <span>robot</span> : null}
                        {asset?.robots
                          ? Object.keys(asset.robots).map((season) => (
                              <span key={season}>robot {season}</span>
                            ))
                          : null}
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
