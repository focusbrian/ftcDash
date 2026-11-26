import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { slotLabel, type Alliance } from '../lib/autoplan';
import {
  AUTON_LIBRARY_KEY,
  MAX_AUTON_NAME,
  autonName,
  filterAutons,
  findAuton,
  loadAuton,
  type SavedAuton,
} from '../lib/autonLibrary';

/** The two colours the shelf can be narrowed to, plus everything. */
const ALLIANCE_FILTERS: { value: Alliance | 'all'; text: string }[] = [
  { value: 'all', text: 'All' },
  { value: 'red', text: 'Red' },
  { value: 'blue', text: 'Blue' },
];

interface Props {
  /** `save` asks for a name; `load` offers the shelf. */
  mode: 'save' | 'load';
  /** The column the auton is being saved from or loaded into. */
  slot: number;
  entries: SavedAuton[];
  /** Suggested name when saving. */
  initialName: string;
  onSave: (name: string) => void;
  onLoad: (entry: SavedAuton) => void;
  onDelete: (entry: SavedAuton) => void;
  onClose: () => void;
}

function savedWhen(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** One line about what an auton holds, read back the way it would be loaded. */
function summarize(entry: SavedAuton): string {
  const robot = loadAuton(entry, entry.slot);
  if (!robot) return 'cannot be read';
  const balls = robot.path.reduce((total, waypoint) => total + waypoint.shots, 0);
  const stops = robot.path.length;
  const when = savedWhen(entry.savedAt);
  return [
    slotLabel(entry.slot),
    `${stops} stop${stops === 1 ? '' : 's'}`,
    `${balls} ball${balls === 1 ? '' : 's'}`,
    robot.teamNumber === null ? null : `team ${robot.teamNumber}`,
    when ? `saved ${when}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * The browser's auton shelf: name a robot's program and keep it, or pick one to load into the
 * selected column. Stored under `AUTON_LIBRARY_KEY`, so it travels with this browser only.
 */
export function AutonLibraryDialog({
  mode,
  slot,
  entries,
  initialName,
  onSave,
  onLoad,
  onDelete,
  onClose,
}: Props) {
  const [name, setName] = useState(initialName);
  /** The saved auton the current name would overwrite, once the saver has been asked about it. */
  const [confirming, setConfirming] = useState<SavedAuton | null>(null);
  const label = slotLabel(slot);
  const cleaned = autonName(name);
  const replacing = findAuton(entries, name);
  const rows = useMemo(() => entries.map((entry) => ({ entry, summary: summarize(entry) })), [entries]);
  // Loading is a search: narrow the shelf by name and by the alliance it was saved from.
  const [query, setQuery] = useState('');
  const [alliance, setAlliance] = useState<Alliance | 'all'>('all');
  const shown = useMemo(
    () => filterAutons(entries, query, alliance).map((entry) => ({ entry, summary: summarize(entry) })),
    [entries, query, alliance],
  );
  const searched = autonName(query);

  const submit = () => {
    if (!cleaned) return;
    // Naming something that is already on the shelf is a replace, so it asks first.
    if (replacing) setConfirming(replacing);
    else onSave(cleaned);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirming) setConfirming(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirming]);

  return createPortal(
    <div
      className="autoplan__modal"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'save' ? `Save ${label} auton` : `Load an auton into ${label}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="autoplan__modal-card">
        <div className="autoplan__modal-head">
          <div>
            <p className="detail__kicker">Saved in this browser</p>
            <h2 className="autoplan__modal-title">
              {mode === 'save' ? `Save ${label} auton` : `Load into ${label}`}
            </h2>
          </div>
          <button type="button" className="button button--small button--ghost" onClick={onClose}>
            Close
          </button>
        </div>

        {confirming ? (
          <>
            <p className="autoplan__modal-question">
              Replace the saved auton “{confirming.name}”?
            </p>
            <p className="autoplan__modal-hint">
              {summarize(confirming)}. Overwriting puts {label}&rsquo;s current program in its place;
              this cannot be undone.
            </p>
            <div className="autoplan__modal-actions">
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={() => setConfirming(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button--small button--danger"
                onClick={() => onSave(autonName(confirming.name))}
              >
                Overwrite
              </button>
            </div>
          </>
        ) : mode === 'save' ? (
          <>
            <label className="autoplan__modal-field">
              <span>Auton name</span>
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog exists to name this one thing
                autoFocus
                className="field__control"
                type="text"
                value={name}
                maxLength={MAX_AUTON_NAME}
                placeholder="e.g. Left side, 4 ball"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') submit();
                }}
              />
            </label>
            <p className="autoplan__modal-hint">
              {replacing
                ? `“${cleaned}” is already saved — replacing it asks first.`
                : `Kept in this browser only (${AUTON_LIBRARY_KEY}), so it can be loaded into any robot card.`}
            </p>
            {rows.length > 0 ? (
              <>
                <p className="autoplan__modal-row">
                  <span>Or pick one to save over</span>
                  <span className="autoplan__modal-count">
                    {rows.length} saved
                  </span>
                </p>
                <ul className="autoplan__autons">
                  {rows.map(({ entry, summary }) => (
                    <li key={entry.name} className="autoplan__auton">
                      <button
                        type="button"
                        className={
                          entry.name === replacing?.name
                            ? 'autoplan__auton-choose autoplan__auton-choose--on'
                            : 'autoplan__auton-choose'
                        }
                        aria-pressed={entry.name === replacing?.name}
                        title={`Save over “${entry.name}”`}
                        onClick={() => setName(entry.name)}
                      >
                        <strong className="autoplan__auton-name">{entry.name}</strong>
                        <span className="autoplan__auton-meta">{summary}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <div className="autoplan__modal-actions">
              <button type="button" className="button button--small button--ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="button button--small"
                disabled={cleaned.length === 0}
                onClick={submit}
              >
                {replacing ? 'Replace…' : 'Save'}
              </button>
            </div>
          </>
        ) : rows.length === 0 ? (
          <p className="autoplan__modal-empty">
            No autons saved yet — use <strong>Save</strong> on a robot card to keep one here.
          </p>
        ) : (
          <>
            <label className="autoplan__modal-field autoplan__modal-search">
              <span>Search</span>
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus -- the dialog is opened to find one auton
                autoFocus
                className="field__control"
                type="search"
                value={query}
                placeholder="Name or team number"
                aria-label="Search saved autons by name or team"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="autoplan__modal-row">
              <span className="autoplan__modal-count">
                {shown.length} of {rows.length} auton{rows.length === 1 ? '' : 's'}
              </span>
              <span className="autoplan__modal-toggles" role="group" aria-label="Saved from">
                {ALLIANCE_FILTERS.map(({ value, text }) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      alliance === value
                        ? 'button button--small autoplan__filter autoplan__filter--on'
                        : 'button button--small button--ghost autoplan__filter'
                    }
                    aria-pressed={alliance === value}
                    onClick={() => setAlliance(value)}
                  >
                    <span className={`autoplan__dot autoplan__dot--${value === 'all' ? 'any' : value}`} />
                    {text}
                  </button>
                ))}
              </span>
            </div>
            {shown.length === 0 ? (
              <p className="autoplan__modal-empty">
                Nothing on the shelf matches{searched.length > 0 ? ` “${searched}”` : ''}
                {alliance === 'all' ? '' : ` among the ${alliance} autons`}.
              </p>
            ) : (
              <ul className="autoplan__autons">
                {shown.map(({ entry, summary }) => (
                  <li key={entry.name} className="autoplan__auton">
                    <div className="autoplan__auton-main">
                      <strong className="autoplan__auton-name">{entry.name}</strong>
                      <span className="autoplan__auton-meta">{summary}</span>
                    </div>
                    <button
                      type="button"
                      className="button button--small"
                      onClick={() => onLoad(entry)}
                    >
                      Load
                    </button>
                    <button
                      type="button"
                      className="autoplan__row-remove"
                      aria-label={`Delete ${entry.name}`}
                      title="Remove this auton from the browser"
                      onClick={() => onDelete(entry)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
