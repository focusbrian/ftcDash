import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { searchTeams } from '../lib/teamSearch';
import type { TeamStrength } from '../types';

interface Props {
  teams: TeamStrength[];
  selected: number | null;
  onSelect: (teamNumber: number | null) => void;
  placeholder?: string;
  /** Rendered next to the selected-team chip (match count, filter toggle, ...). */
  statusExtra?: ReactNode;
}

export function TeamSearch({ teams, selected, onSelect, placeholder, statusExtra }: Props) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => searchTeams(teams, query), [teams, query]);
  const selectedTeam = selected === null ? null : teams.find((team) => team.teamNumber === selected);

  const choose = (teamNumber: number | null) => {
    onSelect(teamNumber);
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
          placeholder={placeholder ?? 'Highlight a team by number or name'}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
        />
        {selected !== null ? (
          <button
            type="button"
            className="teamsearch__clear"
            title="Clear team highlight"
            onClick={() => choose(null)}
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
              <li key={hit.teamNumber} role="option" aria-selected={hit.teamNumber === selected}>
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

      {selectedTeam ? (
        <div className="teamsearch__status">
          <span className="chip chip--team">{selectedTeam.teamNumber}</span>
          <strong>{selectedTeam.name}</strong>
          {statusExtra}
        </div>
      ) : null}
    </div>
  );
}
