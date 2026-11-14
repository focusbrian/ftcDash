import type { TeamStrength } from '../types';

export interface Contribution {
  teamNumber: number;
  auto: number;
  teleop: number;
  total: number;
}

export interface Projection {
  auto: number;
  teleop: number;
  total: number;
  /** Combined standard deviation of the alliance's match total. */
  sigma: number;
  contributions: Contribution[];
  /** Teams on the field with no OPR data (counted as zero). */
  missingTeams: number[];
}

/** Fallback spread when a team has no recorded deviation, as a fraction of their OPR plus a floor. */
const FALLBACK_SIGMA_RATIO = 0.15;
const FALLBACK_SIGMA_FLOOR = 8;

function teamSigma(strength: TeamStrength, total: number): number {
  if (strength.sigma > 0) return strength.sigma;
  return FALLBACK_SIGMA_RATIO * total + FALLBACK_SIGMA_FLOOR;
}

/**
 * Projects an alliance's auto and teleop (driver-controlled) output by summing the
 * OPR of the teams that will actually be on the field. Negative OPR values are
 * possible in the regression and are floored at zero.
 */
export function projectAlliance(
  teamNumbers: number[],
  strengths: Map<number, TeamStrength>,
): Projection {
  const contributions: Contribution[] = [];
  const missingTeams: number[] = [];
  let variance = 0;

  for (const teamNumber of teamNumbers) {
    const strength = strengths.get(teamNumber);
    if (!strength || !strength.hasOpr) {
      missingTeams.push(teamNumber);
      contributions.push({ teamNumber, auto: 0, teleop: 0, total: 0 });
      variance += FALLBACK_SIGMA_FLOOR ** 2;
      continue;
    }

    const auto = Math.max(0, strength.oprAuto);
    const teleop = Math.max(0, strength.oprTeleop);
    const total = auto + teleop;
    contributions.push({ teamNumber, auto, teleop, total });
    variance += teamSigma(strength, total) ** 2;
  }

  const auto = contributions.reduce((sum, c) => sum + c.auto, 0);
  const teleop = contributions.reduce((sum, c) => sum + c.teleop, 0);

  return {
    auto,
    teleop,
    total: auto + teleop,
    sigma: Math.sqrt(variance),
    contributions,
    missingTeams,
  };
}

/** Standard normal cumulative distribution (Abramowitz & Stegun 7.1.26). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) * 0.7071067811865476);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp((-z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/**
 * Probability that `red` outscores `blue`, treating each alliance total as a normal
 * distribution centred on its projection with the combined OPR deviation as spread.
 * The floor keeps a lopsided matchup from rendering as a guaranteed win.
 */
export function winProbability(red: Projection, blue: Projection): number {
  const spread = Math.max(Math.hypot(red.sigma, blue.sigma), 1);
  const z = (red.total - blue.total) / spread;
  return Math.min(0.995, Math.max(0.005, normalCdf(z)));
}
