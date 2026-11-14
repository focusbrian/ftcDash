import { useCallback, useEffect, useState } from 'react';
import type { TeamStrength } from '../types';

export interface TeamHoverState {
  team: TeamStrength;
  rect: { left: number; right: number; top: number; bottom: number };
}

export interface TeamHover {
  hovered: TeamHoverState | null;
  /** True when the summary was opened by tapping an info button, so it stays until dismissed. */
  pinned: boolean;
  show: (team: TeamStrength | null, element: HTMLElement | null) => void;
  hide: () => void;
  togglePin: (team: TeamStrength, element: HTMLElement | null) => void;
  unpin: () => void;
}

function stateOf(team: TeamStrength, element: HTMLElement): TeamHoverState {
  const rect = element.getBoundingClientRect();
  return { team, rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } };
}

/** Tracks which team a summary card should describe, anchored to the hovered row. */
export function useTeamHover(): TeamHover {
  const [hovered, setHovered] = useState<TeamHoverState | null>(null);
  const [pinned, setPinned] = useState(false);

  const show = useCallback(
    (team: TeamStrength | null, element: HTMLElement | null) => {
      // A tapped-open summary must not be swapped out by passing pointer or focus.
      if (pinned) return;
      setHovered(team && element ? stateOf(team, element) : null);
    },
    [pinned],
  );

  const hide = useCallback(() => {
    if (pinned) return;
    setHovered(null);
  }, [pinned]);

  const unpin = useCallback(() => {
    setPinned(false);
    setHovered(null);
  }, []);

  const togglePin = useCallback(
    (team: TeamStrength, element: HTMLElement | null) => {
      if (pinned && hovered?.team.teamNumber === team.teamNumber) {
        unpin();
        return;
      }
      if (!element) return;
      setHovered(stateOf(team, element));
      setPinned(true);
    },
    [hovered, pinned, unpin],
  );

  useEffect(() => {
    if (!pinned) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') unpin();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pinned, unpin]);

  // A fixed-position card would drift away from its row when anything scrolls.
  useEffect(() => {
    if (!hovered || pinned) return;
    const onScroll = () => setHovered(null);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [hovered, pinned]);

  return { hovered, pinned, show, hide, togglePin, unpin };
}
