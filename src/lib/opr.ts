import type { MatchView } from './model';

export interface OprPoint {
  auto: number;
  teleop: number;
  total: number;
}

/**
 * OPR is a plain least-squares fit; the ridge only keeps early, under-determined snapshots solvable,
 * so it stays small enough to leave the fit alone (it matches FTC Scout's published values).
 */
const RIDGE = 1e-6;

interface AllianceRow {
  teams: number[];
  auto: number;
  teleop: number;
  /** Points excluding penalties, matching the API's `totalPointsNp` OPR. */
  total: number;
  quals: boolean;
}

function rowsOf(views: readonly MatchView[]): AllianceRow[] {
  const rows: AllianceRow[] = [];

  for (const view of views) {
    if (view.projected) continue;
    for (const side of view.sides) {
      // Surrogate teams play outside the ranking, so they do not contribute to the fit.
      const teams = side.entries
        .filter((entry) => entry.onField && !entry.noShow && !entry.surrogate)
        .map((entry) => entry.teamNumber);
      if (teams.length === 0) continue;
      rows.push({
        teams,
        auto: side.auto,
        teleop: side.teleop,
        total: side.total - side.penalties,
        quals: view.match.level === 'Quals',
      });
    }
  }

  // FTC Scout's event OPR comes from qualification matches; fall back when an event has none.
  const quals = rows.filter((row) => row.quals);
  return quals.length > 0 ? quals : rows;
}

/** Solves the normal equations (AᵀA + λI)x = Aᵀb for a 0/1 design matrix, without building AᵀA twice per target. */
function solve(design: number[][], targets: number[], size: number): Float64Array {
  const matrix = Array.from({ length: size }, () => new Float64Array(size));
  const rhs = new Float64Array(size);

  for (let row = 0; row < design.length; row += 1) {
    const columns = design[row]!;
    const target = targets[row]!;
    for (const i of columns) {
      rhs[i]! += target;
      for (const j of columns) matrix[i]![j]! += 1;
    }
  }
  for (let i = 0; i < size; i += 1) matrix[i]![i]! += RIDGE;

  // Gauss-Jordan with partial pivoting; the system is small (one row per team at the event).
  for (let col = 0; col < size; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < size; row += 1) {
      if (Math.abs(matrix[row]![col]!) > Math.abs(matrix[pivot]![col]!)) pivot = row;
    }
    if (pivot !== col) {
      const row = matrix[col]!;
      matrix[col] = matrix[pivot]!;
      matrix[pivot] = row;
      const value = rhs[col]!;
      rhs[col] = rhs[pivot]!;
      rhs[pivot] = value;
    }

    const lead = matrix[col]![col]!;
    if (Math.abs(lead) < 1e-9) continue;

    for (let row = 0; row < size; row += 1) {
      if (row === col) continue;
      const factor = matrix[row]![col]! / lead;
      if (factor === 0) continue;
      for (let c = col; c < size; c += 1) matrix[row]![c]! -= factor * matrix[col]![c]!;
      rhs[row]! -= factor * rhs[col]!;
    }
  }

  return rhs.map((value, i) => (Math.abs(matrix[i]![i]!) < 1e-9 ? 0 : value / matrix[i]![i]!));
}

function downsample<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items;
  const step = (items.length - 1) / (limit - 1);
  const picked: T[] = [];
  for (let i = 0; i < limit; i += 1) picked.push(items[Math.round(i * step)]!);
  return picked;
}

/**
 * The team's OPR as it stood after each match it played at this event — a running estimate computed
 * from the recorded alliance scores, so the hover card can show how a team is trending during the
 * event rather than only its final value.
 */
export function rollingOprForTeam(views: readonly MatchView[], teamNumber: number): OprPoint[] {
  const rows = rowsOf(views);
  const index = new Map<number, number>();
  for (const row of rows) {
    for (const team of row.teams) if (!index.has(team)) index.set(team, index.size);
  }
  if (!index.has(teamNumber)) return [];

  const size = index.size;
  const column = index.get(teamNumber) ?? 0;
  const design: number[][] = [];
  const points: OprPoint[] = [];

  for (const row of rows) {
    design.push(
      row.teams
        .map((team) => index.get(team) ?? 0)
        .filter((value, at, all) => all.indexOf(value) === at),
    );
    if (!row.teams.includes(teamNumber)) continue;

    const auto = solve(design, design.map((_, i) => rows[i]!.auto), size)[column] ?? 0;
    const teleop = solve(design, design.map((_, i) => rows[i]!.teleop), size)[column] ?? 0;
    const total = solve(design, design.map((_, i) => rows[i]!.total), size)[column] ?? 0;

    points.push({
      auto: Math.max(0, Math.round(auto * 10) / 10),
      teleop: Math.max(0, Math.round(teleop * 10) / 10),
      total: Math.max(0, Math.round(total * 10) / 10),
    });
  }

  return downsample(points, 14);
}
