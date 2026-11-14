export interface SparkPoint {
  value: number;
  /** Tooltip text for the marker, e.g. the event name. */
  label?: string;
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

/** Tiny multi-series line chart for the team hover card. */
export function Sparkline({ series, caption, title, empty, note }: Props) {
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

  return (
    <div className="spark">
      <div className="spark__head">
        <span className="spark__title">{title}</span>
        <span className="spark__caption">{caption}</span>
      </div>
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
              const text = formatValue(point);
              const tip = point.label ? `${point.label}: ${text}` : text;
              return carried(point) ? (
                <circle
                  key={`dot-${at}`}
                  className="spark__dot spark__dot--open"
                  cx={x}
                  cy={y}
                  r="2.4"
                  fill="none"
                  style={{ stroke: entry.color }}
                >
                  <title>{tip}</title>
                </circle>
              ) : (
                <circle
                  key={`dot-${at}`}
                  className="spark__dot"
                  cx={x}
                  cy={y}
                  r="2"
                  fill={entry.color}
                >
                  <title>{tip}</title>
                </circle>
              );
            })}
          </g>
        ))}
      </svg>
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
