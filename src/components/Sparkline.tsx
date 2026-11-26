import { useState } from 'react';

export interface SparkPoint {
  value: number;
  /** Tooltip text for the marker, e.g. the event name. */
  label?: string;
  /** Second line under the label, e.g. the date or the teams either side. */
  detail?: string;
  /** Carried forward from the last published value rather than recorded at this position. */
  estimated?: boolean;
  /** Anchor carried in from the previous season, not this one. */
  baseline?: boolean;
}

export interface SparkSeries {
  label: string;
  color: string;
  points: SparkPoint[];
}

interface Props {
  series: SparkSeries[];
  /** Caption under the chart, e.g. "6 events". */
  caption: string;
  title: string;
  /** Shown instead of the chart when there is nothing to plot. */
  empty?: string;
  /** Muted line under the legend, e.g. where carried values came from. */
  note?: string;
  /** Button text for the point at this index, or null when that point opens nothing. */
  actionFor?: (index: number) => string | null;
  onSelectPoint?: (index: number) => void;
}

const WIDTH = 244;
const HEIGHT = 34;
const PAD = 3;

/** Values that were not recorded at that position are parenthesised in the tooltip and legend. */
function formatValue(point: SparkPoint): string {
  const value = point.value.toFixed(1);
  return point.estimated ? `(${value})` : value;
}

function carried(point: SparkPoint): boolean {
  return Boolean(point.estimated || point.baseline);
}

/** Tiny multi-series line chart: hover or tap a spot to read, and open, the event or match behind it. */
export function Sparkline({
  series,
  caption,
  title,
  empty,
  note,
  actionFor,
  onSelectPoint,
}: Props) {
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);

  const length = Math.max(0, ...series.map((entry) => entry.points.length));
  if (length === 0) {
    return (
      <div className="spark">
        <div className="spark__head">
          <span className="spark__title">{title}</span>
        </div>
        <p className="spark__empty">{empty ?? 'No OPR published yet'}</p>
      </div>
    );
  }

  const all = series.flatMap((entry) => entry.points.map((point) => point.value));
  const max = Math.max(1, ...all);
  const min = Math.min(...all);
  const span = max - min || 1;

  const xyOf = (value: number, at: number): [number, number] => {
    const x = length === 1 ? WIDTH : (at / (length - 1)) * WIDTH;
    const y = PAD + (1 - (value - min) / span) * (HEIGHT - PAD * 2);
    return [x, y];
  };

  /** Nearest plotted position to a fraction across the chart. */
  const indexAt = (fraction: number): number =>
    Math.max(0, Math.min(length - 1, Math.round(fraction * (length - 1))));

  const indexFromPointer = (event: { clientX: number; currentTarget: HTMLDivElement }): number => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return indexAt((event.clientX - rect.left) / rect.width);
  };

  const clear = () => {
    setActive(null);
    setPinned(false);
  };

  const activePoint = active === null ? undefined : series[0]?.points[active];
  const action = active === null ? null : (actionFor?.(active) ?? null);
  // Keep the bubble inside the chart instead of letting it hang off either end.
  const tipLeft =
    active === null ? 50 : Math.min(88, Math.max(12, (active / Math.max(1, length - 1)) * 100));

  return (
    <div className="spark">
      <div className="spark__head">
        <span className="spark__title">{title}</span>
        <span className="spark__caption">{caption}</span>
      </div>
      <div className="spark__plot">
      <svg
        className="spark__chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}: ${series
          .map((entry) => {
            const last = entry.points.at(-1);
            return `${entry.label} ${last ? formatValue(last) : '—'}`;
          })
          .join(', ')}`}
      >
        <line className="spark__axis" x1="0" y1={HEIGHT - PAD} x2={WIDTH} y2={HEIGHT - PAD} />
        {active !== null ? (
          <line
            className="spark__guide"
            x1={xyOf(0, active)[0]}
            y1="0"
            x2={xyOf(0, active)[0]}
            y2={HEIGHT}
          />
        ) : null}
        {series.map((entry) => (
          <g key={entry.label}>
            {entry.points.map((point, at) => {
              const previous = entry.points[at - 1];
              if (!previous) return null;
              const [x1, y1] = xyOf(previous.value, at - 1);
              const [x2, y2] = xyOf(point.value, at);
              // A segment touching a carried value is dashed, so estimates never look recorded.
              const ghost = carried(point) || carried(previous);
              return (
                <line
                  key={`line-${at}`}
                  className={ghost ? 'spark__line spark__line--ghost' : 'spark__line'}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={entry.color}
                />
              );
            })}
            {entry.points.map((point, at) => {
              const isLast = at === entry.points.length - 1;
              // Mark the carried values and the latest one only, so the line stays legible.
              if (!isLast && !carried(point)) return null;
              const [x, y] = xyOf(point.value, at);
              return carried(point) ? (
                <circle
                  key={`dot-${at}`}
                  className="spark__dot spark__dot--open"
                  cx={x}
                  cy={y}
                  r="2.4"
                  fill="none"
                  style={{ stroke: entry.color }}
                />
              ) : (
                <circle
                  key={`dot-${at}`}
                  className="spark__dot"
                  cx={x}
                  cy={y}
                  r="2"
                  fill={entry.color}
                />
              );
            })}
            {active !== null && entry.points[active] ? (
              <circle
                className="spark__dot spark__dot--active"
                cx={xyOf(entry.points[active]!.value, active)[0]}
                cy={xyOf(entry.points[active]!.value, active)[1]}
                r="2.8"
                fill={entry.color}
              />
            ) : null}
          </g>
        ))}
      </svg>

      <div
        className="spark__hit"
        tabIndex={0}
        role="group"
        aria-label={`${title} — hover, or use the arrow keys, to read a point`}
        onPointerMove={(event) => {
          if (!pinned) setActive(indexFromPointer(event));
        }}
        onPointerLeave={() => {
          if (!pinned) setActive(null);
        }}
        onClick={(event) => {
          const index = indexFromPointer(event);
          if (pinned && index === active) clear();
          else {
            setActive(index);
            setPinned(true);
          }
        }}
        onKeyDown={(event) => {
          const current = active ?? length - 1;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            setActive(
              Math.max(0, Math.min(length - 1, current + (event.key === 'ArrowLeft' ? -1 : 1))),
            );
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            setActive(event.key === 'Home' ? 0 : length - 1);
          } else if (event.key === 'Escape') {
            clear();
          } else if ((event.key === 'Enter' || event.key === ' ') && active !== null) {
            event.preventDefault();
            if (action) onSelectPoint?.(active);
          }
        }}
        onBlur={(event) => {
          // Moving focus onto the bubble's own button must not tear the bubble down before the click.
          const next = event.relatedTarget as Node | null;
          if (next && event.currentTarget.parentElement?.contains(next)) return;
          clear();
        }}
      />

      {active !== null ? (
        <div
          className={pinned ? 'spark__tip spark__tip--pinned' : 'spark__tip'}
          style={{ left: `${tipLeft}%` }}
        >
          <p className="spark__tip-head">
            {activePoint?.label ?? `${title} · point ${active + 1}`}
            {activePoint?.detail ? <span>{activePoint.detail}</span> : null}
          </p>
          <ul className="spark__tip-values">
            {series.map((entry) => {
              const point = entry.points[active];
              if (!point) return null;
              return (
                <li key={entry.label}>
                  <span className="spark__swatch" style={{ background: entry.color }} />
                  {entry.label}
                  <strong>{formatValue(point)}</strong>
                </li>
              );
            })}
          </ul>
          {action ? (
            <button
              type="button"
              className="spark__tip-action"
              onClick={() => onSelectPoint?.(active)}
            >
              {action}
            </button>
          ) : null}
        </div>
      ) : null}
      </div>
      <div className="spark__legend">
        {series.map((entry) => {
          const last = entry.points.at(-1);
          return (
            <span key={entry.label} className="spark__key">
              <span className="spark__swatch" style={{ background: entry.color }} />
              {entry.label}
              <strong>{last ? formatValue(last) : '—'}</strong>
            </span>
          );
        })}
      </div>
      {note ? <p className="spark__note">{note}</p> : null}
    </div>
  );
}
