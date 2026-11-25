import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { slotLabel } from '../lib/autoplan';
import {
  AUTON_LIBRARY_KEY,
  MAX_AUTON_NAME,
  autonName,
  autonNameTaken,
  loadAuton,
  type SavedAuton,
} from '../lib/autonLibrary';

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
  const label = slotLabel(slot);
  const cleaned = autonName(name);
  const replaces = autonNameTaken(entries, name);
  const rows = useMemo(() => entries.map((entry) => ({ entry, summary: summarize(entry) })), [entries]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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

        {mode === 'save' ? (
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
                  if (event.key === 'Enter' && cleaned) onSave(cleaned);
                }}
              />
            </label>
            <p className="autoplan__modal-hint">
              {replaces
                ? `“${cleaned}” is already saved — saving replaces it.`
                : `Kept in this browser only (${AUTON_LIBRARY_KEY}), so it can be loaded into any robot card.`}
            </p>
            <div className="autoplan__modal-actions">
              <button type="button" className="button button--small button--ghost" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="button button--small"
                disabled={cleaned.length === 0}
                onClick={() => onSave(cleaned)}
              >
                {replaces ? 'Replace' : 'Save'}
              </button>
            </div>
          </>
        ) : rows.length === 0 ? (
          <p className="autoplan__modal-empty">
            No autons saved yet — use <strong>Save auton…</strong> on a robot card to keep one here.
          </p>
        ) : (
          <ul className="autoplan__autons">
            {rows.map(({ entry, summary }) => (
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
      </div>
    </div>,
    document.body,
  );
}
