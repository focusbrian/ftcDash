import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { slotLabel } from '../lib/autoplan';
import { loadAuton, type SavedAuton } from '../lib/autonLibrary';

interface Props {
  entries: SavedAuton[];
  /** Called with the autons that should travel in the file; may be empty. */
  onExport: (selected: SavedAuton[]) => void;
  onClose: () => void;
}

/** What one auton holds, so the export list can say more than its name. */
function summarize(entry: SavedAuton): string {
  const robot = loadAuton(entry, entry.slot);
  if (!robot) return 'cannot be read';
  const balls = robot.path.reduce((total, waypoint) => total + waypoint.shots, 0);
  const stops = robot.path.length;
  return [
    slotLabel(entry.slot),
    `${stops} stop${stops === 1 ? '' : 's'}`,
    `${balls} ball${balls === 1 ? '' : 's'}`,
  ].join(' · ');
}

/**
 * Picks which saved autons travel with an exported plan. The four-robot plan itself is always in
 * the file; ticking autons bundles them so another browser can import them in one go.
 */
export function ExportPlanDialog({ entries, onExport, onClose }: Props) {
  // Everything on the shelf is offered ticked; the plan alone is still one click away.
  const [chosen, setChosen] = useState<string[]>(() => entries.map((entry) => entry.name));
  const toggle = (name: string) =>
    setChosen((current) =>
      current.includes(name) ? current.filter((each) => each !== name) : [...current, name],
    );
  const selected = entries.filter((entry) => chosen.includes(entry.name));

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
      aria-label="Export plan JSON"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="autoplan__modal-card">
        <div className="autoplan__modal-head">
          <div>
            <p className="detail__kicker">Plan and saved autons</p>
            <h2 className="autoplan__modal-title">Export JSON</h2>
          </div>
          <button type="button" className="button button--small button--ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="autoplan__modal-hint">
          The four-robot plan on this page is always in the file. Tick any saved autons to bundle them
          too — importing the file adds them back to this browser&apos;s shelf.
        </p>

        {entries.length === 0 ? (
          <p className="autoplan__modal-empty">
            Nothing on the auton shelf yet — save one from a robot card and it will appear here.
          </p>
        ) : (
          <>
            <div className="autoplan__modal-row">
              <span className="autoplan__modal-count">
                {selected.length} of {entries.length} autons
              </span>
              <span className="autoplan__modal-toggles">
                <button
                  type="button"
                  className="button button--small button--ghost"
                  onClick={() => setChosen(entries.map((entry) => entry.name))}
                >
                  All
                </button>
                <button
                  type="button"
                  className="button button--small button--ghost"
                  onClick={() => setChosen([])}
                >
                  None
                </button>
              </span>
            </div>
            <ul className="autoplan__autons">
              {entries.map((entry) => (
                <li key={entry.name} className="autoplan__auton">
                  <label className="autoplan__auton-pick">
                    <input
                      type="checkbox"
                      checked={chosen.includes(entry.name)}
                      onChange={() => toggle(entry.name)}
                    />
                    <span className="autoplan__auton-main">
                      <strong className="autoplan__auton-name">{entry.name}</strong>
                      <span className="autoplan__auton-meta">{summarize(entry)}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="autoplan__modal-actions">
          <button type="button" className="button button--small button--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button button--small" onClick={() => onExport(selected)}>
            {selected.length === 0
              ? 'Export plan only'
              : `Export plan + ${selected.length} auton${selected.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
