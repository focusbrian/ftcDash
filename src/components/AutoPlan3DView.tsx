import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AUTO_SECONDS, type AutoPlan } from '../lib/autoplan';
import type { AssetStore } from '../lib/assets';
import type { AutoplanScene } from '../lib/autoplanScene';

interface Props {
  plan: AutoPlan;
  assets: AssetStore;
  /** Team names by slot, so a robot with no logo can wear its initial. */
  teamNames: (string | null | undefined)[];
  time: number;
  playing: boolean;
  rate: number;
  onTime: (seconds: number) => void;
  onTogglePlay: () => void;
  onRate: (rate: number) => void;
  onClose: () => void;
}

/**
 * The plan in three dimensions: the same timetable the map plays, seen from any angle. All of the
 * scene work lives in `lib/autoplanScene`, which pulls in three.js, so it is imported lazily — the
 * planner never pays for it unless this view is opened.
 */
export function AutoPlan3DView({
  plan,
  assets,
  teamNames,
  time,
  playing,
  rate,
  onTime,
  onTogglePlay,
  onRate,
  onClose,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<AutoplanScene | null>(null);
  const planRef = useRef(plan);
  planRef.current = plan;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const namesRef = useRef(teamNames);
  namesRef.current = teamNames;
  const timeRef = useRef(time);
  timeRef.current = time;

  const [view, setView] = useState<'field' | 'top'>('field');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Names arrive as a fresh array each render, so the effect watches their contents instead.
  const nameKey = useMemo(() => teamNames.map((name) => name ?? '').join('|'), [teamNames]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { createAutoplanScene } = await import('../lib/autoplanScene');
        if (cancelled || !hostRef.current) return;
        // Resolves once the field CAD has loaded (or failed and left the stand-in field up).
        const scene = await createAutoplanScene({
          container: hostRef.current,
          plan: planRef.current,
          assets: assetsRef.current,
          teamNames: namesRef.current,
        });
        if (cancelled) {
          scene.dispose();
          return;
        }
        sceneRef.current = scene;
        scene.setTime(timeRef.current);
        setReady(true);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? `3D view could not start: ${cause.message}`
            : '3D view could not start in this browser.',
        );
      }
    })();

    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, []);

  // The plan is the source of truth: rebuild the robots whenever it changes.
  useEffect(() => {
    if (!ready) return;
    sceneRef.current?.setPlan(plan, assets, namesRef.current);
  }, [plan, assets, nameKey, ready]);

  useEffect(() => {
    if (!ready) return;
    sceneRef.current?.setTime(time);
  }, [time, ready]);

  useEffect(() => {
    if (!ready) return;
    sceneRef.current?.setView(view);
  }, [view, ready]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="autoplan__three" role="dialog" aria-modal="true" aria-label="Autonomous plan in 3D">
      <div className="autoplan__three-bar">
        <div>
          <p className="detail__kicker">3D playback · BIOBUZZ 2026–27</p>
          <h2 className="autoplan__three-title">Autonomous plan</h2>
        </div>
        <div className="autoplan__three-views">
          <button
            type="button"
            className="button button--small button--ghost"
            aria-pressed={view === 'field'}
            onClick={() => setView('field')}
          >
            Field
          </button>
          <button
            type="button"
            className="button button--small button--ghost"
            aria-pressed={view === 'top'}
            onClick={() => setView('top')}
          >
            Top
          </button>
        </div>
        <button type="button" className="button button--ghost" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="autoplan__three-stage">
        <div ref={hostRef} className="autoplan__three-canvas" />
        {ready ? null : <p className="autoplan__three-loading">{error ?? 'Building the field…'}</p>}
        <p className="autoplan__three-hint">Drag to orbit · scroll to zoom</p>
      </div>

      <div className="autoplan__three-transport">
        <button type="button" className="button button--small autoplan__play" onClick={onTogglePlay}>
          {playing ? '❚❚ Pause' : '▶ Play'}
        </button>
        <input
          className="autoplan__scrub"
          type="range"
          min={0}
          max={AUTO_SECONDS}
          step={0.05}
          value={time}
          aria-label="3D timeline"
          onChange={(event) => onTime(Number(event.target.value))}
        />
        <span className="autoplan__clock">
          <strong>{time.toFixed(2)} s</strong> / {AUTO_SECONDS} s
        </span>
        <select
          className="field__control autoplan__rate"
          value={rate}
          aria-label="3D playback speed"
          onChange={(event) => onRate(Number(event.target.value))}
        >
          <option value={0.25}>¼×</option>
          <option value={0.5}>½×</option>
          <option value={1}>1×</option>
          <option value={2}>2×</option>
        </select>
      </div>
    </div>,
    document.body,
  );
}
