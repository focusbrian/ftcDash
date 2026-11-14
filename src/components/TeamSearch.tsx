import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { searchTeams } from '../lib/teamSearch';
import type { TeamStrength } from '../types';

interface Props {
  teams: TeamStrength[];
  selected: readonly number[];
  onAdd: (teamNumber: number) => void;
  onRemove: (teamNumber: number) => void;
  onClear: () => void;
  placeholder?: string;
  /** Rendered next to the selected-team chips (match count, filter toggle, ...). */
  statusExtra?: ReactNode;
}

export function TeamSearch({
  teams,
  selected,
  onAdd,
  onRemove,
  onClear,
  placeholder,
  statusExtra,
}: Props) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(
    () => searchTeams(teams, query).filter((hit) => !selected.includes(hit.teamNumber)),
    [teams, query, selected],
  );

  const chosen = selected.map((teamNumber) => ({
    teamNumber,
    name: teams.find((team) => team.teamNumber === teamNumber)?.name ?? '',
  }));

  const choose = (teamNumber: number) => {
    onAdd(teamNumber);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setQuery('');
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const first = suggestions[0];
    if (first) choose(first.teamNumber);
  };

  return (
    <div className="teamsearch">
      <div className="teamsearch__row">
        <input
          className="teamsearch__input"
          type="search"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={
            chosen.length > 0
              ? 'Add another team…'
              : (placeholder ?? 'Highlight teams by number or name')
          }
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
        />
        {chosen.length > 0 ? (
          <button
            type="button"
            className="teamsearch__clear"
            title="Clear highlighted teams"
            aria-label="Clear highlighted teams"
            onClick={onClear}
          >
            ✕
          </button>
        ) : null}
      </div>

      {open && query.trim() ? (
        <ul className="teamsearch__menu" id={listId} role="listbox">
          {suggestions.length === 0 ? (
            <li className="teamsearch__empty">No team in this event matches “{query.trim()}”.</li>
          ) : (
            suggestions.map((hit) => (
              <li key={hit.teamNumber} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="teamsearch__option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(hit.teamNumber)}
                >
                  <span className="teamsearch__number">{hit.teamNumber}</span>
                  <span className="teamsearch__name">{hit.name}</span>
                  {hit.rank ? <span className="teamsearch__rank">#{hit.rank}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {chosen.length > 0 ? (
        <div className="teamsearch__status">
          <ul className="teamchips">
            {chosen.map((team) => (
              <li key={team.teamNumber} className="teamchip">
                <span className="teamchip__number">{team.teamNumber}</span>
                {team.name ? <span className="teamchip__name">{team.name}</span> : null}
                <button
                  type="button"
                  className="teamchip__remove"
                  title={`Stop highlighting ${team.teamNumber}`}
                  aria-label={`Stop highlighting ${team.teamNumber}`}
                  onClick={() => onRemove(team.teamNumber)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {statusExtra}
        </div>
      ) : null}
    </div>
  );
}
