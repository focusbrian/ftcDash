import type { SeasonOprPoint } from './seasonOpr';
import { fmtDate } from './format';
import type { OprPoint } from './opr';

/** Colours shared with the record stars on the schedule cards. */
export const OPR_COLORS = {
  auto: '#6fb3f2',
  teleop: '#4ade80',
  total: '#ffc861',
} as const;

/** Structural shape of a sparkline point, so this module need not import the component. */
export interface OprSparkPoint {
  value: number;
  label?: string;
  /** Second line under the label — the date, or the teams either side. */
  detail?: string;
  estimated?: boolean;
  baseline?: boolean;
}

export interface OprSparkSeries {
  label: string;
  color: string;
  points: OprSparkPoint[];
}

/** One point per event of the season, anchored to the previous season and marking carried values. */
export function seasonSparkSeries(points: readonly SeasonOprPoint[]): OprSparkSeries[] {
  const build = (key: 'auto' | 'teleop' | 'total', label: string, color: string) => ({
    label,
    color,
    points: points.map((point) => ({
      value: point[key],
      label: point.kind === 'prior' ? `${point.season} season OPR` : point.name,
      // The anchor point is named by the event it came from; the rest carry their date.
      detail: point.kind === 'prior' ? point.name : fmtDate(point.start),
      baseline: point.kind === 'prior',
      estimated: point.kind === 'estimate',
    })),
  });

  return [
    build('auto', 'Auton', OPR_COLORS.auto),
    build('teleop', 'Teleop', OPR_COLORS.teleop),
    build('total', 'Total', OPR_COLORS.total),
  ];
}

/** One point per qualification match of the event. */
export function eventSparkSeries(points: readonly OprPoint[]): OprSparkSeries[] {
  const build = (key: 'auto' | 'teleop' | 'total', label: string, color: string) => ({
    label,
    color,
    points: points.map((point) => ({
      value: point[key],
      label: point.label,
      detail: point.detail,
    })),
  });

  return [
    build('auto', 'Auton', OPR_COLORS.auto),
    build('teleop', 'Teleop', OPR_COLORS.teleop),
    build('total', 'Total', OPR_COLORS.total),
  ];
}
