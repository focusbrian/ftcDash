interface Series {
  label: string;
  color: string;
  values: number[];
}

interface Props {
  series: Series[];
  /** Caption under the chart, e.g. "6 events". */
  caption: string;
  title: string;
  /** Shown instead of the chart when there is nothing to plot. */
  empty?: string;
}

const WIDTH = 244;
const HEIGHT = 34;
const PAD = 3;

/** Tiny multi-series line chart for the team hover card. */
export function Sparkline({ series, caption, title, empty }: Props) {
  const length = Math.max(0, ...series.map((entry) => entry.values.length));
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

  const all = series.flatMap((entry) => entry.values);
  const max = Math.max(1, ...all);
  const min = Math.min(...all);
  const span = max - min || 1;

  const point = (value: number, at: number): [number, number] => {
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
          .map((entry) => `${entry.label} ${Math.round(entry.values.at(-1) ?? 0)}`)
          .join(', ')}`}
      >
        <line className="spark__axis" x1="0" y1={HEIGHT - PAD} x2={WIDTH} y2={HEIGHT - PAD} />
        {series.map((entry) => {
          if (entry.values.length === 0) return null;
          const points = entry.values.map((value, at) => point(value, at));
          const [lastX, lastY] = points.at(-1) ?? [0, 0];
          return (
            <g key={entry.label}>
              {points.length > 1 ? (
                <polyline
                  className="spark__line"
                  points={points.map(([x, y]) => `${x},${y}`).join(' ')}
                  stroke={entry.color}
                />
              ) : null}
              <circle className="spark__dot" cx={lastX} cy={lastY} r="2" fill={entry.color} />
            </g>
          );
        })}
      </svg>
      <div className="spark__legend">
        {series.map((entry) => (
          <span key={entry.label} className="spark__key">
            <span className="spark__swatch" style={{ background: entry.color }} />
            {entry.label}
            <strong>{entry.values.at(-1)?.toFixed(1) ?? '—'}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
