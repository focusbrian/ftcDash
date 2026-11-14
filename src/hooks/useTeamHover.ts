import { useCallback, useEffect, useState } from 'react';
import type { TeamStrength } from '../types';

export interface TeamHoverState {
  team: TeamStrength;
  rect: { left: number; right: number; top: number; bottom: number };
}

export interface TeamHover {
  hovered: TeamHoverState | null;
  show: (team: TeamStrength | null, element: HTMLElement | null) => void;
  hide: () => void;
}

/** Tracks which team a summary card should describe, anchored to the hovered row. */
export function useTeamHover(): TeamHover {
  const [hovered, setHovered] = useState<TeamHoverState | null>(null);

  const show = useCallback((team: TeamStrength | null, element: HTMLElement | null) => {
    if (!team || !element) {
      setHovered(null);
      return;
    }
    const rect = element.getBoundingClientRect();
    setHovered({
      team,
      rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
    });
  }, []);

  const hide = useCallback(() => setHovered(null), []);

  // A fixed-position card would drift away from its row when anything scrolls.
  useEffect(() => {
    if (!hovered) return;
    const onScroll = () => setHovered(null);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [hovered]);

  return { hovered, show, hide };
}
