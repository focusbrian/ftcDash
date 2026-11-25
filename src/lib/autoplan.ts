/**
 * Autonomous planning for BIOBUZZ (FTC 2026–27).
 *
 * Geometry follows the official field CAD for the season: a 141.2 in. playing surface inside the
 * perimeter, a shared HIVE frame in the middle holding one tilting CELL per alliance, four FLOWERS
 * standing on the walls, and a LOADING ZONE plus a GARDEN per alliance.
 *
 * Planner frame: origin at the middle of the surface, +x towards blue's side (the audience's right as
 * the red drive team sees it), +y towards the rear wall. The audience wall is y = -70.6, so a shot is
 * only ever aimed at the shooter's own raised CELL, never at the far end of the field.
 *
 * A robot's program is a list of waypoints. Each one carries a wait and a count of artifacts to
 * launch from there, which turns the list into a timetable: drive, arrive, wait, shoot, drive on.
 */

export interface Pt {
  x: number;
  y: number;
}

export type Alliance = 'red' | 'blue';

/** Inside face of the perimeter walls: 1.7929 m to each side of the middle. */
export const FIELD_SIZE = 141.2;
export const HALF_FIELD = FIELD_SIZE / 2;
export const TILE = 24;
/** AUTO is the first 30 s of a BIOBUZZ match. */
export const AUTO_SECONDS = 30;
export const BALL_FLIGHT_SECONDS = 0.45;
/** R101: a robot fits an 18 in. cube, measured from the floor. */
export const ROBOT_SIZE = 18;
export const MIN_SPEED = 6;
export const MAX_SPEED = 84;
export const DEFAULT_SPEED = 36;
export const MIN_SHOT_CYCLE = 0.1;
export const MAX_SHOT_CYCLE = 3;
export const DEFAULT_SHOT_CYCLE = 0.3;
export const MAX_BALLS = 12;
export const MAX_WAIT = 20;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function rect(x0: number, y0: number, x1: number, y1: number): Rect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0),
    height: Math.abs(y1 - y0),
  };
}

export function rectCentre(box: Rect): Pt {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * One frame serves both alliances: two foot bars on the tiles, 47.4 in. apart, with the CELL pivots
 * side by side in the middle. Each alliance's CELL tilts up on its own side of the frame.
 */
export const HIVE_FRAME: Rect = rect(-23.7, -19.5, 23.7, 19.5);
/** Width of one CELL, and how far it reaches out from its pivot. */
export const CELL_HALF_WIDTH = 10.1;
export const CELL_BACK = 9.4;
export const CELL_MOUTH = 21.5;
const HIVE_PIVOT_X: Record<Alliance, number> = { red: -12.74, blue: 12.76 };

/** The raised CELL: the only thing a shot can score in, and always the shooter's own. */
export function hiveCell(alliance: Alliance): Rect {
  return hiveCellOnSide(alliance, initialRaisedSide(alliance));
}

export type CellSide = 'rear' | 'audience';

/**
 * Red starts with its audience-side CELL up and blue with its rear-side CELL up. A TIP swaps them,
 * so the side a robot should aim at changes during the match.
 */
export function initialRaisedSide(alliance: Alliance): CellSide {
  return alliance === 'red' ? 'audience' : 'rear';
}

export function otherSide(side: CellSide): CellSide {
  return side === 'rear' ? 'audience' : 'rear';
}

/** One of the two CELLs on that alliance's HIVE, whether or not it is the raised one. */
export function hiveCellOnSide(alliance: Alliance, side: CellSide): Rect {
  const pivot = HIVE_PIVOT_X[alliance];
  const toward = side === 'rear' ? 1 : -1;
  return rect(pivot - CELL_HALF_WIDTH, toward * CELL_BACK, pivot + CELL_HALF_WIDTH, toward * CELL_MOUTH);
}

/**
 * Artifacts needed in the raised CELL before the HIVE tips. The first CELL is partly pre-loaded by
 * the field setup, so it goes over after four; each fresh CELL afterwards takes eight.
 */
export const FIRST_TIP_BALLS = 4;
export const TIP_BALLS = 8;
/** How long the TIP animation is worth flashing on the map. */
export const TIP_FLASH_SECONDS = 0.8;

/** Where a launched artifact should end up: the middle of the CELL that is raised when it lands. */
export function cellAim(alliance: Alliance, side: CellSide = initialRaisedSide(alliance)): Pt {
  return rectCentre(hiveCellOnSide(alliance, side));
}

export interface Flower {
  id: string;
  /** The wall it stands on, named the way the setup guide names it. */
  wall: string;
  centre: Pt;
}

/** 6.65 in. square footprints standing on the walls, one per half of each wall. */
export const FLOWER_SIZE = 6.7;
export const FLOWERS: Flower[] = [
  { id: 'rear', wall: 'rear', centre: { x: -23.4, y: 68.0 } },
  { id: 'audience', wall: 'audience', centre: { x: 23.4, y: -68.0 } },
  { id: 'red', wall: 'red', centre: { x: -68.0, y: -23.4 } },
  { id: 'blue', wall: 'blue', centre: { x: 68.0, y: 23.4 } },
];

export function flowerBox(flower: Flower): Rect {
  return rect(
    flower.centre.x - FLOWER_SIZE / 2,
    flower.centre.y - FLOWER_SIZE / 2,
    flower.centre.x + FLOWER_SIZE / 2,
    flower.centre.y + FLOWER_SIZE / 2,
  );
}

/** Where that alliance's artifacts arrive: the taped box against its own side wall. */
export const LOADING: Record<Alliance, Rect> = {
  red: rect(-70.6, 23.9, -59.1, 46.6),
  blue: rect(59.1, -46.6, 70.6, -23.9),
};

/** Taped corner strip where loose artifacts collect. */
export const GARDEN: Record<Alliance, Rect> = {
  red: rect(-70.1, -70.6, -47.4, -68.1),
  blue: rect(47.4, 68.1, 70.1, 70.6),
};

export interface StartPose {
  x: number;
  y: number;
  /** Radians in planner coordinates; 0 faces +x. */
  heading: number;
}

/**
 * The two legal starting poses per alliance: one against the alliance's own side wall near the
 * middle, one against a diagonal wall. Each faces into the field.
 */
export function startPose(alliance: Alliance, slot: number): StartPose {
  const side = alliance === 'red' ? -1 : 1;
  const edge = HALF_FIELD - ROBOT_SIZE / 2 - 0.1;
  if (slot === 0) {
    return { x: side * edge, y: -side * 3.9, heading: side < 0 ? 0 : Math.PI };
  }
  return { x: side * 41.3, y: -side * edge, heading: side < 0 ? Math.PI / 2 : -Math.PI / 2 };
}

export function clampToField(p: Pt): Pt {
  return {
    x: Math.min(HALF_FIELD, Math.max(-HALF_FIELD, p.x)),
    y: Math.min(HALF_FIELD, Math.max(-HALF_FIELD, p.y)),
  };
}

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** One stop on the timetable. */
export interface Waypoint {
  x: number;
  y: number;
  /** Facing on arrival, radians, 0 = +x. The robot turns to it while driving in. */
  heading: number;
  /** Seconds to sit still after arriving, before the first artifact leaves. */
  wait: number;
  /** Artifacts launched from here, one shot cycle apart. Zero means drive through without stopping. */
  shots: number;
}

export interface RobotPlan {
  alliance: Alliance;
  /** The team driving this robot, so its logo can stand in on the map. Null when unnamed. */
  teamNumber: number | null;
  /** Inches per second while driving. */
  speed: number;
  /** Seconds between launched artifacts. */
  shotCycle: number;
  path: Waypoint[];
}

export interface AutoPlan {
  version: 1;
  /** Waypoint snapping in inches; 0 turns it off. */
  snap: number;
  /** Facing snapping in degrees; 0 turns it off. */
  headingSnap: number;
  robots: RobotPlan[];
}

/** A waypoint with its place on the clock worked out. */
export interface Step {
  index: number;
  pos: Pt;
  /** Facing on arrival, radians. */
  heading: number;
  /** When the robot reaches the waypoint. */
  arrive: number;
  /** Seconds spent driving to get here. */
  travel: number;
  wait: number;
  shots: number;
  /** When the first artifact leaves, and when the robot is free to drive on. */
  firstShot: number;
  depart: number;
}

export interface Schedule {
  steps: Step[];
  /** When the last artifact has left; 0 when there is nothing to do. */
  duration: number;
}

/**
 * Turns the waypoint list into a timetable: drive time from the distance and the speed, then the
 * wait, then one shot cycle per artifact. Nothing here reads the clock, so the same list always
 * produces the same timetable.
 */
export function buildSchedule(robot: RobotPlan): Schedule {
  const steps: Step[] = [];
  let clock = 0;
  let previous: Pt | undefined;

  robot.path.forEach((waypoint, index) => {
    const travel = previous ? distance(previous, waypoint) / Math.max(robot.speed, 0.001) : 0;
    const arrive = clock + travel;
    const wait = Math.max(0, waypoint.wait);
    const shots = Math.max(0, Math.round(waypoint.shots));
    const firstShot = arrive + wait;
    const depart = firstShot + shots * Math.max(robot.shotCycle, 0.001);

    steps.push({
      index,
      pos: { x: waypoint.x, y: waypoint.y },
      heading: waypoint.heading,
      arrive,
      travel,
      wait,
      shots,
      firstShot,
      depart,
    });

    clock = depart;
    previous = waypoint;
  });

  return { steps, duration: steps.length > 0 ? clock : 0 };
}

export interface PoseSample {
  pos: Pt;
  /** Radians, 0 = +x. */
  heading: number;
  /** The waypoint the robot is at or driving towards. */
  step: number;
  moving: boolean;
}

/** Wrap any angle into [0, 2π). */
export function normalizeHeading(radians: number): number {
  const twoPi = Math.PI * 2;
  return ((radians % twoPi) + twoPi) % twoPi;
}

/** Shortest way round from `from` to `to`, so a robot never spins the long way. */
export function lerpHeading(from: number, to: number, fraction: number): number {
  let delta = normalizeHeading(to) - normalizeHeading(from);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return normalizeHeading(from + delta * clamp(fraction, 0, 1));
}

/** The direction from one point to another, which is the natural facing for a new waypoint. */
export function headingBetween(from: Pt, to: Pt): number {
  return normalizeHeading(Math.atan2(to.y - from.y, to.x - from.x));
}

/** Rounds a heading to the nearest multiple of `step` degrees; a step of 0 leaves it alone. */
export function snapHeading(heading: number, step: number): number {
  if (!(step > 0)) return normalizeHeading(heading);
  const stepRadians = (step * Math.PI) / 180;
  return normalizeHeading(Math.round(heading / stepRadians) * stepRadians);
}

/** Where the robot is at `seconds` into AUTO, or null when it has no waypoints. */
export function scheduleAt(schedule: Schedule, seconds: number): PoseSample | null {
  const steps = schedule.steps;
  const first = steps[0];
  if (!first) return null;
  const t = Math.max(0, seconds);

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    if (!step) continue;
    const previous = i > 0 ? steps[i - 1] : undefined;

    if (t <= step.arrive) {
      if (!previous || step.travel <= 0) {
        return { pos: step.pos, heading: step.heading, step: i, moving: false };
      }
      const travelled = clamp(t - (step.arrive - step.travel), 0, step.travel);
      const fraction = travelled / step.travel;
      return {
        pos: {
          x: previous.pos.x + (step.pos.x - previous.pos.x) * fraction,
          y: previous.pos.y + (step.pos.y - previous.pos.y) * fraction,
        },
        // The robot turns towards the waypoint's facing while it drives the leg.
        heading: lerpHeading(previous.heading, step.heading, fraction),
        step: i,
        moving: fraction < 1,
      };
    }

    if (t <= step.depart) return { pos: step.pos, heading: step.heading, step: i, moving: false };
  }

  const last = steps[steps.length - 1] ?? first;
  return {
    pos: last.pos,
    heading: last.heading,
    step: steps.length - 1,
    moving: false,
  };
}

/** The part of the path already covered, for the painted trail under the robot. */
export function drivenPath(schedule: Schedule, seconds: number): Pt[] {
  const out: Pt[] = [];
  const t = Math.max(0, seconds);

  for (let i = 0; i < schedule.steps.length; i += 1) {
    const step = schedule.steps[i];
    if (!step) continue;
    const previous = i > 0 ? schedule.steps[i - 1] : undefined;

    if (t >= step.arrive) {
      out.push(step.pos);
      if (t <= step.depart) break;
      continue;
    }

    if (previous && step.travel > 0) {
      const fraction = clamp((t - (step.arrive - step.travel)) / step.travel, 0, 1);
      out.push({
        x: previous.pos.x + (step.pos.x - previous.pos.x) * fraction,
        y: previous.pos.y + (step.pos.y - previous.pos.y) * fraction,
      });
    }
    break;
  }

  return out;
}

/** Every artifact launch the plan makes, in time order. */
export interface Launch {
  step: number;
  /** Which artifact of that waypoint's burst this is, counting from 0. */
  ball: number;
  time: number;
  from: Pt;
}

export function launches(schedule: Schedule, cycle: number): Launch[] {
  const out: Launch[] = [];
  for (const step of schedule.steps) {
    for (let ball = 0; ball < step.shots; ball += 1) {
      out.push({ step: step.index, ball, time: step.firstShot + ball * Math.max(cycle, 0.001), from: step.pos });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

/** One artifact arriving in a CELL. */
export interface CellTick {
  /** Index of the robot that launched it, into `AutoPlan.robots`. */
  robot: number;
  step: number;
  ball: number;
  /** The CELL it went into — whichever side was raised as it landed. */
  side: CellSide;
  landing: number;
  /** True when this artifact is the one that tipped the HIVE. */
  tip: boolean;
}

export interface CellTip {
  time: number;
  /** The CELL that swung down and emptied. */
  side: CellSide;
}

export interface AllianceCells {
  /** The side raised at the start of AUTO. */
  initial: CellSide;
  /** One entry per artifact, in landing order. */
  ticks: CellTick[];
  tips: CellTip[];
  /** The side raised once every artifact in the plan has landed, and the load still in it. */
  raised: CellSide;
  load: number;
  /** Artifacts the raised CELL needs before it tips — four, then eight after each TIP. */
  threshold: number;
}

/**
 * Runs every artifact in the plan into its alliance's HIVE in landing order, so a plan can be checked
 * against the TIP: four artifacts tip the first CELL, eight tip each one after that, and the side the
 * robots should aim at swaps every time.
 */
export function simulateCells(plan: AutoPlan, flight = BALL_FLIGHT_SECONDS): Record<Alliance, AllianceCells> {
  const state: Record<Alliance, AllianceCells> = {
    red: { initial: initialRaisedSide('red'), ticks: [], tips: [], raised: initialRaisedSide('red'), load: 0, threshold: FIRST_TIP_BALLS },
    blue: { initial: initialRaisedSide('blue'), ticks: [], tips: [], raised: initialRaisedSide('blue'), load: 0, threshold: FIRST_TIP_BALLS },
  };

  const incoming: Omit<CellTick, 'side' | 'tip'>[] = [];
  plan.robots.forEach((robot, robotIndex) => {
    const schedule = buildSchedule(robot);
    for (const launch of launches(schedule, robot.shotCycle)) {
      incoming.push({
        robot: robotIndex,
        step: launch.step,
        ball: launch.ball,
        landing: launch.time + flight,
      });
    }
  });
  // Landing order decides which CELL is up when each artifact arrives; ties keep plan order.
  incoming.sort((a, b) => a.landing - b.landing || a.robot - b.robot || a.step - b.step || a.ball - b.ball);

  for (const item of incoming) {
    const cells = state[plan.robots[item.robot]?.alliance ?? 'red'];
    const tick: CellTick = { ...item, side: cells.raised, tip: false };
    cells.load += 1;
    if (cells.load >= cells.threshold) {
      tick.tip = true;
      cells.tips.push({ time: item.landing, side: cells.raised });
      cells.load = 0;
      cells.raised = otherSide(cells.raised);
      cells.threshold = TIP_BALLS;
    }
    cells.ticks.push(tick);
  }

  return state;
}

export interface CellsAtTime {
  raised: CellSide;
  load: number;
  threshold: number;
  /** When the HIVE last tipped, so the map can flash it; null if it never has. */
  tippedAt: number | null;
}

/** The state of one alliance's HIVE part-way through AUTO. */
export function cellsAt(cells: AllianceCells, seconds: number): CellsAtTime {
  let raised = cells.initial;
  let load = 0;
  let threshold = FIRST_TIP_BALLS;
  let tippedAt: number | null = null;

  for (const tick of cells.ticks) {
    if (tick.landing > seconds) break;
    load += 1;
    if (tick.tip) {
      tippedAt = tick.landing;
      load = 0;
      raised = otherSide(raised);
      threshold = TIP_BALLS;
    }
  }

  return { raised, load, threshold, tippedAt };
}

export const SNAP_OPTIONS = [0, 1, 6, 12];
/** Facing snap in degrees: the turn grip and the Facing column both honour it. */
export const HEADING_SNAP_OPTIONS = [0, 1, 5, 15, 45];
export const DEFAULT_HEADING_SNAP = 5;
/** v3 because the plan became a timetable: a v2 plan's free-floating shot times mean nothing here. */
export const AUTO_PLAN_KEY = 'ftcdash.autoPlan.v3';

/** A full BIOBUZZ auto has two robots per alliance; slots 0-1 are red, 2-3 blue. */
export const ROBOT_SLOTS = 4;

export function allianceForSlot(slot: number): Alliance {
  return slot < 2 ? 'red' : 'blue';
}

export function slotLabel(slot: number): string {
  return `${allianceForSlot(slot) === 'red' ? 'Red' : 'Blue'} ${(slot % 2) + 1}`;
}

export function defaultRobot(slot: number): RobotPlan {
  return {
    alliance: allianceForSlot(slot),
    teamNumber: null,
    speed: DEFAULT_SPEED,
    shotCycle: DEFAULT_SHOT_CYCLE,
    path: [],
  };
}

export function defaultPlan(): AutoPlan {
  return {
    version: 1,
    snap: 1,
    headingSnap: DEFAULT_HEADING_SNAP,
    robots: Array.from({ length: ROBOT_SLOTS }, (_, slot) => defaultRobot(slot)),
  };
}

function roundTo(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function snapPoint(p: Pt, step: number): Pt {
  return clampToField({ x: roundTo(p.x, step), y: roundTo(p.y, step) });
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface RawWaypoint {
  x: number;
  y: number;
  /** Null when the file predates per-waypoint facing. */
  heading: number | null;
  wait: number;
  shots: number;
}

function readWaypoint(raw: unknown): RawWaypoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as { x?: unknown; y?: unknown; heading?: unknown; wait?: unknown; shots?: unknown };
  if (typeof source.x !== 'number' || typeof source.y !== 'number') return null;
  if (!Number.isFinite(source.x) || !Number.isFinite(source.y)) return null;

  const wait =
    typeof source.wait === 'number' && Number.isFinite(source.wait)
      ? round1(clamp(source.wait, 0, MAX_WAIT))
      : 0;
  const shots =
    typeof source.shots === 'number' && Number.isFinite(source.shots)
      ? Math.round(clamp(source.shots, 0, MAX_BALLS))
      : 0;
  const heading =
    typeof source.heading === 'number' && Number.isFinite(source.heading)
      ? normalizeHeading(source.heading)
      : null;

  const point = clampToField({ x: source.x, y: source.y });
  return { x: point.x, y: point.y, heading, wait, shots };
}

/**
 * Fills in a facing for waypoints saved before facing existed: each one faces the way it drove in,
 * which is what the planner drew then.
 */
function withHeadings(points: RawWaypoint[]): Waypoint[] {
  return points.map((point, index) => {
    const previous = points[index - 1];
    const heading =
      point.heading ?? (previous ? headingBetween(previous, point) : normalizeHeading(0));
    return { x: point.x, y: point.y, heading, wait: point.wait, shots: point.shots };
  });
}

function readRobot(raw: unknown, slot: number): RobotPlan {
  const fallback = defaultRobot(slot);
  if (!raw || typeof raw !== 'object') return fallback;
  const source = raw as {
    teamNumber?: unknown;
    speed?: unknown;
    shotCycle?: unknown;
    path?: unknown;
  };
  const teamNumber =
    typeof source.teamNumber === 'number' &&
    Number.isInteger(source.teamNumber) &&
    source.teamNumber > 0 &&
    source.teamNumber < 1000000
      ? source.teamNumber
      : null;
  const speed =
    typeof source.speed === 'number' && Number.isFinite(source.speed)
      ? clamp(source.speed, MIN_SPEED, MAX_SPEED)
      : fallback.speed;
  const shotCycle =
    typeof source.shotCycle === 'number' && Number.isFinite(source.shotCycle)
      ? Math.round(clamp(source.shotCycle, MIN_SHOT_CYCLE, MAX_SHOT_CYCLE) * 10) / 10
      : fallback.shotCycle;
  const path = Array.isArray(source.path)
    ? withHeadings(
        source.path
          .map(readWaypoint)
          .filter((waypoint): waypoint is RawWaypoint => waypoint !== null)
          .slice(0, 60),
      )
    : [];

  // The slot decides the alliance, so a hand-edited file cannot put a blue robot in a red column.
  return { alliance: allianceForSlot(slot), teamNumber, speed, shotCycle, path };
}

/**
 * Reads a robot's program on its own, so one team's auton can be traded without the rest of the
 * plan. Accepts either `{ robot: {…} }` (what this page exports) or a bare robot object.
 */
export function parseRobotPlan(raw: string | null, slot: number): RobotPlan | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const wrapped = (parsed as { robot?: unknown }).robot;
  const candidate = wrapped && typeof wrapped === 'object' ? wrapped : parsed;
  // A file with no program at all is not a robot program, however well-formed.
  if (!Array.isArray((candidate as { path?: unknown }).path)) return null;
  return readRobot(candidate, slot);
}

export function serializeRobotPlan(robot: RobotPlan, slot: number): string {
  return JSON.stringify(
    { app: 'ftcdash', kind: 'auton', version: 1, slot: slotLabel(slot), robot },
    null,
    2,
  );
}

/** Anything read back from storage or a file goes through here, so a bad plan cannot break the page. */
export function parseAutoPlan(raw: string | null): AutoPlan {
  if (!raw) return defaultPlan();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaultPlan();
  }
  if (!parsed || typeof parsed !== 'object') return defaultPlan();

  const source = parsed as { robots?: unknown; snap?: unknown; headingSnap?: unknown };
  const stored = Array.isArray(source.robots) ? source.robots : [];
  const snap = typeof source.snap === 'number' && SNAP_OPTIONS.includes(source.snap) ? source.snap : 1;
  const headingSnap =
    typeof source.headingSnap === 'number' && HEADING_SNAP_OPTIONS.includes(source.headingSnap)
      ? source.headingSnap
      : DEFAULT_HEADING_SNAP;

  if (stored.length > 2) {
    // A four-robot plan: slot order is the truth.
    return {
      version: 1,
      snap,
      headingSnap,
      robots: Array.from({ length: ROBOT_SLOTS }, (_, slot) => readRobot(stored[slot], slot)),
    };
  }

  // A two-robot plan from before the field had four slots: keep each robot on its own side, in
  // the order its file listed them.
  const robots = Array.from({ length: ROBOT_SLOTS }, (_, slot) => defaultRobot(slot));
  const used: Record<Alliance, number> = { red: 0, blue: 0 };
  for (const entry of stored) {
    const alliance: Alliance =
      (entry as { alliance?: unknown })?.alliance === 'blue' ? 'blue' : 'red';
    const offset = used[alliance];
    if (offset > 1) continue;
    used[alliance] += 1;
    const slot = alliance === 'red' ? offset : 2 + offset;
    robots[slot] = readRobot(entry, slot);
  }

  return { version: 1, snap, headingSnap, robots };
}

export function serializeAutoPlan(plan: AutoPlan): string {
  return JSON.stringify(plan, null, 2);
}

/** Sets when a waypoint is reached by moving the wait before it, which is the only free variable. */
export function retimeArrival(
  robot: RobotPlan,
  index: number,
  target: number,
): RobotPlan {
  const schedule = buildSchedule(robot);
  const step = schedule.steps[index];
  const previousStep = schedule.steps[index - 1];
  const previousWaypoint = robot.path[index - 1];
  if (!step || !previousStep || !previousWaypoint) return robot;

  const earliest = previousStep.depart + step.travel;
  const wanted = clamp(target, earliest, AUTO_SECONDS);
  const slack = round2(wanted - earliest);
  if (slack <= 0) return robot;

  return {
    ...robot,
    path: robot.path.map((waypoint, at) =>
      at === index - 1
        ? { ...waypoint, wait: round2(clamp(waypoint.wait + slack, 0, MAX_WAIT)) }
        : waypoint,
    ),
  };
}

/** Notes for one robot's plan. */
export function robotIssues(robot: RobotPlan): string[] {
  const issues: string[] = [];
  const schedule = buildSchedule(robot);

  if (robot.path.length === 0) {
    issues.push('No waypoints yet — click the field to start the path.');
    return issues;
  }
  if (robot.path.length === 1 && robot.path[0]?.shots === 0) {
    issues.push('One waypoint with no shot is just a start — add a second to drive.');
  }

  if (schedule.duration > AUTO_SECONDS) {
    const over = schedule.duration - AUTO_SECONDS;
    issues.push(
      `The last action ends at ${schedule.duration.toFixed(1)} s — ${over.toFixed(1)} s past the end of AUTO.`,
    );
  }

  return issues;
}

export interface Conflict {
  time: number;
  distance: number;
  /** The two robot slots that would touch. */
  slots: [number, number];
}

/**
 * AUTO points for the things a plan can settle: LEAVE (3 per robot that gets off its start), PARK
 * (5 per robot that finishes in its LOADING ZONE) and TIP (20 each).
 */
export const POINTS = { leave: 3, park: 5, tip: 20 } as const;
/** How far from its first waypoint a robot must finish to count as having LEFT. */
export const LEAVE_DISTANCE = ROBOT_SIZE;

/** Points across the chassis, per axis, used to test whether it overlaps a zone. */
const CHASSIS_SAMPLES = 7;

/** The square the chassis sweeps at `centre`, as a grid of points so an angled robot is handled. */
function footprintPoints(centre: Pt, heading: number, samples = CHASSIS_SAMPLES): Pt[] {
  const half = ROBOT_SIZE / 2;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const points: Pt[] = [];
  for (let i = 0; i < samples; i += 1) {
    // Along the robot's own x, then its own y: rotating both gives the chassis footprint.
    const along = -half + (2 * half * i) / (samples - 1);
    for (let j = 0; j < samples; j += 1) {
      const across = -half + (2 * half * j) / (samples - 1);
      points.push({
        x: centre.x + along * cos - across * sin,
        y: centre.y + along * sin + across * cos,
      });
    }
  }
  return points;
}

/**
 * PARK: any part of the chassis is inside the alliance's LOADING ZONE, the taped strip against its
 * own side wall. Partly in is enough, and an angled robot counts if a corner or an edge reaches in.
 */
export function isParked(finish: Pt, heading: number, alliance: Alliance): boolean {
  const zone = LOADING[alliance];
  return footprintPoints(finish, heading).some(
    (p) =>
      p.x >= zone.x &&
      p.x <= zone.x + zone.width &&
      p.y >= zone.y &&
      p.y <= zone.y + zone.height,
  );
}

export interface RobotScore {
  slot: number;
  /** False when the robot has no program at all. */
  planned: boolean;
  /** Where its program finishes. */
  finish: Pt | null;
  left: boolean;
  parked: boolean;
  points: number;
}

export interface AllianceScore {
  alliance: Alliance;
  robots: RobotScore[];
  tips: number;
  leavePoints: number;
  parkPoints: number;
  tipPoints: number;
  total: number;
}

/** What earns points: getting clear of the start, ending in the LOADING ZONE, or tipping a CELL. */
export type ScoreRegime = 'leave' | 'park' | 'tip';

export interface ScoreEvent {
  alliance: Alliance;
  regime: ScoreRegime;
  /** The robot that earned it; null for a TIP, which belongs to the alliance rather than one robot. */
  slot: number | null;
  /** When the point lands, in seconds into AUTO. */
  time: number;
}

/** How often the LEAVE scan samples the timetable. */
const LEAVE_SAMPLE = 0.05;

/** When a robot first gets a robot's width away from where it started, or null if it never does. */
function leaveTime(schedule: Schedule, start: Pt): number | null {
  for (let t = 0; t <= schedule.duration + 1e-9; t += LEAVE_SAMPLE) {
    const sample = scheduleAt(schedule, t);
    if (sample && distance(start, sample.pos) >= LEAVE_DISTANCE) return round2(t);
  }
  return null;
}

/**
 * Every point the plan scores, in the order it lands, so the scoreboard can count up with playback.
 * LEAVE lands the moment a robot gets clear of its first waypoint; PARK lands when it comes to rest
 * in its LOADING ZONE at the end of its program; a TIP lands when the CELL tips.
 */
export function scoreEvents(plan: AutoPlan): ScoreEvent[] {
  const events: ScoreEvent[] = [];

  plan.robots.forEach((robot, slot) => {
    if (robot.path.length === 0) return;
    const alliance = allianceForSlot(slot);
    const schedule = buildSchedule(robot);
    const start = robot.path[0];
    const end = scheduleAt(schedule, schedule.duration);
    const last = schedule.steps[schedule.steps.length - 1];
    if (!start || !end || !last) return;

    const left = leaveTime(schedule, start);
    if (left !== null) events.push({ alliance, regime: 'leave', slot, time: left });
    if (isParked(end.pos, end.heading, alliance)) {
      events.push({ alliance, regime: 'park', slot, time: last.arrive });
    }
  });

  const cells = simulateCells(plan);
  for (const alliance of ['red', 'blue'] as const) {
    for (const tip of cells[alliance].tips) {
      events.push({ alliance, regime: 'tip', slot: null, time: tip.time });
    }
  }

  return events.sort((a, b) => a.time - b.time);
}

/** The points an alliance has on the board. */
export interface LiveScore {
  /** LEAVE points banked. */
  leave: number;
  /** PARK points banked. */
  park: number;
  /** TIP points banked. */
  tips: number;
  /** How many TIPs have landed. */
  tipCount: number;
  total: number;
}

function emptyLiveScore(): LiveScore {
  return { leave: 0, park: 0, tips: 0, tipCount: 0, total: 0 };
}

/** The running score at `seconds` into AUTO: only the points already scored count. */
export function scoreAt(events: ScoreEvent[], seconds: number): Record<Alliance, LiveScore> {
  const running: Record<Alliance, LiveScore> = { red: emptyLiveScore(), blue: emptyLiveScore() };

  for (const event of events) {
    if (event.time > seconds) continue;
    const side = running[event.alliance];
    if (event.regime === 'leave') side.leave += POINTS.leave;
    else if (event.regime === 'park') side.park += POINTS.park;
    else side.tipCount += 1;
  }

  for (const alliance of ['red', 'blue'] as const) {
    const side = running[alliance];
    side.tips = side.tipCount * POINTS.tip;
    side.total = side.leave + side.park + side.tips;
  }

  return running;
}

/**
 * Scores both alliances on leave, park and tips for the whole AUTO. PARK follows the rule the field
 * setup uses: a robot parks by finishing inside its alliance's LOADING ZONE. LEAVE is a planning
 * proxy — finishing a robot's width from where it started.
 */
export function scoreAuto(plan: AutoPlan): Record<Alliance, AllianceScore> {
  const events = scoreEvents(plan);
  const cells = simulateCells(plan);
  const scores: Record<Alliance, AllianceScore> = {
    red: { alliance: 'red', robots: [], tips: cells.red.tips.length, leavePoints: 0, parkPoints: 0, tipPoints: 0, total: 0 },
    blue: { alliance: 'blue', robots: [], tips: cells.blue.tips.length, leavePoints: 0, parkPoints: 0, tipPoints: 0, total: 0 },
  };

  plan.robots.forEach((robot, slot) => {
    const alliance = allianceForSlot(slot);
    const finish = scheduleAt(buildSchedule(robot), buildSchedule(robot).duration)?.pos ?? null;
    const scored = (regime: ScoreRegime) =>
      events.some((event) => event.regime === regime && event.slot === slot);

    const left = robot.path.length > 0 && scored('leave');
    const parked = robot.path.length > 0 && scored('park');
    const points = (left ? POINTS.leave : 0) + (parked ? POINTS.park : 0);
    scores[alliance].robots.push({
      slot,
      planned: robot.path.length > 0,
      finish,
      left,
      parked,
      points,
    });
  });

  for (const alliance of ['red', 'blue'] as const) {
    const score = scores[alliance];
    score.leavePoints = score.robots.filter((robot) => robot.left).length * POINTS.leave;
    score.parkPoints = score.robots.filter((robot) => robot.parked).length * POINTS.park;
    score.tipPoints = score.tips * POINTS.tip;
    score.total = score.leavePoints + score.parkPoints + score.tipPoints;
  }

  return scores;
}

/**
 * Warnings that need both robots: a burst that carries on after the HIVE has tipped, whose later
 * artifacts would arrive at a CELL that is still swinging, and a plan that tips a CELL more often
 * than the partners can fill it.
 */
export function planIssues(plan: AutoPlan): string[] {
  const issues: string[] = [];
  const cells = simulateCells(plan);

  for (const alliance of ['red', 'blue'] as const) {
    const straddled = new Map<string, { step: number; robot: number; after: number; time: number }>();
    for (const tick of cells[alliance].ticks) {
      if (!tick.tip) continue;
      const burst = cells[alliance].ticks.filter(
        (other) => other.robot === tick.robot && other.step === tick.step && other.ball > tick.ball,
      );
      if (burst.length === 0) continue;
      const key = `${tick.robot}-${tick.step}`;
      if (!straddled.has(key)) {
        straddled.set(key, {
          robot: tick.robot,
          step: tick.step,
          after: burst.length,
          time: tick.landing,
        });
      }
    }

    for (const entry of straddled.values()) {
      issues.push(
        `${slotLabel(entry.robot)} keeps firing past the ${alliance} HIVE tip at ${entry.time.toFixed(1)} s — ${entry.after} artifact${entry.after === 1 ? '' : 's'} would reach a CELL that is still swinging.`,
      );
    }
  }

  return issues;
}

/**
 * The first moment any two robots' 18 in. footprints overlap, if they ever do. Every robot runs its
 * own timetable, so this catches a robot driving through a partner that is waiting to shoot.
 */
export function firstConflict(plan: AutoPlan, step = 0.1): Conflict | null {
  let earliest: Conflict | null = null;

  for (let a = 0; a < plan.robots.length; a += 1) {
    const first = plan.robots[a];
    if (!first || first.path.length === 0) continue;

    for (let b = a + 1; b < plan.robots.length; b += 1) {
      const second = plan.robots[b];
      if (!second || second.path.length === 0) continue;

      const firstSchedule = buildSchedule(first);
      const secondSchedule = buildSchedule(second);
      const until = Math.min(
        AUTO_SECONDS,
        Math.max(firstSchedule.duration, secondSchedule.duration),
      );

      for (let time = 0; time <= until + 1e-9; time += step) {
        const poseA = scheduleAt(firstSchedule, time);
        const poseB = scheduleAt(secondSchedule, time);
        if (!poseA || !poseB) continue;
        const gap = distance(poseA.pos, poseB.pos);
        if (gap < ROBOT_SIZE) {
          if (!earliest || time < earliest.time) {
            earliest = { time: round1(time), distance: gap, slots: [a, b] };
          }
          break;
        }
      }
    }
  }

  return earliest;
}
