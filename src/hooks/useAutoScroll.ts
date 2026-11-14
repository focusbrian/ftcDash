import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** How long the list rests at the end before the cycle moves on. */
const END_PAUSE_MS = 1800;

/** Giving the pointer or a wheel a moment of control keeps auto-scroll from fighting a reader. */
const HANDOVER_PAUSE_MS = 2500;

interface Options {
  /** Element that scrolls; only a container with a fixed height overflows, so this must be the pane. */
  target: RefObject<HTMLElement | null>;
  /** False when nothing is selected, or on a screen where the list is not visible. */
  enabled: boolean;
  /** Pixels per second. */
  speed: number;
  /** Changing this restarts the current list at the top. */
  view: string;
  /** Called once the list has reached (or already was at) the end; advance to the next list here. */
  onCycle: () => void;
}

/**
 * Scrolls a pane at a steady rate and calls `onCycle` once it reaches the bottom, so the schedule,
 * ranking and prediction lists can be handed round on a screen nobody is touching.
 */
export function useAutoScroll({ target, enabled, speed, view, onCycle }: Options): void {
  const cycleRef = useRef(onCycle);
  cycleRef.current = onCycle;

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    element.scrollTop = 0;
  }, [target, view]);

  useEffect(() => {
    const element = target.current;
    if (!element || !enabled) return;

    let frame = 0;
    let previous = performance.now();
    /** Timestamp the list first sat at the end, or null while it still has somewhere to go. */
    let atEndSince: number | null = null;
    let holdUntil = 0;
    /**
     * Scroll offset kept here rather than read back each frame: browsers snap `scrollTop` to whole
     * pixels, so reading it mid-frame would round away the sub-pixel step slow speeds depend on.
     */
    let position = element.scrollTop;
    /** A pointer resting on the list means someone is reading it, so scrolling waits for them. */
    let pointerInside = false;

    const hold = () => {
      holdUntil = performance.now() + HANDOVER_PAUSE_MS;
    };
    const onPointerDown = () => hold();
    const onWheel = () => hold();
    const onKeyDown = () => hold();
    const onPointerEnter = () => {
      pointerInside = true;
      atEndSince = null;
    };
    const onPointerLeave = () => {
      pointerInside = false;
      hold();
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('wheel', onWheel, { passive: true });
    element.addEventListener('keydown', onKeyDown);
    element.addEventListener('pointerenter', onPointerEnter);
    element.addEventListener('pointerleave', onPointerLeave);
    element.addEventListener('pointercancel', onPointerLeave);

    const step = (now: number) => {
      frame = requestAnimationFrame(step);
      const elapsed = Math.min(now - previous, 250);
      previous = now;

      const max = element.scrollHeight - element.clientHeight;
      // Anything the page itself did to the offset (a new list, a dragged scrollbar) wins over our count.
      if (Math.abs(element.scrollTop - Math.min(position, Math.max(0, max))) > 2) {
        position = element.scrollTop;
        atEndSince = null;
      }

      if (pointerInside || now < holdUntil) {
        atEndSince = null;
        return;
      }

      if (max - position > 1) {
        position = Math.min(position + (speed * elapsed) / 1000, max);
        element.scrollTop = position;
        atEndSince = null;
        return;
      }

      // Nothing left to scroll: rest at the end (or at the top of a list that already fits) before moving on.
      if (atEndSince === null) atEndSince = now;
      else if (now - atEndSince >= END_PAUSE_MS) {
        atEndSince = null;
        position = 0;
        element.scrollTop = 0;
        cycleRef.current();
      }
    };

    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('keydown', onKeyDown);
      element.removeEventListener('pointerenter', onPointerEnter);
      element.removeEventListener('pointerleave', onPointerLeave);
      element.removeEventListener('pointercancel', onPointerLeave);
    };
  }, [target, enabled, speed]);
}
