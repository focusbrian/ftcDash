import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AutoPlan3DView } from './AutoPlan3DView';
import { useTeamLookup } from '../hooks/useTeamLookup';
import {
  AUTO_PLAN_KEY,
  AUTO_SECONDS,
  BALL_FLIGHT_SECONDS,
  FIELD_SIZE,
  FLOWERS,
  GARDEN,
  HALF_FIELD,
  HIVE_FRAME,
  LOADING,
  LEAVE_DISTANCE,
  MAX_BALLS,
  MAX_SHOT_CYCLE,
  MAX_SPEED,
  MAX_WAIT,
  MIN_SHOT_CYCLE,
  MIN_SPEED,
  ROBOT_SIZE,
  SNAP_OPTIONS,
  TILE,
  buildSchedule,
  cellAim,
  cellsAt,
  clamp,
  clampToField,
  defaultPlan,
  defaultRobot,
  drivenPath,
  firstConflict,
  flowerBox,
  hiveCellOnSide,
  initialRaisedSide,
  launches,
  normalizeHeading,
  parseAutoPlan,
  parseRobotPlan,
  planIssues,
  POINTS,
  retimeArrival,
  robotIssues,
  round1,
  round2,
  scheduleAt,
  scoreAt,
  scoreAuto,
  scoreEvents,
  serializeAutoPlan,
  serializeRobotPlan,
  simulateCells,
  slotLabel,
  snapHeading,
  snapPoint,
  startPose,
  headingBetween,
  FIRST_TIP_BALLS,
  HEADING_SNAP_OPTIONS,
  TIP_BALLS,
  TIP_FLASH_SECONDS,
  type Alliance,
  type AutoPlan,
  type CellSide,
  type CellTick,
  type CellsAtTime,
  type Pt,
  type Rect,
  type RobotPlan,
} from '../lib/autoplan';
import type { AssetStore } from '../lib/assets';

interface Props {
  /** Merged team assets, so a robot can wear its team's logo. */
  assets: AssetStore;
  onBack: () => void;
  /** Where Back goes, so the button says it. */
  backLabel?: string;
}

/** Room around the walls for the wall labels. */
const MARGIN = 9;
const VIEW = FIELD_SIZE + MARGIN * 2;
const MAX_WAYPOINTS = 60;
/** The team badge sits inside the 18 in. footprint as a disc, so no logo spills over the outline. */
const BADGE_RADIUS = 8.6;
/** Where the rotation grip sits, measured from the robot's centre along its heading. */
const ROTATE_HANDLE_DISTANCE = 15;
/** How far a press may travel, in screen pixels, before it counts as a drag rather than a tap. */
const TAP_SLOP = 4;

/** A gesture in progress on the map: moving a waypoint, or turning its pose. */
interface Drag {
  kind: 'move' | 'rotate';
  robot: number;
  waypoint: number;
  pointerId: number;
  /** Where the press started, in screen pixels. */
  start: { x: number; y: number };
  /** True once the pointer has travelled past TAP_SLOP, so a tap can be told from a drag. */
  moved: boolean;
}

/**
 * The plan's +y points at the rear wall, but SVG y grows downwards; flipping y once here puts the
 * audience wall at the bottom of the map, which is how a drive team sees the field.
 */
function toDraw(p: Pt): Pt {
  return { x: p.x, y: -p.y };
}

/** A field rectangle as an SVG rect, in drawing space. */
function drawnRect(box: Rect): { x: number; y: number; width: number; height: number } {
  const topLeft = toDraw({ x: box.x, y: box.y + box.height });
  return { x: topLeft.x, y: topLeft.y, width: box.width, height: box.height };
}

function seconds(value: number): string {
  return `${value.toFixed(2)} s`;
}

/**
 * What to stencil on a robot that has no logo: the first letter of its team's name, or failing a
 * name, the first digit of its number. Null when no team is set, so the slot number can stand in.
 */
function teamInitial(name: string | null | undefined, teamNumber: number | null): string | null {
  const trimmed = name?.trim() ?? '';
  if (trimmed.length > 0) return trimmed[0]!.toUpperCase();
  if (teamNumber !== null) {
    const digits = String(teamNumber);
    if (digits.length > 0) return digits[0]!;
  }
  return null;
}

function downloadJson(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking at once would cancel the download in some browsers; the blob is small and short-lived.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function downloadPlan(plan: AutoPlan): void {
  downloadJson(serializeAutoPlan(plan), 'auto-plan.json');
}

/** The HIVE frame and both CELLs per alliance, with the raised one carrying its load. */
function Hive({ cells, time }: { cells: Record<Alliance, CellsAtTime>; time: number }) {
  const frame = drawnRect(HIVE_FRAME);
  return (
    <g className="autoplan__hive" aria-hidden="true">
      <rect className="autoplan__hive-frame" {...frame} />
      {(['red', 'blue'] as const).map((alliance) =>
        (['rear', 'audience'] as const).map((side) => {
          const box = drawnRect(hiveCellOnSide(alliance, side));
          const aim = toDraw(cellAim(alliance, side));
          const state = cells[alliance];
          const raised = state.raised === side;
          const flashing =
            raised === false &&
            state.tippedAt !== null &&
            time - state.tippedAt >= 0 &&
            time - state.tippedAt < TIP_FLASH_SECONDS;
          return (
            <g
              key={`${alliance}-${side}`}
              className={`autoplan__cell autoplan__cell--${alliance}${
                raised ? ' autoplan__cell--raised' : ' autoplan__cell--down'
              }${flashing ? ' autoplan__cell--tipped' : ''}`}
            >
              <rect x={box.x} y={box.y} width={box.width} height={box.height} />
              <text x={aim.x} y={aim.y} textAnchor="middle" dy={1.1}>
                {raised ? `${state.load}/${state.threshold}` : '—'}
              </text>
            </g>
          );
        }),
      )}
      <text
        x={0}
        y={toDraw({ x: 0, y: HIVE_FRAME.y + HIVE_FRAME.height }).y - 3.6}
        textAnchor="middle"
        className="autoplan__hive-label"
      >
        hive
      </text>
    </g>
  );
}

/** The four FLOWERS. Their wall names live in the legend, so the boxes stay clean at map scale. */
function Flowers() {
  return (
    <g className="autoplan__flowers" aria-hidden="true">
      {FLOWERS.map((flower) => {
        const box = drawnRect(flowerBox(flower));
        return (
          <rect
            key={flower.id}
            x={box.x}
            y={box.y}
            width={box.width}
            height={box.height}
            className="autoplan__flower"
          />
        );
      })}
    </g>
  );
}

/** LOADING ZONEs and GARDENs, tinted for the alliance that owns each one. */
function Zones() {
  return (
    <g aria-hidden="true">
      {(['red', 'blue'] as const).map((alliance) => {
        const loading = drawnRect(LOADING[alliance]);
        const garden = drawnRect(GARDEN[alliance]);
        return (
          <g key={alliance} className={`autoplan__zone autoplan__zone--${alliance}`}>
            <rect
              className="autoplan__loading"
              x={loading.x}
              y={loading.y}
              width={loading.width}
              height={loading.height}
            />
            <rect
              className="autoplan__garden"
              x={garden.x}
              y={garden.y}
              width={garden.width}
              height={garden.height}
            />
          </g>
        );
      })}
    </g>
  );
}

/** The two legal starting poses per alliance, with a tick showing which way the robot faces. */
function Starts() {
  return (
    <g className="autoplan__starts" aria-hidden="true">
      {(['red', 'blue'] as const).map((alliance) =>
        [0, 1].map((slot) => {
          const pose = startPose(alliance, slot);
          const draw = toDraw(pose);
          const nose = toDraw({
            x: pose.x + Math.cos(pose.heading) * (ROBOT_SIZE / 2),
            y: pose.y + Math.sin(pose.heading) * (ROBOT_SIZE / 2),
          });
          return (
            <g key={`${alliance}-${slot}`} className={`autoplan__start autoplan__start--${alliance}`}>
              <rect
                x={draw.x - ROBOT_SIZE / 2}
                y={draw.y - ROBOT_SIZE / 2}
                width={ROBOT_SIZE}
                height={ROBOT_SIZE}
                rx={2}
              />
              <line x1={draw.x} y1={draw.y} x2={nose.x} y2={nose.y} />
            </g>
          );
        }),
      )}
    </g>
  );
}

export function AutoPlanView({ assets, onBack, backLabel = 'Back to dashboard' }: Props) {
  const [plan, setPlan] = useState<AutoPlan>(() => {
    try {
      return parseAutoPlan(window.localStorage.getItem(AUTO_PLAN_KEY));
    } catch {
      return defaultPlan();
    }
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [history, setHistory] = useState<AutoPlan[]>([]);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [show3d, setShow3d] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const timeRef = useRef(0);
  const dragRef = useRef<Drag | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const active = plan.robots[activeIndex] ?? plan.robots[0];

  // Four fixed slots, so four fixed hook calls; each resolves its team's name for its card.
  const teams = [
    useTeamLookup(plan.robots[0]?.teamNumber ?? null),
    useTeamLookup(plan.robots[1]?.teamNumber ?? null),
    useTeamLookup(plan.robots[2]?.teamNumber ?? null),
    useTeamLookup(plan.robots[3]?.teamNumber ?? null),
  ];

  const schedules = useMemo(() => plan.robots.map((robot) => buildSchedule(robot)), [plan.robots]);
  const activeSchedule = schedules[activeIndex] ?? buildSchedule(defaultPlan().robots[0]!);

  // The plan as it is right now, so an event handler can snapshot it before changing it.
  const planRef = useRef(plan);
  planRef.current = plan;

  // The plan is small; saving on every edit keeps a reload from losing work and needs no timer.
  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_PLAN_KEY, serializeAutoPlan(plan));
    } catch {
      setError('Browser storage is full — export the plan, then remove a robot and retry.');
    }
  }, [plan]);

  const setTimeBoth = useCallback((value: number) => {
    const clamped = clamp(value, 0, AUTO_SECONDS);
    timeRef.current = clamped;
    setTime(clamped);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = Math.min(0.25, (now - last) / 1000);
      last = now;
      const next = timeRef.current + delta * rate;
      if (next >= AUTO_SECONDS) {
        setTimeBoth(AUTO_SECONDS);
        setPlaying(false);
        return;
      }
      setTimeBoth(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, rate, setTimeBoth]);

  // Space toggles playback, unless a control has the key.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(target.tagName)) return;
      event.preventDefault();
      setPlaying((value) => {
        if (!value && timeRef.current >= AUTO_SECONDS) setTimeBoth(0);
        return !value;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTimeBoth]);

  const pushHistory = useCallback((snapshot: AutoPlan) => {
    // Read eagerly: a functional updater runs later, after planRef has moved on.
    setHistory((stack) => [...stack.slice(-49), snapshot]);
  }, []);

  const commit = useCallback(
    (next: AutoPlan) => {
      pushHistory(planRef.current);
      setPlan(next);
    },
    [pushHistory],
  );

  /**
   * Applies a change to one robot. `record` is false mid-drag, where the gesture pushes its own
   * snapshot once so undo steps back over the whole drag rather than a single pointer move.
   */
  const changeRobot = (index: number, change: (robot: RobotPlan) => RobotPlan, record = true) => {
    const next: AutoPlan = {
      ...planRef.current,
      robots: planRef.current.robots.map((robot, at) => (at === index ? change(robot) : robot)),
    };
    if (record) commit(next);
    else setPlan(next);
  };

  const pointFromEvent = (event: { clientX: number; clientY: number }): Pt | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    // The viewBox is centred on the field, and drawing space has y flipped.
    return clampToField({ x: local.x, y: -local.y });
  };

  const addWaypoint = (p: Pt) => {
    if (!active) return;
    if (active.path.length >= MAX_WAYPOINTS) {
      setError(`That is ${MAX_WAYPOINTS} waypoints — the limit for one robot.`);
      return;
    }
    const point = snapPoint(p, plan.snap);
    changeRobot(activeIndex, (robot) => {
      const previous = robot.path[robot.path.length - 1];
      // A new waypoint faces the way the robot drives into it, unless that is the start.
      const heading = previous ? headingBetween(previous, point) : normalizeHeading(0);
      return { ...robot, path: [...robot.path, { ...point, heading, wait: 0, shots: 0 }] };
    });
    setError(null);
  };

  const moveWaypoint = (robotIndex: number, waypointIndex: number, p: Pt) => {
    const point = snapPoint(p, plan.snap);
    changeRobot(
      robotIndex,
      (robot) => ({
        ...robot,
        path: robot.path.map((existing, at) => (at === waypointIndex ? { ...existing, ...point } : existing)),
      }),
      false,
    );
  };

  const removeWaypoint = (index: number) => {
    changeRobot(activeIndex, (robot) => ({
      ...robot,
      path: robot.path.filter((_, at) => at !== index),
    }));
  };

  const patchWaypoint = (
    robotIndex: number,
    waypointIndex: number,
    patch: Partial<{ wait: number; shots: number; heading: number }>,
  ) => {
    changeRobot(robotIndex, (robot) => ({
      ...robot,
      path: robot.path.map((waypoint, at) =>
        at === waypointIndex ? { ...waypoint, ...patch } : waypoint,
      ),
    }));
  };

  /** Turns a waypoint's facing while a rotation drag is in progress, on the same undo step. */
  const turnWaypoint = (robotIndex: number, waypointIndex: number, heading: number) => {
    changeRobot(
      robotIndex,
      (robot) => ({
        ...robot,
        path: robot.path.map((waypoint, at) =>
          at === waypointIndex ? { ...waypoint, heading } : waypoint,
        ),
      }),
      false,
    );
  };

  /**
   * Puts the clock at the moment a robot reaches one of its waypoints, so a tap on the map can show
   * the robot standing there. Selecting the robot keeps the waypoint table on the same list.
   */
  const jumpToWaypoint = (robotIndex: number, waypointIndex: number) => {
    const robot = planRef.current.robots[robotIndex];
    if (!robot) return;
    const step = buildSchedule(robot).steps[waypointIndex];
    if (!step) return;
    setPlaying(false);
    setActiveIndex(robotIndex);
    setTimeBoth(step.arrive);
  };

  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((stack) => stack.slice(0, -1));
    setPlan(previous);
  };

  const startFromPose = (index: number) => {
    const robot = planRef.current.robots[index];
    if (!robot) return;
    // Each alliance has two starting poses; the slot picks one of them, not one of the four.
    const poseIndex = index % 2;
    const pose = startPose(robot.alliance, poseIndex);
    changeRobot(index, (current) => {
      const first = current.path[0];
      const rest = current.path.slice(1);
      return {
        ...current,
        path: [
          {
            x: Math.round(pose.x),
            y: Math.round(pose.y),
            heading: normalizeHeading(pose.heading),
            wait: first?.wait ?? 0,
            shots: first?.shots ?? 0,
          },
          ...rest,
        ],
      };
    });
    setNote(
      `${slotLabel(index)} started from its ${poseIndex === 0 ? 'side-wall' : 'diagonal-wall'} pose.`,
    );
    setError(null);
  };

  const loadPlanFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setNote(null);
    try {
      const loaded = parseAutoPlan(await file.text());
      commit(loaded);
      setNote(`Loaded a plan from ${file.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that plan.');
    }
  };

  // Everything drawn at the current moment: where each robot is and how much of its path is done.
  const live = useMemo(
    () =>
      plan.robots.map((robot, index) => {
        const schedule = schedules[index] ?? buildSchedule(robot);
        return {
          robot,
          index,
          schedule,
          sample: scheduleAt(schedule, time),
          trail: drivenPath(schedule, time),
        };
      }),
    [plan.robots, schedules, time],
  );

  // The HIVE: where every artifact ends up, when it tips, and which CELL is up as the clock runs.
  const cells = useMemo(() => simulateCells(plan), [plan]);
  const cellsNow = useMemo(
    () => ({ red: cellsAt(cells.red, time), blue: cellsAt(cells.blue, time) }),
    [cells, time],
  );
  const tickFor = useMemo(() => {
    const map = new Map<string, CellTick>();
    for (const alliance of ['red', 'blue'] as const) {
      for (const tick of cells[alliance].ticks) {
        map.set(`${tick.robot}-${tick.step}-${tick.ball}`, tick);
      }
    }
    return map;
  }, [cells]);
  const problems = useMemo(() => planIssues(plan), [plan]);

  // A ball leaves its waypoint when the timetable says so and lands in whichever CELL is up then.
  const balls = useMemo(
    () =>
      plan.robots.flatMap((robot, index) => {
        const schedule = schedules[index] ?? buildSchedule(robot);
        return launches(schedule, robot.shotCycle).flatMap((launch) => {
          const age = time - launch.time;
          if (age < 0 || age > BALL_FLIGHT_SECONDS + 0.4) return [];
          const from = toDraw(launch.from);
          const side =
            tickFor.get(`${index}-${launch.step}-${launch.ball}`)?.side ??
            initialRaisedSide(robot.alliance);
          return [
            {
              key: `${index}-${launch.step}-${launch.ball}`,
              alliance: robot.alliance,
              from,
              to: toDraw(cellAim(robot.alliance, side)),
              progress: Math.min(1, age / BALL_FLIGHT_SECONDS),
              landed: age >= BALL_FLIGHT_SECONDS,
            },
          ];
        });
      }),
    [plan.robots, schedules, time, tickFor],
  );

  const conflict = useMemo(() => firstConflict(plan), [plan]);
  const ballTotal = useMemo(
    () => plan.robots.map((robot) => robot.path.reduce((sum, waypoint) => sum + waypoint.shots, 0)),
    [plan.robots],
  );

  // The waypoint the active robot is at, or the one it is driving towards, gets the row highlight.
  const currentStep = live[activeIndex]?.sample?.step ?? -1;

  // Where the plan's points land, so the board can count up as the clock passes them.
  const scoreTimeline = useMemo(() => scoreEvents(plan), [plan]);
  const scores = useMemo(() => scoreAuto(plan), [plan]);
  const liveScores = useMemo(() => scoreAt(scoreTimeline, time), [scoreTimeline, time]);
  const autonInputs = useRef<Array<HTMLInputElement | null>>([]);

  const exportRobot = (slot: number) => {
    const robot = planRef.current.robots[slot];
    if (!robot) return;
    const name =
      robot.teamNumber === null
        ? `auton-${slotLabel(slot).toLowerCase().replace(' ', '-')}.json`
        : `auton-${robot.teamNumber}.json`;
    downloadJson(serializeRobotPlan(robot, slot), name);
    setNote(`Exported ${slotLabel(slot)} as ${name}.`);
  };

  const importRobotFile = async (slot: number, file: File | undefined) => {
    if (!file) return;
    setError(null);
    setNote(null);
    try {
      const loaded = parseRobotPlan(await file.text(), slot);
      if (!loaded) throw new Error('That file does not hold a robot auton.');
      changeRobot(slot, () => loaded);
      setNote(`${slotLabel(slot)} loaded from ${file.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read that auton.');
    }
  };

  const renderRobotPanel = (slot: number) => {
    const robot = plan.robots[slot] ?? defaultRobot(slot);
    const schedule = schedules[slot] ?? buildSchedule(robot);
    const problems = robotIssues(robot);
    const lookup = teams[slot];
    const logo = robot.teamNumber === null ? undefined : assets[String(robot.teamNumber)]?.logo;
    const score = scores[robot.alliance].robots.find((entry) => entry.slot === slot);
    const label = slotLabel(slot);

    return (
      <section
        key={`robot-${slot}`}
        className={`config__panel autoplan__robot-panel autoplan__robot-panel--${robot.alliance}${
          slot === activeIndex ? ' autoplan__robot-panel--active' : ''
        }`}
      >
        <div className="autoplan__robot-head">
          <button
            type="button"
            className="autoplan__select"
            aria-pressed={slot === activeIndex}
            onClick={() => setActiveIndex(slot)}
          >
            <span className={`autoplan__dot autoplan__dot--${robot.alliance}`} />
            {label}
          </button>
        </div>

        <div className="autoplan__team">
          <span className="autoplan__team-logo">
            {logo ? (
              <img src={logo} alt="" />
            ) : (
              <span className="autoplan__team-logo--empty">
                {teamInitial(lookup?.name, robot.teamNumber) ?? '?'}
              </span>
            )}
          </span>
          <label className="autoplan__team-field">
            <span>Team</span>
            <input
              className="field__control"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 10136"
              value={robot.teamNumber ?? ''}
              aria-label={`${label} team number`}
              onChange={(event) => {
                const digits = event.target.value.replace(/[^\d]/g, '').slice(0, 6);
                const teamNumber = digits === '' ? null : Number(digits);
                changeRobot(slot, (current) => ({ ...current, teamNumber }));
              }}
            />
          </label>
          <span className="autoplan__team-name">
            {robot.teamNumber === null
              ? 'No team set'
              : (lookup?.name ?? (lookup?.loading ? 'Looking up…' : 'Unknown team'))}
          </span>
        </div>

        <label className="autoplan__speed">
          <span>Speed</span>
          <input
            type="range"
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={1}
            value={robot.speed}
            onChange={(event) => {
              const speed = Number(event.target.value);
              changeRobot(slot, (current) => ({ ...current, speed }));
            }}
          />
          <strong>{robot.speed} in/s</strong>
        </label>

        <label className="autoplan__speed">
          <span>Cycle</span>
          <input
            type="range"
            min={MIN_SHOT_CYCLE}
            max={MAX_SHOT_CYCLE}
            step={0.1}
            value={robot.shotCycle}
            onChange={(event) => {
              const shotCycle = round1(Number(event.target.value));
              changeRobot(slot, (current) => ({ ...current, shotCycle }));
            }}
          />
          <strong>{robot.shotCycle.toFixed(1)} s/ball</strong>
        </label>

        <p className="autoplan__meta">
          {robot.path.length} waypoint{robot.path.length === 1 ? '' : 's'} · finishes at{' '}
          {schedule.duration.toFixed(1)} s · {ballTotal[slot] ?? 0} ball
          {(ballTotal[slot] ?? 0) === 1 ? '' : 's'}
        </p>

        <p className="autoplan__scoreline">
          <span className={score?.left ? 'autoplan__tick autoplan__tick--on' : 'autoplan__tick'}>
            {score?.left ? '✓' : '—'} leave (+{POINTS.leave})
          </span>
          <span className={score?.parked ? 'autoplan__tick autoplan__tick--on' : 'autoplan__tick'}>
            {score?.parked ? '✓' : '—'} park (+{POINTS.park})
          </span>
          <span className="autoplan__tick autoplan__tick--points">{score?.points ?? 0} pts</span>
        </p>

        <div className="autoplan__actions">
          <button
            type="button"
            className="button button--small button--ghost"
            disabled={slot !== activeIndex}
            onClick={() => startFromPose(slot)}
          >
            Start pose
          </button>
          <button
            type="button"
            className="button button--small button--ghost"
            disabled={slot !== activeIndex || robot.path.length === 0}
            onClick={() =>
              changeRobot(slot, (current) => ({
                ...current,
                path: current.path.slice(0, -1),
              }))
            }
          >
            Remove last
          </button>
          <button
            type="button"
            className="button button--small button--danger"
            disabled={robot.path.length === 0}
            onClick={() => changeRobot(slot, (current) => ({ ...current, path: [] }))}
          >
            Clear
          </button>
        </div>

        <div className="autoplan__actions">
          <button
            type="button"
            className="button button--small button--ghost"
            disabled={robot.path.length === 0}
            onClick={() => exportRobot(slot)}
          >
            Export auton
          </button>
          <input
            ref={(element) => {
              autonInputs.current[slot] = element;
            }}
            className="asset__input"
            type="file"
            accept="application/json,.json"
            aria-label={`Import ${label} auton`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void importRobotFile(slot, file);
            }}
          />
          <button
            type="button"
            className="button button--small button--ghost"
            onClick={() => autonInputs.current[slot]?.click()}
          >
            Import auton…
          </button>
        </div>

        {problems.length > 0 ? (
          <ul className="autoplan__issues">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : robot.path.length > 0 ? (
          <p className="autoplan__ok">Fits inside AUTO.</p>
        ) : null}
      </section>
    );
  };

  return (
    <div className="config autoplan">
      <div className="config__inner">
        <header className="config__head">
          <div>
            <p className="detail__kicker">Unlisted · BIOBUZZ 2026–27</p>
            <h1>Autonomous planner</h1>
          </div>
          <button type="button" className="button button--ghost" onClick={onBack}>
            ← {backLabel}
          </button>
        </header>

        <div className="autoplan__grid">
          <aside className="autoplan__side autoplan__side--red">
            <h2 className="autoplan__side-title">
              <span className="autoplan__dot autoplan__dot--red" /> Red alliance
            </h2>
            {renderRobotPanel(0)}
            {renderRobotPanel(1)}
          </aside>

          <div className="autoplan__centre">
            <section className="config__panel autoplan__field-panel">
              <div className="autoplan__playback">
                <button
                  type="button"
                  className="button button--small autoplan__play"
                  onClick={() => {
                    if (!playing && timeRef.current >= AUTO_SECONDS) setTimeBoth(0);
                    setPlaying((value) => !value);
                  }}
                >
                  {playing ? '❚❚ Pause' : '▶ Play'}
                </button>
                <input
                  className="autoplan__scrub"
                  type="range"
                  min={0}
                  max={AUTO_SECONDS}
                  step={0.05}
                  value={time}
                  aria-label="Auto timeline"
                  onChange={(event) => {
                    setPlaying(false);
                    setTimeBoth(Number(event.target.value));
                  }}
                />
                <span className="autoplan__clock">
                  <strong>{seconds(time)}</strong> / {AUTO_SECONDS} s
                </span>
                <select
                  className="field__control autoplan__rate"
                  value={rate}
                  aria-label="Playback speed"
                  onChange={(event) => setRate(Number(event.target.value))}
                >
                  <option value={0.25}>¼×</option>
                  <option value={0.5}>½×</option>
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                </select>
                <button
                  type="button"
                  className="button button--small button--ghost"
                  onClick={() => {
                    setPlaying(false);
                    setTimeBoth(0);
                  }}
                >
                  ⏮ Reset
                </button>
                <button
                  type="button"
                  className="button button--small button--ghost autoplan__three-open"
                  title="Play the plan in 3D"
                  onClick={() => {
                    setPlaying(false);
                    setShow3d(true);
                  }}
                >
                  ⛶ 3D view
                </button>
              </div>

              <div className="autoplan__scoreboard">
                {(['red', 'blue'] as const).map((alliance) => {
                  const now = liveScores[alliance];
                  const final = scores[alliance];
                  return (
                    <div key={alliance} className={`autoplan__score autoplan__score--${alliance}`}>
                      <span className="autoplan__score-title">
                        <span className={`autoplan__dot autoplan__dot--${alliance}`} />{' '}
                        {alliance === 'red' ? 'Red' : 'Blue'}
                      </span>
                      <strong
                        className="autoplan__score-total"
                        title="Points scored so far in the playback"
                      >
                        {now.total}
                      </strong>
                      <span className="autoplan__score-breakdown">
                        leave {now.leave} · park {now.park} · tips {now.tips} ({now.tipCount}×
                        {POINTS.tip})
                      </span>
                      <span
                        className="autoplan__score-final"
                        title="Score when AUTO ends, with every point in the plan banked"
                      >
                        final {final.total}
                      </span>
                    </div>
                  );
                })}
                <p className="config__hint autoplan__score-hint">
                  LEAVE {POINTS.leave} each if a robot finishes {LEAVE_DISTANCE} in. clear of its
                  first waypoint · PARK {POINTS.park} each if it finishes with any part of its 18
                  in. footprint inside its own LOADING ZONE · TIP {POINTS.tip} each, banked as the
                  clock reaches them.
                </p>
              </div>

              <svg
                ref={svgRef}
                className="autoplan__map"
                viewBox={`${-(HALF_FIELD + MARGIN)} ${-(HALF_FIELD + MARGIN)} ${VIEW} ${VIEW}`}
                role="img"
                aria-label="BIOBUZZ field map with planned paths"
                onPointerMove={(event) => {
                  const drag = dragRef.current;
                  if (!drag) return;
                  const point = pointFromEvent(event);
                  if (!point) return;
                  // A press only becomes a drag once it travels; under that it is a tap.
                  if (!drag.moved) {
                    if (Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) < TAP_SLOP) {
                      return;
                    }
                    drag.moved = true;
                    // One snapshot for the whole gesture, taken before its first change.
                    pushHistory(planRef.current);
                  }
                  if (drag.kind === 'rotate') {
                    const waypoint = planRef.current.robots[drag.robot]?.path[drag.waypoint];
                    if (!waypoint) return;
                    const angle = Math.atan2(point.y - waypoint.y, point.x - waypoint.x);
                    turnWaypoint(
                      drag.robot,
                      drag.waypoint,
                      snapHeading(angle, planRef.current.headingSnap),
                    );
                    return;
                  }
                  moveWaypoint(drag.robot, drag.waypoint, point);
                }}
                onPointerUp={() => {
                  const drag = dragRef.current;
                  dragRef.current = null;
                  // Tapping a waypoint sends the clock there, so the robot stands on it.
                  if (drag && !drag.moved) jumpToWaypoint(drag.robot, drag.waypoint);
                }}
                onPointerLeave={() => {
                  dragRef.current = null;
                }}
              >
                <rect
                  x={-HALF_FIELD}
                  y={-HALF_FIELD}
                  width={FIELD_SIZE}
                  height={FIELD_SIZE}
                  className="autoplan__mat"
                  onClick={(event) => {
                    if (event.detail > 1) return;
                    const point = pointFromEvent(event);
                    if (point) addWaypoint(point);
                  }}
                />

                <g className="autoplan__gridlines" aria-hidden="true">
                  {Array.from(
                    { length: Math.floor(FIELD_SIZE / TILE) + 1 },
                    (_, at) => -HALF_FIELD + at * TILE,
                  ).map((line) => (
                    <g key={`grid-${line}`}>
                      <line x1={line} y1={-HALF_FIELD} x2={line} y2={HALF_FIELD} />
                      <line x1={-HALF_FIELD} y1={line} x2={HALF_FIELD} y2={line} />
                    </g>
                  ))}
                </g>

                <g className="autoplan__scenery" aria-hidden="true">
                  <Zones />
                  <Flowers />
                  <Hive cells={cellsNow} time={time} />
                  <Starts />
                </g>

                {/* Planned paths, the inactive robot first so the selected one draws on top. */}
                {live.map(({ robot, index }) => {
                  if (index === activeIndex || robot.path.length === 0) return null;
                  const points = robot.path.map(toDraw).map((p) => `${p.x},${p.y}`).join(' ');
                  return (
                    <polyline
                      key={`path-${index}`}
                      points={points}
                      className={`autoplan__path autoplan__path--${robot.alliance} autoplan__path--muted`}
                    />
                  );
                })}

                {live.map(({ robot, index, trail }) => {
                  if (index !== activeIndex || robot.path.length === 0) return null;
                  const planned = robot.path.map(toDraw).map((p) => `${p.x},${p.y}`).join(' ');
                  const driven = trail.map(toDraw).map((p) => `${p.x},${p.y}`).join(' ');
                  return (
                    <g key={`active-${index}`}>
                      {/* Each shooting waypoint gets a hairline to the CELL its first artifact enters. */}
                      {robot.path.map((waypoint, at) => {
                        if (waypoint.shots === 0) return null;
                        const side: CellSide =
                          tickFor.get(`${index}-${at}-0`)?.side ?? initialRaisedSide(robot.alliance);
                        const from = toDraw(waypoint);
                        const to = toDraw(cellAim(robot.alliance, side));
                        return (
                          <line
                            key={`aim-${at}`}
                            x1={from.x}
                            y1={from.y}
                            x2={to.x}
                            y2={to.y}
                            className={`autoplan__aim autoplan__aim--${robot.alliance}`}
                          />
                        );
                      })}
                      <polyline
                        points={planned}
                        className={`autoplan__path autoplan__path--${robot.alliance}`}
                      />
                      {trail.length > 1 ? (
                        <polyline
                          points={driven}
                          className={`autoplan__driven autoplan__driven--${robot.alliance}`}
                        />
                      ) : null}
                      {robot.path.map((point, at) => {
                        const draw = toDraw(point);
                        const shooting = point.shots > 0;
                        return (
                          <g key={`wp-${index}-${at}`}>
                            <title>
                              {`Waypoint ${at + 1}: tap to jump the clock here, drag to move it, right-click to delete`}
                            </title>
                            <circle
                              cx={draw.x}
                              cy={draw.y}
                              r={shooting ? 3.1 : 2.6}
                              className={shooting ? 'autoplan__handle autoplan__handle--shot' : 'autoplan__handle'}
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                event.preventDefault();
                                // History is pushed on the first real movement, so a tap leaves none.
                                dragRef.current = {
                                  kind: 'move',
                                  robot: index,
                                  waypoint: at,
                                  pointerId: event.pointerId,
                                  start: { x: event.clientX, y: event.clientY },
                                  moved: false,
                                };
                                event.currentTarget.setPointerCapture?.(event.pointerId);
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                removeWaypoint(at);
                              }}
                              onDoubleClick={(event) => {
                                event.stopPropagation();
                                removeWaypoint(at);
                              }}
                            />
                            <text
                              x={draw.x}
                              y={draw.y + 0.9}
                              textAnchor="middle"
                              className="autoplan__wp-num"
                            >
                              {at + 1}
                            </text>
                            {shooting ? (
                              <text
                                x={draw.x + 3.4}
                                y={draw.y - 2.6}
                                className={`autoplan__wp-balls autoplan__wp-balls--${robot.alliance}`}
                              >
                                ×{point.shots}
                              </text>
                            ) : null}
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

                {/* Robot footprints at the current moment: team logo, or the team's initial, or the slot. */}
                {live.map(({ robot, index, sample }) => {
                  if (!sample) return null;
                  const draw = toDraw(sample.pos);
                  const degrees = (-sample.heading * 180) / Math.PI;
                  const logo = robot.teamNumber === null ? undefined : assets[String(robot.teamNumber)]?.logo;
                  const initial = teamInitial(teams[index]?.name, robot.teamNumber);
                  // Standing on a waypoint, the robot itself can be dragged to move that waypoint.
                  const grabbable = !sample.moving;
                  const clipId = `autoplan-logo-clip-${index}`;
                  return (
                    <g
                      key={`robot-${index}`}
                      className={`autoplan__robot autoplan__robot--${robot.alliance}${
                        grabbable ? ' autoplan__robot--grabbable' : ''
                      }`}
                      onPointerDown={(event) => {
                        if (!grabbable) return;
                        event.stopPropagation();
                        event.preventDefault();
                        setPlaying(false);
                        setActiveIndex(index);
                        // Selecting a robot is not an edit, so the undo snapshot waits for a drag.
                        dragRef.current = {
                          kind: 'move',
                          robot: index,
                          waypoint: sample.step,
                          pointerId: event.pointerId,
                          start: { x: event.clientX, y: event.clientY },
                          moved: false,
                        };
                        event.currentTarget.setPointerCapture?.(event.pointerId);
                      }}
                    >
                      <g transform={`translate(${draw.x} ${draw.y}) rotate(${degrees})`}>
                        <rect
                          x={-ROBOT_SIZE / 2}
                          y={-ROBOT_SIZE / 2}
                          width={ROBOT_SIZE}
                          height={ROBOT_SIZE}
                          rx={2}
                          className={
                            index === activeIndex
                              ? 'autoplan__footprint autoplan__footprint--active'
                              : 'autoplan__footprint'
                          }
                        />
                        <line
                          x1={0}
                          y1={0}
                          x2={ROBOT_SIZE / 2 - 2}
                          y2={0}
                          className="autoplan__nose"
                        />
                      </g>
                      {/* The badge is a disc, so a square logo is cropped rather than spilling out. */}
                      <circle
                        cx={draw.x}
                        cy={draw.y}
                        r={BADGE_RADIUS}
                        className="autoplan__robot-badge-bg"
                      />
                      {logo ? (
                        <>
                          <clipPath id={clipId}>
                            <circle cx={draw.x} cy={draw.y} r={BADGE_RADIUS - 0.6} />
                          </clipPath>
                          <image
                            href={logo}
                            x={draw.x - BADGE_RADIUS}
                            y={draw.y - BADGE_RADIUS}
                            width={BADGE_RADIUS * 2}
                            height={BADGE_RADIUS * 2}
                            preserveAspectRatio="xMidYMid meet"
                            clipPath={`url(#${clipId})`}
                            className="autoplan__robot-logo"
                          />
                        </>
                      ) : initial === null ? (
                        <text
                          x={draw.x}
                          y={draw.y + 2.8}
                          textAnchor="middle"
                          className="autoplan__robot-num"
                        >
                          {index + 1}
                        </text>
                      ) : (
                        <text
                          x={draw.x}
                          y={draw.y}
                          textAnchor="middle"
                          dy={2.8}
                          className="autoplan__initial-text"
                        >
                          {initial}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* The selected robot gets a grip out along its heading: drag it to set the pose. */}
                {(() => {
                  const current = live[activeIndex];
                  if (!current?.sample || current.sample.moving) return null;
                  const waypoint = current.robot.path[current.sample.step];
                  if (!waypoint) return null;
                  const grip = toDraw({
                    x: waypoint.x + Math.cos(current.sample.heading) * ROTATE_HANDLE_DISTANCE,
                    y: waypoint.y + Math.sin(current.sample.heading) * ROTATE_HANDLE_DISTANCE,
                  });
                  // Start the connector at the badge's edge so it reads clearly past the footprint.
                  const from = toDraw({
                    x: waypoint.x + Math.cos(current.sample.heading) * (BADGE_RADIUS + 1),
                    y: waypoint.y + Math.sin(current.sample.heading) * (BADGE_RADIUS + 1),
                  });
                  return (
                    <g className={`autoplan__rotate autoplan__rotate--${current.robot.alliance}`}>
                      <line x1={from.x} y1={from.y} x2={grip.x} y2={grip.y} />
                      <circle
                        cx={grip.x}
                        cy={grip.y}
                        r={3.1}
                        className="autoplan__rotate-grip"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          event.preventDefault();
                          setPlaying(false);
                          dragRef.current = {
                            kind: 'rotate',
                            robot: activeIndex,
                            waypoint: current.sample!.step,
                            pointerId: event.pointerId,
                            start: { x: event.clientX, y: event.clientY },
                            moved: false,
                          };
                          event.currentTarget.setPointerCapture?.(event.pointerId);
                        }}
                      />
                    </g>
                  );
                })()}

                {balls.map((ball) => {
                  const x = ball.from.x + (ball.to.x - ball.from.x) * ball.progress;
                  const y = ball.from.y + (ball.to.y - ball.from.y) * ball.progress;
                  return (
                    <g key={ball.key} className={`autoplan__ball autoplan__ball--${ball.alliance}`}>
                      <line
                        x1={ball.from.x}
                        y1={ball.from.y}
                        x2={x}
                        y2={y}
                        className="autoplan__ball-trail"
                      />
                      <circle cx={x} cy={y} r={2.4} />
                      {ball.landed ? (
                        <circle cx={ball.to.x} cy={ball.to.y} r={4} className="autoplan__impact" />
                      ) : null}
                    </g>
                  );
                })}

                <text
                  x={0}
                  y={HALF_FIELD + MARGIN - 1.5}
                  textAnchor="middle"
                  className="autoplan__edge"
                >
                  audience wall
                </text>
                <text
                  x={0}
                  y={-HALF_FIELD - MARGIN + 4.5}
                  textAnchor="middle"
                  className="autoplan__edge"
                >
                  rear wall
                </text>
              </svg>

              <p className="autoplan__legend">
                <span className="autoplan__legend-item">
                  <i className="autoplan__swatch autoplan__swatch--cell" /> raised cell (shot target)
                </span>
                <span className="autoplan__legend-item">
                  <i className="autoplan__swatch autoplan__swatch--flower" /> flower
                </span>
                <span className="autoplan__legend-item">
                  <i className="autoplan__swatch autoplan__swatch--loading" /> loading zone (park)
                </span>
                <span className="autoplan__legend-item">
                  <i className="autoplan__swatch autoplan__swatch--garden" /> garden
                </span>
                <span className="autoplan__legend-item">
                  <i className="autoplan__swatch autoplan__swatch--start" /> starting pose
                </span>
              </p>

              {/* The timetable: one row per waypoint, in the order the robot visits them. */}
              <div className="autoplan__waypoints">
                <div className="autoplan__waypoints-head">
                  <h2>Robot {activeIndex + 1} waypoints</h2>
                  <span className="autoplan__waypoints-total">
                    {active ? `${active.path.length} stops` : ''} · last action at{' '}
                    {activeSchedule.duration.toFixed(1)} s · {ballTotal[activeIndex] ?? 0} ball
                    {(ballTotal[activeIndex] ?? 0) === 1 ? '' : 's'}
                  </span>
                </div>

                {active && active.path.length > 0 ? (
                  <table className="autoplan__table">
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">Arrives</th>
                        <th scope="col">Facing</th>
                        <th scope="col">Wait</th>
                        <th scope="col">Balls</th>
                        <th scope="col">Leaves</th>
                        <th scope="col">
                          <span className="autoplan__sr">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSchedule.steps.map((step) => {
                        const waypoint = active.path[step.index];
                        if (!waypoint) return null;
                        const isLast = step.index === active.path.length - 1;
                        return (
                          <tr
                            key={step.index}
                            className={
                              currentStep === step.index ? 'autoplan__row autoplan__row--now' : 'autoplan__row'
                            }
                          >
                            <th scope="row">
                              <button
                                type="button"
                                className="autoplan__row-index"
                                title="Jump to this waypoint"
                                onClick={() => jumpToWaypoint(activeIndex, step.index)}
                              >
                                {step.index + 1}
                              </button>
                            </th>
                            <td>
                              {step.index === 0 ? (
                                <span className="autoplan__fixed">0.00</span>
                              ) : (
                                <input
                                  type="number"
                                  className="field__control autoplan__cell-input"
                                  min={0}
                                  max={AUTO_SECONDS}
                                  step={0.01}
                                  value={round2(step.arrive)}
                                  aria-label={`Arrival time for waypoint ${step.index + 1}`}
                                  onChange={(event) => {
                                    const target = Number(event.target.value);
                                    if (!Number.isFinite(target)) return;
                                    changeRobot(activeIndex, (robot) =>
                                      retimeArrival(robot, step.index, target),
                                    );
                                  }}
                                />
                              )}
                            </td>
                            <td>
                              <input
                                type="number"
                                className="field__control autoplan__cell-input autoplan__cell-input--angle"
                                min={0}
                                max={359}
                                step={5}
                                value={Math.round((waypoint.heading * 180) / Math.PI)}
                                title="Facing in degrees: 0 faces across the field, 90 faces the audience wall"
                                aria-label={`Facing for waypoint ${step.index + 1} in degrees`}
                                onChange={(event) => {
                                  const degrees = Number(event.target.value);
                                  if (!Number.isFinite(degrees)) return;
                                  patchWaypoint(activeIndex, step.index, {
                                    heading: normalizeHeading((degrees * Math.PI) / 180),
                                  });
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="field__control autoplan__cell-input"
                                min={0}
                                max={MAX_WAIT}
                                step={0.1}
                                value={round2(waypoint.wait)}
                                aria-label={`Wait at waypoint ${step.index + 1}`}
                                onChange={(event) =>
                                  patchWaypoint(activeIndex, step.index, {
                                    wait: round2(
                                      clamp(Number(event.target.value) || 0, 0, MAX_WAIT),
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="field__control autoplan__cell-input"
                                min={0}
                                max={MAX_BALLS}
                                step={1}
                                value={waypoint.shots}
                                aria-label={`Balls launched at waypoint ${step.index + 1}`}
                                onChange={(event) =>
                                  patchWaypoint(activeIndex, step.index, {
                                    shots: Math.round(
                                      clamp(Number(event.target.value) || 0, 0, MAX_BALLS),
                                    ),
                                  })
                                }
                              />
                            </td>
                            <td className="autoplan__departs">
                              {step.depart.toFixed(2)} s
                            </td>
                            <td>
                              <button
                                type="button"
                                className="autoplan__row-remove"
                                aria-label={`Remove waypoint ${step.index + 1}`}
                                title={isLast ? 'Remove this waypoint' : 'Remove and close the gap'}
                                onClick={() => removeWaypoint(step.index)}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <p className="empty">Click the field to add the first waypoint.</p>
                )}
                <p className="autoplan__table-hint">
                  Arrival times are worked out from the distance and the robot&apos;s speed. Editing one
                  adds the difference to the wait before it; the first waypoint always starts at 0.00 s.
                  Tap a waypoint on the map to jump the clock to it; drag it to move it.
                </p>
              </div>
            </section>
            <section className="config__panel">
              <h2>Plan</h2>
              <div className="autoplan__setting">
                <label htmlFor="autoplan-snap">Snap new waypoints</label>
                <select
                  id="autoplan-snap"
                  className="field__control"
                  value={plan.snap}
                  onChange={(event) => {
                    const snap = Number(event.target.value);
                    commit({ ...plan, snap });
                  }}
                >
                  {SNAP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === 0 ? 'Off' : `${option} in`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="autoplan__setting">
                <label htmlFor="autoplan-heading-snap">Snap poses</label>
                <select
                  id="autoplan-heading-snap"
                  className="field__control"
                  value={plan.headingSnap}
                  onChange={(event) => {
                    const headingSnap = Number(event.target.value);
                    commit({ ...plan, headingSnap });
                  }}
                >
                  {HEADING_SNAP_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === 0 ? 'Off' : `${option}°`}
                    </option>
                  ))}
                </select>
              </div>
              <div className="autoplan__actions">
                <button
                  type="button"
                  className="button button--small button--ghost"
                  disabled={history.length === 0}
                  onClick={undo}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="button button--small button--ghost"
                  disabled={plan.robots.every((robot) => robot.path.length === 0)}
                  onClick={() => downloadPlan(plan)}
                >
                  Export JSON
                </button>
                <input
                  ref={fileInput}
                  className="asset__input"
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    void loadPlanFile(file);
                  }}
                />
                <button
                  type="button"
                  className="button button--small button--ghost"
                  onClick={() => fileInput.current?.click()}
                >
                  Import…
                </button>
                <button
                  type="button"
                  className="button button--small button--danger"
                  onClick={() => {
                    commit(defaultPlan());
                    setTimeBoth(0);
                    setPlaying(false);
                    setNote('Plan reset.');
                  }}
                >
                  Reset
                </button>
              </div>
              {conflict ? (
                <p className="config__error autoplan__conflict">
                  The two robots come within {conflict.distance.toFixed(1)} in. of each other at{' '}
                  {seconds(conflict.time)} — they would collide.
                </p>
              ) : null}
              {problems.map((problem) => (
                <p key={problem} className="config__error autoplan__conflict">
                  {problem}
                </p>
              ))}
              <div className="autoplan__tips">
                <h3>HIVE tips</h3>
                {(['red', 'blue'] as const).map((alliance) => {
                  const tips = cells[alliance].tips;
                  return (
                    <p key={alliance} className={`autoplan__tips-row autoplan__tips-row--${alliance}`}>
                      <span className={`autoplan__dot autoplan__dot--${alliance}`} />
                      <span>
                        {alliance === 'red' ? 'Red' : 'Blue'}:{' '}
                        {tips.length === 0
                          ? `no tip — up to ${FIRST_TIP_BALLS} artifacts, ${cells[alliance].load} in the cell`
                          : `${tips.length} tip${tips.length === 1 ? '' : 's'} at ${tips
                              .map((tip) => `${tip.time.toFixed(1)} s`)
                              .join(', ')} · ${cells[alliance].load}/${cells[alliance].threshold} in the cell`}
                      </span>
                    </p>
                  );
                })}
                <p className="config__hint autoplan__tips-hint">
                  {FIRST_TIP_BALLS} artifacts tip the first CELL, {TIP_BALLS} tip each one after that. The
                  side a robot aims at swaps on every tip.
                </p>
              </div>
              <p className="config__hint autoplan__save-hint">
                Saved in this browser as you edit ({AUTO_PLAN_KEY}); export it to keep or share a copy.
              </p>
            </section>

            {note ? <p className="config__note">{note}</p> : null}
            {error ? <p className="config__error">{error}</p> : null}
          </div>

          <aside className="autoplan__side autoplan__side--blue">
            <h2 className="autoplan__side-title">
              <span className="autoplan__dot autoplan__dot--blue" /> Blue alliance
            </h2>
            {renderRobotPanel(2)}
            {renderRobotPanel(3)}
          </aside>
        </div>
      </div>

      {show3d ? (
        <AutoPlan3DView
          plan={plan}
          assets={assets}
          teamNames={teams.map((team) => team.name)}
          time={time}
          playing={playing}
          rate={rate}
          onTime={(seconds) => {
            setPlaying(false);
            setTimeBoth(seconds);
          }}
          onTogglePlay={() => {
            if (!playing && timeRef.current >= AUTO_SECONDS) setTimeBoth(0);
            setPlaying((value) => !value);
          }}
          onRate={setRate}
          onClose={() => setShow3d(false)}
        />
      ) : null}
    </div>
  );
}
