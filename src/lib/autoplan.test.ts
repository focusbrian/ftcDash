import { describe, expect, it } from 'vitest';
import {
  AUTO_PLAN_KEY,
  AUTO_SECONDS,
  DEFAULT_HEADING_SNAP,
  DEFAULT_SHOT_CYCLE,
  DEFAULT_SPEED,
  FIELD_SIZE,
  FLOWERS,
  GARDEN,
  HALF_FIELD,
  HEADING_SNAP_OPTIONS,
  HIVE_FRAME,
  LOADING,
  MAX_BALLS,
  MAX_SHOT_CYCLE,
  MAX_SPEED,
  MAX_WAIT,
  MIN_SHOT_CYCLE,
  MIN_SPEED,
  ROBOT_SIZE,
  buildSchedule,
  cellAim,
  cellsAt,
  clampToField,
  defaultPlan,
  defaultRobot,
  drivenPath,
  firstConflict,
  FIRST_TIP_BALLS,
  flowerBox,
  hiveCell,
  hiveCellOnSide,
  initialRaisedSide,
  isParked,
  awayFromNearestWall,
  headingBetween,
  launches,
  lerpHeading,
  mirroredPlan,
  normalizeHeading,
  otherSide,
  parseAutoPlan,
  parseRobotPlan,
  planIssues,
  POINTS,
  rectCentre,
  retimeArrival,
  robotIssues,
  round1,
  scheduleAt,
  scoreAt,
  scoreAuto,
  scoreEvents,
  serializeAutoPlan,
  serializeRobotPlan,
  simulateCells,
  snapPoint,
  snapHeading,
  startPose,
  TIP_BALLS,
  type AutoPlan,
  type RobotPlan,
  type Waypoint,
} from './autoplan';

function wp(x: number, y: number, wait = 0, shots = 0, heading = 0, after = 0): Waypoint {
  return { x, y, heading, wait, shots, after };
}

function robot(overrides: Partial<RobotPlan> = {}): RobotPlan {
  return {
    alliance: 'blue',
    teamNumber: null,
    speed: 24,
    shotCycle: 0.5,
    path: [wp(0, -60), wp(0, 0)],
    ...overrides,
  };
}

describe('field geometry', () => {
  it('draws a field whose inside face is 141.2 in. square', () => {
    expect(FIELD_SIZE).toBeCloseTo(141.2);
    expect(HALF_FIELD).toBeCloseTo(70.6);
  });

  it('puts one raised CELL on each side of the shared HIVE frame', () => {
    const red = hiveCell('red');
    const blue = hiveCell('blue');

    // Red's CELL is raised toward the audience (negative y), blue's toward the rear wall.
    expect(red.y + red.height).toBeLessThan(0);
    expect(blue.y).toBeGreaterThan(0);
    // Both sit inside the frame, side by side, mirrored about the middle.
    expect(red.x + red.width).toBeLessThan(0);
    expect(blue.x).toBeGreaterThan(0);
    expect(rectCentre(red).x).toBeCloseTo(-rectCentre(blue).x, 1);

    for (const cell of [red, blue]) {
      expect(cell.x).toBeGreaterThanOrEqual(HIVE_FRAME.x);
      expect(cell.x + cell.width).toBeLessThanOrEqual(HIVE_FRAME.x + HIVE_FRAME.width);
    }
  });

  it('draws both CELLs of an alliance, mirrored about the middle of the HIVE', () => {
    const audience = hiveCellOnSide('red', 'audience');
    const rear = hiveCellOnSide('red', 'rear');

    expect(hiveCell('red')).toEqual(audience);
    expect(rectCentre(rear).y).toBeCloseTo(-rectCentre(audience).y);
    expect(rectCentre(rear).x).toBeCloseTo(rectCentre(audience).x);
  });

  it('aims a shot at the middle of the shooter’s own CELL', () => {
    expect(cellAim('red')).toEqual(rectCentre(hiveCell('red')));
    expect(cellAim('blue')).toEqual(rectCentre(hiveCell('blue')));
    expect(cellAim('red').y).toBeLessThan(0);
    expect(cellAim('blue').y).toBeGreaterThan(0);
  });

  it('places the four flowers on the walls, clear of the field', () => {
    expect(FLOWERS).toHaveLength(4);
    expect(FLOWERS.map((f) => f.wall).sort()).toEqual(['audience', 'blue', 'rear', 'red']);

    for (const flower of FLOWERS) {
      const box = flowerBox(flower);
      const gaps = [
        Math.abs(box.x - -HALF_FIELD),
        Math.abs(box.x + box.width - HALF_FIELD),
        Math.abs(box.y - -HALF_FIELD),
        Math.abs(box.y + box.height - HALF_FIELD),
      ];
      expect(Math.min(...gaps)).toBeLessThan(4);
    }
  });

  it('puts each loading zone and garden on that alliance’s own half', () => {
    expect(rectCentre(LOADING.red).x).toBeLessThan(0);
    expect(rectCentre(LOADING.blue).x).toBeGreaterThan(0);
    expect(rectCentre(LOADING.red).y).toBeGreaterThan(0);
    expect(rectCentre(LOADING.blue).y).toBeLessThan(0);

    expect(rectCentre(GARDEN.red).y).toBeLessThan(-HALF_FIELD + 4);
    expect(rectCentre(GARDEN.blue).y).toBeGreaterThan(HALF_FIELD - 4);
  });

  it('mirrors the two starting poses about the middle and keeps them in the field', () => {
    const red0 = startPose('red', 0);
    const blue0 = startPose('blue', 0);
    const red1 = startPose('red', 1);
    const blue1 = startPose('blue', 1);

    expect(blue0.x).toBeCloseTo(-red0.x);
    expect(blue1.x).toBeCloseTo(-red1.x);
    expect(blue0.y).toBeCloseTo(-red0.y);

    for (const pose of [red0, red1, blue0, blue1]) {
      expect(Math.abs(pose.x) + ROBOT_SIZE / 2).toBeLessThanOrEqual(HALF_FIELD + 1e-9);
      expect(Math.abs(pose.y) + ROBOT_SIZE / 2).toBeLessThanOrEqual(HALF_FIELD + 1e-9);
    }
  });

  it('keeps points inside the field', () => {
    expect(clampToField({ x: 200, y: -200 })).toEqual({ x: HALF_FIELD, y: -HALF_FIELD });
    expect(clampToField({ x: FIELD_SIZE, y: 0 })).toEqual({ x: HALF_FIELD, y: 0 });
  });
});

describe('swap alliance', () => {
  const base = (): AutoPlan => ({
    ...defaultPlan(),
    robots: [
      {
        ...defaultRobot(0),
        teamNumber: 10136,
        speed: 48,
        path: [wp(-50, 0, 1, 2, 0), wp(-20, 30, 0, 0, Math.PI / 2)],
      },
      defaultRobot(1),
      defaultRobot(2),
      { ...defaultRobot(3), teamNumber: 23392, path: [wp(40, -40, 0, 0, Math.PI)] },
    ],
  });

  const at = (plan: AutoPlan, slot: number): RobotPlan => {
    const robot = plan.robots[slot];
    if (!robot) throw new Error(`no robot at slot ${slot}`);
    return robot;
  };

  it('turns each path 180° about the centre of the field', () => {
    const swapped = mirroredPlan(base());
    expect(at(swapped, 2).path).toEqual([
      { x: 50, y: 0, heading: Math.PI, wait: 1, shots: 2, after: 0 },
      { x: 20, y: -30, heading: Math.PI * 1.5, wait: 0, shots: 0, after: 0 },
    ]);
    expect(at(swapped, 1).path).toEqual([
      { x: -40, y: 40, heading: 0, wait: 0, shots: 0, after: 0 },
    ]);
  });

  it('leaves the robots themselves on their own alliance', () => {
    const swapped = mirroredPlan(base());
    expect(at(swapped, 0).teamNumber).toBe(10136);
    expect(at(swapped, 0).speed).toBe(48);
    expect(at(swapped, 0).path).toEqual([]);
    expect(at(swapped, 3).teamNumber).toBe(23392);
  });

  it('comes back to where it started when applied twice', () => {
    const plan = base();
    const twice = mirroredPlan(mirroredPlan(plan));
    for (const slot of [0, 1, 2, 3]) {
      const before = at(plan, slot).path;
      const after = at(twice, slot).path;
      expect(after).toHaveLength(before.length);
      after.forEach((point, index) => {
        const original = before[index];
        expect(original).toBeDefined();
        expect(point.x).toBeCloseTo(original?.x ?? 0);
        expect(point.y).toBeCloseTo(original?.y ?? 0);
        expect(Math.cos(point.heading)).toBeCloseTo(Math.cos(original?.heading ?? 0));
        expect(Math.sin(point.heading)).toBeCloseTo(Math.sin(original?.heading ?? 0));
      });
    }
  });
});

describe('buildSchedule', () => {
  it('times the drive from the distance and the speed', () => {
    const schedule = buildSchedule(robot({ speed: 20, path: [wp(0, -60), wp(0, -20)] }));

    expect(schedule.steps).toHaveLength(2);
    expect(schedule.steps[0]?.arrive).toBe(0);
    expect(schedule.steps[1]?.travel).toBeCloseTo(2);
    expect(schedule.steps[1]?.arrive).toBeCloseTo(2);
    expect(schedule.duration).toBeCloseTo(2);
  });

  it('waits, then spends one shot cycle per ball before it can drive on', () => {
    const schedule = buildSchedule(
      robot({ speed: 40, shotCycle: 0.5, path: [wp(0, -60, 1, 3), wp(0, 0)] }),
    );

    // 60 in at 40 in/s, then 1 s of waiting, then 3 balls half a second apart.
    expect(schedule.steps[0]?.arrive).toBe(0);
    expect(schedule.steps[0]?.firstShot).toBeCloseTo(1);
    expect(schedule.steps[0]?.depart).toBeCloseTo(2.5);
    expect(schedule.steps[1]?.arrive).toBeCloseTo(4);
    expect(schedule.duration).toBeCloseTo(4);
  });

  it('is empty when there are no waypoints', () => {
    const schedule = buildSchedule(robot({ path: [] }));
    expect(schedule.steps).toEqual([]);
    expect(schedule.duration).toBe(0);
  });

  it('holds after the last ball before it can drive on', () => {
    const schedule = buildSchedule(
      robot({ speed: 40, shotCycle: 0.5, path: [wp(0, -60, 1, 3, 0, 0.75), wp(0, 0)] }),
    );

    // 1 s wait, three balls half a second apart, then three quarters of a second of holding.
    expect(schedule.steps[0]?.after).toBe(0.75);
    expect(schedule.steps[0]?.depart).toBeCloseTo(3.25);
    // 60 in at 40 in/s gets the robot to the second stop at 4.75 s.
    expect(schedule.steps[1]?.arrive).toBeCloseTo(4.75);
  });

  it('holds at a stop that shoots nothing too', () => {
    const schedule = buildSchedule(robot({ speed: 40, path: [wp(0, -60, 0.5, 0, 0, 2), wp(0, 0)] }));
    expect(schedule.steps[0]?.firstShot).toBeCloseTo(0.5);
    expect(schedule.steps[0]?.depart).toBeCloseTo(2.5);
  });

  it('ignores negative waits and ball counts', () => {
    const schedule = buildSchedule(buildScheduleRobot());
    expect(schedule.steps[0]?.wait).toBe(0);
    expect(schedule.steps[0]?.shots).toBe(0);
    expect(schedule.steps[0]?.after).toBe(0);
  });
});

/** A robot whose stored numbers went negative, as a hand-edited file could make them. */
function buildScheduleRobot(): RobotPlan {
  return {
    alliance: 'red',
    teamNumber: null,
    speed: 30,
    shotCycle: 0.3,
    path: [{ x: 0, y: 0, heading: 0, wait: -4, shots: -2, after: -1 }],
  };
}

describe('scheduleAt', () => {
  const schedule = buildSchedule(robot({ speed: 40, path: [wp(0, -40), wp(0, 0, 1, 2)] }));

  it('starts on the first waypoint', () => {
    const sample = scheduleAt(schedule, 0);
    expect(sample?.pos).toEqual({ x: 0, y: -40 });
    expect(sample?.moving).toBe(false);
  });

  it('interpolates while driving', () => {
    const sample = scheduleAt(schedule, 0.5);
    expect(sample?.pos).toEqual({ x: 0, y: -20 });
    expect(sample?.moving).toBe(true);
  });

  it('holds still for the wait and the shots', () => {
    // Second waypoint arrives at 1 s, then waits 1 s plus two balls at 0.5 s.
    const duringWait = scheduleAt(schedule, 1.5);
    expect(duringWait?.pos).toEqual({ x: 0, y: 0 });
    expect(duringWait?.moving).toBe(false);
    expect(scheduleAt(schedule, 2.9)?.pos).toEqual({ x: 0, y: 0 });
  });

  it('stays put after the last action', () => {
    expect(scheduleAt(schedule, 99)?.pos).toEqual({ x: 0, y: 0 });
  });

  it('has nothing to show without waypoints', () => {
    expect(scheduleAt(buildSchedule(robot({ path: [] })), 3)).toBeNull();
  });
});

describe('drivenPath', () => {
  const schedule = buildSchedule(robot({ speed: 40, path: [wp(0, -40), wp(0, 0), wp(40, 0)] }));

  it('stops at the first waypoint before it leaves', () => {
    expect(drivenPath(schedule, 0)).toEqual([{ x: 0, y: -40 }]);
  });

  it('cuts mid-leg while driving', () => {
    expect(drivenPath(schedule, 0.5)).toEqual([{ x: 0, y: -40 }, { x: 0, y: -20 }]);
  });

  it('covers every waypoint once finished', () => {
    expect(drivenPath(schedule, 99)).toEqual([{ x: 0, y: -40 }, { x: 0, y: 0 }, { x: 40, y: 0 }]);
  });
});

describe('launches', () => {
  it('spaces the balls of a burst one cycle apart', () => {
    const schedule = buildSchedule(
      robot({ speed: 40, shotCycle: 0.4, path: [wp(0, 0, 0.5, 3)] }),
    );
    const shot = launches(schedule, 0.4);

    expect(shot.map((launch) => launch.time)).toEqual([0.5, 0.9, 1.3].map((t) => expect.closeTo(t, 6)));
    expect(shot.every((launch) => launch.from.x === 0 && launch.from.y === 0)).toBe(true);
  });

  it('orders bursts from different waypoints by time', () => {
    const schedule = buildSchedule(
      robot({ speed: 40, shotCycle: 0.5, path: [wp(0, -40, 0, 2), wp(0, 0, 0, 1)] }),
    );
    const shot = launches(schedule, 0.5);
    expect(shot).toHaveLength(3);
    expect(shot.map((launch) => launch.step)).toEqual([0, 0, 1]);
    expect(shot[2]!.time).toBeGreaterThan(shot[1]!.time);
  });
});

describe('retimeArrival', () => {
  const base = robot({ speed: 40, shotCycle: 0.5, path: [wp(0, -40), wp(0, 0)] });

  it('adds the difference to the wait before the waypoint', () => {
    const retimed = retimeArrival(base, 1, 3);
    expect(retimed.path[0]?.wait).toBeCloseTo(2);

    // …and the timetable now arrives when asked.
    expect(buildSchedule(retimed).steps[1]?.arrive).toBeCloseTo(3);
  });

  it('lands exactly on an awkward target instead of the nearest tenth', () => {
    // 1 s of driving, so 2.37 s needs a 1.37 s wait, not 1.4.
    const retimed = retimeArrival(base, 1, 2.37);
    expect(retimed.path[0]?.wait).toBeCloseTo(1.37);
    expect(buildSchedule(retimed).steps[1]?.arrive).toBeCloseTo(2.37);
  });

  it('cannot make a waypoint arrive sooner than driving allows', () => {
    // One second of driving is the floor; asking for 0.5 changes nothing.
    expect(retimeArrival(base, 1, 0.5)).toBe(base);
    expect(buildSchedule(retimeArrival(base, 1, 0.5)).steps[1]?.arrive).toBeCloseTo(1);
  });

  it('adds to a wait that is already there', () => {
    const waiting = robot({ speed: 40, path: [wp(0, -40, 2), wp(0, 0)] });
    const retimed = retimeArrival(waiting, 1, 5);
    expect(retimed.path[0]?.wait).toBeCloseTo(4);
  });

  it('leaves the first waypoint and missing waypoints alone', () => {
    expect(retimeArrival(base, 0, 4)).toBe(base);
    expect(retimeArrival(base, 5, 4)).toBe(base);
  });
});

describe('snapPoint', () => {
  it('rounds to the grid and still clamps to the field', () => {
    expect(snapPoint({ x: 7.4, y: -13.6 }, 6)).toEqual({ x: 6, y: -12 });
    expect(snapPoint({ x: 7.4, y: -13.6 }, 1)).toEqual({ x: 7, y: -14 });
    expect(snapPoint({ x: 200, y: 0 }, 0)).toEqual({ x: HALF_FIELD, y: 0 });
  });
});

describe('parseAutoPlan', () => {
  it('falls back to the default plan for missing or broken data', () => {
    expect(parseAutoPlan(null).robots).toHaveLength(4);
    expect(parseAutoPlan('not json').robots).toHaveLength(4);
    expect(parseAutoPlan('[]').robots).toHaveLength(4);
  });

  it('round-trips a plan through JSON', () => {
    const plan: AutoPlan = {
      version: 1,
      snap: 6,
      headingSnap: 45,
      robots: [
        robot({ alliance: 'red', teamNumber: 10136, path: [wp(0, -40, 1.5, 2), wp(0, 0)] }),
        robot({ alliance: 'red', path: [wp(-30, 10, 0, 1)] }),
        robot({ alliance: 'blue', path: [wp(30, -10, 0, 1)] }),
        robot({ alliance: 'blue', path: [] }),
      ],
    };

    expect(parseAutoPlan(serializeAutoPlan(plan))).toEqual(plan);
  });

  it('gives the four slots two red robots then two blue ones', () => {
    const plan = defaultPlan();
    expect(plan.robots.map((entry) => entry.alliance)).toEqual(['red', 'red', 'blue', 'blue']);
  });

  it('never loads a waypoint with more than one CELL’s worth of artifacts', () => {
    const plan = parseAutoPlan(
      JSON.stringify({
        robots: [{ speed: 40, shotCycle: 0.5, path: [{ x: 0, y: 0, shots: 8 }] }],
      }),
    );
    expect(plan.robots[0]?.path[0]?.shots).toBe(FIRST_TIP_BALLS);
  });

  it('keeps the wait after shooting out of programs that predate it', () => {
    const plan = parseAutoPlan(
      JSON.stringify({
        robots: [{ speed: 40, shotCycle: 0.5, path: [{ x: 0, y: 0, wait: 0.5, shots: 2 }] }],
      }),
    );
    expect(plan.robots[0]?.path[0]?.after).toBe(0);
    expect(plan.robots[0]?.path[0]?.wait).toBe(0.5);
  });

  it('lets the slot decide the alliance, whatever the file says', () => {
    const plan = parseAutoPlan(
      JSON.stringify({
        robots: [
          { alliance: 'blue', path: [wp(0, 0)] },
          { alliance: 'green', path: [wp(0, 0)] },
          { alliance: 'red', path: [wp(0, 0)] },
          { alliance: 'herring', path: [wp(0, 0)] },
        ],
      }),
    );
    expect(plan.robots.map((entry) => entry.alliance)).toEqual(['red', 'red', 'blue', 'blue']);
  });

  it('moves a two-robot plan into the slot that matches each alliance', () => {
    const plan = parseAutoPlan(
      JSON.stringify({
        robots: [
          { alliance: 'red', teamNumber: 111, path: [wp(-10, 0)] },
          { alliance: 'blue', teamNumber: 222, path: [wp(10, 0)] },
        ],
      }),
    );
    expect(plan.robots.map((entry) => entry.teamNumber)).toEqual([111, null, 222, null]);
  });

  it('keeps a pose snap it knows and replaces one it does not', () => {
    const coarse = HEADING_SNAP_OPTIONS[3]!;
    expect(parseAutoPlan(JSON.stringify({ headingSnap: coarse })).headingSnap).toBe(coarse);
    expect(parseAutoPlan(JSON.stringify({ headingSnap: 7 })).headingSnap).toBe(DEFAULT_HEADING_SNAP);
    expect(parseAutoPlan(null).headingSnap).toBe(DEFAULT_HEADING_SNAP);
  });

  it('drops nonsense instead of failing', () => {
    const plan = parseAutoPlan(
      JSON.stringify({
        snap: 7,
        robots: [
          {
            alliance: 'green',
            teamNumber: -3,
            speed: 9000,
            shotCycle: 99,
            path: [{ x: 'a', y: 1 }, { x: 5, y: 6, wait: 900, shots: 900, after: -3 }],
          },
          'nope',
        ],
      }),
    );

    expect(plan.snap).toBe(1);
    expect(plan.headingSnap).toBe(DEFAULT_HEADING_SNAP);
    expect(plan.robots[0]?.alliance).toBe('red');
    expect(plan.robots[0]?.teamNumber).toBeNull();
    expect(plan.robots[0]?.speed).toBe(MAX_SPEED);
    expect(plan.robots[0]?.shotCycle).toBe(MAX_SHOT_CYCLE);
    expect(plan.robots[0]?.path).toEqual([
      { x: 5, y: 6, heading: 0, wait: MAX_WAIT, shots: MAX_BALLS, after: 0 },
    ]);
    expect(plan.robots[1]).toEqual(defaultPlan().robots[1]);
  });

  it('keeps speed and cycle inside the usable range', () => {
    const plan = parseAutoPlan(
      JSON.stringify({ robots: [{ speed: 1, shotCycle: 0 }, { speed: 30, shotCycle: 0.3 }] }),
    );
    expect(plan.robots[0]?.speed).toBe(MIN_SPEED);
    expect(plan.robots[0]?.shotCycle).toBe(MIN_SHOT_CYCLE);
    expect(plan.robots[1]?.speed).toBe(30);
    expect(plan.robots[1]?.shotCycle).toBe(0.3);
  });

  it('starts a robot at 18 in/s and one ball every two seconds', () => {
    expect(defaultRobot(0).speed).toBe(DEFAULT_SPEED);
    expect(defaultRobot(0).shotCycle).toBe(DEFAULT_SHOT_CYCLE);
    expect(MAX_SPEED).toBe(36);
  });

  it('accepts a team number but refuses a silly one', () => {
    const plan = parseAutoPlan(
      JSON.stringify({ robots: [{ teamNumber: 10136 }, { teamNumber: 123456789 }] }),
    );
    expect(plan.robots[0]?.teamNumber).toBe(10136);
    expect(plan.robots[1]?.teamNumber).toBeNull();
  });
});

describe('robotIssues', () => {
  it('asks for waypoints before anything else', () => {
    expect(robotIssues(robot({ path: [] }))).toEqual([
      'No waypoints yet — click the field to start the path.',
    ]);
  });

  it('does not call a lone shooting waypoint a mere start', () => {
    expect(robotIssues(robot({ path: [wp(0, 0, 0, 3)] }))).toEqual([]);
  });

  it('flags a lone waypoint that does nothing', () => {
    expect(robotIssues(robot({ path: [wp(0, 0)] })).join(' ')).toContain('just a start');
  });

  it('flags a timetable that runs past the end of AUTO', () => {
    const slow = robot({ speed: 6, path: [wp(-70, 70), wp(70, -70)] });
    expect(robotIssues(slow).join(' ')).toContain('past the end of AUTO');
  });

  it('counts the shots and waits towards the end of AUTO', () => {
    // A 20 s wait then 12 balls at 3 s each ends at 56 s, well past the 30 s period.
    const slow = robot({ speed: 40, shotCycle: 3, path: [wp(0, 0, 20, 12), wp(0, 1)] });
    const issue = robotIssues(slow).join(' ');
    expect(issue).toContain('ends at 56.0 s');
    expect(issue).toContain(`${(56 - AUTO_SECONDS).toFixed(1)} s past`);
  });

  it('reports a legal plan as clean', () => {
    expect(robotIssues(robot({ path: [wp(0, -60, 0, 2), wp(0, 0)] }))).toEqual([]);
  });
});

describe('firstConflict', () => {
  const plan = (first: RobotPlan, second: RobotPlan): AutoPlan => ({
    version: 1,
    headingSnap: DEFAULT_HEADING_SNAP,
    snap: 1,
    robots: [first, second],
  });

  it('says nothing when only one robot has a path', () => {
    expect(firstConflict(plan(robot(), robot({ path: [] })))).toBeNull();
  });

  it('finds the first moment two footprints touch on crossing paths', () => {
    const conflict = firstConflict(
      plan(
        robot({ speed: 20, path: [wp(-40, 0), wp(40, 0)] }),
        robot({ speed: 20, path: [wp(0, -40), wp(0, 40)] }),
      ),
    );

    expect(conflict).not.toBeNull();
    expect(conflict!.time).toBeGreaterThan(1);
    expect(conflict!.time).toBeLessThan(2);
    expect(conflict!.distance).toBeLessThan(ROBOT_SIZE);
    expect(conflict!.slots).toEqual([0, 1]);
  });

  it('catches a robot driving through a partner that is waiting to shoot', () => {
    const conflict = firstConflict(
      plan(
        // Sits in the middle for a long time.
        robot({ speed: 20, path: [wp(0, 0, 4, 2)] }),
        robot({ speed: 20, path: [wp(-40, 0), wp(40, 0)] }),
      ),
    );
    expect(conflict).not.toBeNull();
  });

  it('leaves robots that pass at different times alone', () => {
    expect(
      firstConflict(
        plan(
          robot({ speed: 20, path: [wp(-40, 0), wp(40, 0)] }),
          robot({ speed: 84, path: [wp(0, -70), wp(0, 70)] }),
        ),
      ),
    ).toBeNull();
  });
});

describe('the HIVE tip', () => {
  const shotter = (shots: number, alliance: 'red' | 'blue' = 'red'): RobotPlan =>
    robot({ alliance, speed: 40, shotCycle: 0.5, path: [wp(0, 0, 0, shots)] });

  const cellsOf = (plan: AutoPlan) => simulateCells(plan);

  it('starts red on its audience cell and blue on its rear cell', () => {
    expect(initialRaisedSide('red')).toBe('audience');
    expect(initialRaisedSide('blue')).toBe('rear');
    expect(otherSide('audience')).toBe('rear');
  });

  it('needs four artifacts for the first tip and eight for the next', () => {
    expect(FIRST_TIP_BALLS).toBe(4);
    expect(TIP_BALLS).toBe(8);

    const plan: AutoPlan = { version: 1, snap: 1, headingSnap: DEFAULT_HEADING_SNAP, robots: [shotter(6), robot({ path: [] })] };
    const red = cellsOf(plan).red;

    // Four artifacts fill the pre-loaded cell and tip it; the next cell then needs eight of its own.
    expect(red.tips).toHaveLength(1);
    expect(red.ticks[3]?.tip).toBe(true);
    expect(red.ticks[4]?.tip).toBe(false);
    expect(red.load).toBe(2);
    expect(red.raised).toBe('rear');
    expect(red.threshold).toBe(TIP_BALLS);
  });

  it('tips the fresh cell on its eighth artifact', () => {
    // Four tip the first cell, then eight fill the second exactly to its threshold.
    const plan: AutoPlan = { version: 1, snap: 1, headingSnap: DEFAULT_HEADING_SNAP, robots: [shotter(12), robot({ path: [] })] };
    const red = cellsOf(plan).red;

    expect(red.tips).toHaveLength(2);
    expect(red.ticks[11]?.tip).toBe(true);
    expect(red.load).toBe(0);
    expect(red.raised).toBe('audience');
  });

  it('holds after eleven artifacts, one short of the second tip', () => {
    const plan: AutoPlan = { version: 1, snap: 1, headingSnap: DEFAULT_HEADING_SNAP, robots: [shotter(11), robot({ path: [] })] };
    const red = cellsOf(plan).red;

    expect(red.tips).toHaveLength(1);
    expect(red.load).toBe(7);
    expect(red.raised).toBe('rear');
  });

  it('swaps the cell the artifacts go into after each tip', () => {
    const plan: AutoPlan = { version: 1, snap: 1, headingSnap: DEFAULT_HEADING_SNAP, robots: [shotter(6), robot({ path: [] })] };
    const red = cellsOf(plan).red;
    expect(red.ticks.slice(0, 4).every((tick) => tick.side === 'audience')).toBe(true);
    expect(red.ticks.slice(4).every((tick) => tick.side === 'rear')).toBe(true);
  });

  it('counts both partners’ artifacts into the same HIVE', () => {
    const plan: AutoPlan = {
      version: 1,
      headingSnap: DEFAULT_HEADING_SNAP,
      snap: 1,
      robots: [shotter(2, 'red'), robot({ alliance: 'red', speed: 40, shotCycle: 0.5, path: [wp(20, 0, 1, 2)] })],
    };
    const red = cellsOf(plan).red;
    // Four artifacts between the two robots tip red's first cell.
    expect(red.tips).toHaveLength(1);
    expect(red.ticks).toHaveLength(4);
  });

  it('leaves the other alliance alone', () => {
    const plan: AutoPlan = { version: 1, snap: 1, headingSnap: DEFAULT_HEADING_SNAP, robots: [shotter(6, 'red'), robot({ path: [] })] };
    const both = cellsOf(plan);
    expect(both.blue.ticks).toHaveLength(0);
    expect(both.blue.tips).toHaveLength(0);
    expect(both.blue.raised).toBe('rear');
  });

  it('orders artifacts by landing time, not by robot', () => {
    // Robot 2 fires late but at the same waypoint, so robot 1's artifacts land first.
    const plan: AutoPlan = {
      version: 1,
      headingSnap: DEFAULT_HEADING_SNAP,
      snap: 1,
      robots: [
        robot({ alliance: 'red', speed: 40, shotCycle: 0.5, path: [wp(0, 0, 0, 2)] }),
        robot({ alliance: 'red', speed: 40, shotCycle: 0.5, path: [wp(10, 0, 5, 2)] }),
      ],
    };
    expect(cellsOf(plan).red.ticks.map((tick) => tick.robot)).toEqual([0, 0, 1, 1]);
  });

  it('reports the load and the raised side part-way through', () => {
    const plan: AutoPlan = { version: 1, snap: 1, headingSnap: DEFAULT_HEADING_SNAP, robots: [shotter(6), robot({ path: [] })] };
    const red = cellsOf(plan).red;

    const early = cellsAt(red, 1);
    expect(early.raised).toBe('audience');
    expect(early.threshold).toBe(FIRST_TIP_BALLS);

    const afterTip = cellsAt(red, 4);
    expect(afterTip.raised).toBe('rear');
    expect(afterTip.threshold).toBe(TIP_BALLS);
    expect(afterTip.tippedAt).not.toBeNull();
  });

  it('warns when a burst keeps firing through a tip', () => {
    // Six artifacts half a second apart: the fourth tips it, the fifth and sixth are in the air.
    const plan: AutoPlan = { version: 1, snap: 1, headingSnap: DEFAULT_HEADING_SNAP, robots: [shotter(6), robot({ path: [] })] };
    expect(planIssues(plan).join(' ')).toContain('keeps firing past the red HIVE tip');
  });

  it('keeps quiet when the burst stops before the tip', () => {
    const plan: AutoPlan = { version: 1, snap: 1, headingSnap: DEFAULT_HEADING_SNAP, robots: [shotter(4), robot({ path: [] })] };
    expect(planIssues(plan)).toEqual([]);
  });
});

describe('waypoint facing', () => {
  it('wraps any angle into one turn', () => {
    expect(normalizeHeading(0)).toBe(0);
    expect(normalizeHeading(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(normalizeHeading(Math.PI * 2.25)).toBeCloseTo(Math.PI * 0.25);
  });

  it('takes the short way round when a robot turns', () => {
    // From just before due west to just past it: a nudge forward, not all the way round.
    const from = Math.PI - 0.1;
    const to = -Math.PI + 0.1;
    const halfway = lerpHeading(from, to, 0.5);
    expect(Math.abs(halfway - Math.PI)).toBeLessThan(0.05);
  });

  it('faces a waypoint along the drive into it, which is how plans without a facing load', () => {
    expect(headingBetween({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0);
    expect(headingBetween({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI / 2);
    expect(headingBetween({ x: 10, y: 10 }, { x: 0, y: 10 })).toBeCloseTo(Math.PI);
  });

  it('turns a start waypoint away from the wall it is nearest', () => {
    expect(awayFromNearestWall({ x: -60, y: 4 })).toBeCloseTo(0);
    expect(awayFromNearestWall({ x: 60, y: 4 })).toBeCloseTo(Math.PI);
    expect(awayFromNearestWall({ x: 4, y: -60 })).toBeCloseTo(Math.PI / 2);
    expect(awayFromNearestWall({ x: 4, y: 60 })).toBeCloseTo((3 * Math.PI) / 2);
  });

  it('leaves a start waypoint in the middle of the field facing along +x', () => {
    // Every wall is the same distance away there, so the plain facing wins.
    expect(awayFromNearestWall({ x: 0, y: 0 })).toBeCloseTo(0);
  });

  it('always points in from the nearest wall, corners included', () => {
    const corners: [number, number][] = [
      [-HALF_FIELD, -HALF_FIELD],
      [HALF_FIELD, -HALF_FIELD],
      [-HALF_FIELD, HALF_FIELD],
      [60, 10],
      [-10, -60],
    ];
    for (const [x, y] of corners) {
      const heading = awayFromNearestWall({ x, y });
      // One step along that facing must not end up nearer the glass than it started.
      const step = 4;
      const moved = { x: x + Math.cos(heading) * step, y: y + Math.sin(heading) * step };
      const nearestWall = (p: { x: number; y: number }) =>
        Math.min(p.x + HALF_FIELD, HALF_FIELD - p.x, p.y + HALF_FIELD, HALF_FIELD - p.y);
      expect(nearestWall(moved)).toBeGreaterThanOrEqual(nearestWall({ x, y }));
    }
  });

  describe('pose snap', () => {
    const deg = (radians: number) => (radians * 180) / Math.PI;
    const fromDeg = (degrees: number, step: number) => snapHeading((degrees * Math.PI) / 180, step);

    it('rounds a pose to the nearest step', () => {
      expect(deg(fromDeg(17.2, 5))).toBeCloseTo(15);
      expect(deg(fromDeg(18.4, 5))).toBeCloseTo(20);
    });

    it('takes whatever step the plan asks for', () => {
      expect(deg(fromDeg(51.6, 45))).toBeCloseTo(45);
      expect(deg(fromDeg(70, 45))).toBeCloseTo(90);
      expect(deg(fromDeg(44.6, 1))).toBeCloseTo(45);
    });

    it('leaves the pose exactly where it was dragged when snapping is off', () => {
      expect(deg(fromDeg(33.3, 0))).toBeCloseTo(33.3);
    });

    it('wraps a rounded pose back into one turn', () => {
      expect(fromDeg(359, 5)).toBeCloseTo(0);
      expect(deg(fromDeg(-17.2, 5))).toBeCloseTo(345);
    });
  });

  it('holds the waypoint heading while it sits still', () => {
    const schedule = buildSchedule(
      robot({ speed: 40, path: [wp(0, -40, 0, 0, Math.PI / 2), wp(0, 0, 1, 0, Math.PI)] }),
    );
    expect(scheduleAt(schedule, 0)?.heading).toBeCloseTo(Math.PI / 2);
    expect(scheduleAt(schedule, 2)?.heading).toBeCloseTo(Math.PI);
    expect(scheduleAt(schedule, 99)?.heading).toBeCloseTo(Math.PI);
  });

  it('turns gradually over the leg instead of snapping on arrival', () => {
    const schedule = buildSchedule(
      robot({ speed: 40, path: [wp(0, -40, 0, 0, 0), wp(0, 0, 0, 0, Math.PI)] }),
    );
    // Halfway along a 1 s leg the robot has turned half a turn.
    expect(scheduleAt(schedule, 0.5)?.heading).toBeCloseTo(Math.PI / 2, 5);
  });

  it('gives an old plan without headings the direction it drove in', () => {
    const plan = parseAutoPlan(
      JSON.stringify({
        robots: [{ path: [{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: -40, y: 40 }] }],
      }),
    );
    const path = plan.robots[0]?.path ?? [];
    expect(path[0]?.heading).toBe(0);
    expect(path[1]?.heading).toBeCloseTo(Math.PI / 2);
    expect(path[2]?.heading).toBeCloseTo(Math.PI);
  });

  it('keeps a stored heading, normalised', () => {
    const plan = parseAutoPlan(
      JSON.stringify({ robots: [{ path: [{ x: 0, y: 0, heading: -Math.PI / 2 }] }] }),
    );
    expect(plan.robots[0]?.path[0]?.heading).toBeCloseTo((3 * Math.PI) / 2);
  });
});

describe('a single robot’s auton file', () => {
  it('round-trips one robot and keeps the slot’s alliance', () => {
    const source = robot({
      alliance: 'red',
      teamNumber: 10136,
      path: [wp(0, -40, 1, 2, 0, 0.5), wp(0, 0, 0, 3)],
    });
    const text = serializeRobotPlan(source, 1);
    expect(JSON.parse(text)).toMatchObject({ app: 'ftcdash', kind: 'auton' });
    expect(parseRobotPlan(text, 1)).toEqual(source);
  });

  it('reads a bare robot object as well as a wrapped one', () => {
    const bare = robot({ path: [wp(5, 5)] });
    expect(parseRobotPlan(JSON.stringify(bare), 2)).toMatchObject({ alliance: 'blue' });
  });

  it('refuses a file that holds no auton', () => {
    expect(parseRobotPlan(null, 0)).toBeNull();
    expect(parseRobotPlan('not json', 0)).toBeNull();
    expect(parseRobotPlan(JSON.stringify({ robot: { speed: 40 } }), 0)).toBeNull();
  });
});

describe('scoreAuto', () => {
  const planOf = (slots: Record<number, RobotPlan> = {}): AutoPlan => ({
    version: 1,
    headingSnap: DEFAULT_HEADING_SNAP,
    snap: 1,
    robots: Array.from({ length: 4 }, (_, slot) => slots[slot] ?? defaultRobot(slot)),
  });

  it('scores an empty plan at nothing, with a line per robot', () => {
    const scores = scoreAuto(planOf());
    expect(scores.red.total).toBe(0);
    expect(scores.blue.total).toBe(0);
    expect(scores.red.robots.map((entry) => entry.slot)).toEqual([0, 1]);
    expect(scores.blue.robots.map((entry) => entry.slot)).toEqual([2, 3]);
    expect(scores.red.robots[0]).toMatchObject({ planned: false, left: false, parked: false });
  });

  it('pays for leaving when the robot finishes clear of its first waypoint', () => {
    const scores = scoreAuto(planOf({ 0: robot({ alliance: 'red', path: [wp(0, -40), wp(0, 0)] }) }));
    expect(scores.red.robots[0]).toMatchObject({ left: true, parked: false, points: POINTS.leave });
    expect(scores.red.total).toBe(POINTS.leave);
  });

  it('pays for parking when the robot finishes in its own LOADING ZONE', () => {
    // The red LOADING ZONE is the taped strip against the red wall, x -70.6..-59.1 and y 23.9..46.6.
    const scores = scoreAuto(
      planOf({ 1: robot({ alliance: 'red', path: [wp(0, 20), wp(-65, 30, 0, 0, 0)] }) }),
    );
    expect(scores.red.robots[1]).toMatchObject({ left: true, parked: true });
    expect(scores.red.total).toBe(POINTS.leave + POINTS.park);
  });

  it('counts a park when only a corner of the chassis reaches into the zone', () => {
    // Centred an inch past the zone's inside edge, a square robot still overlaps it.
    expect(isParked({ x: -51, y: 35 }, 0, 'red')).toBe(true);
    expect(isParked({ x: -45, y: 35 }, 0, 'red')).toBe(false);
  });

  it('does not park a robot in the other alliance’s zone', () => {
    expect(isParked({ x: 65, y: -30 }, 0, 'red')).toBe(false);
    expect(isParked({ x: 65, y: -30 }, 0, 'blue')).toBe(true);
  });

  it('does not park a robot sitting on a starting pose', () => {
    const pose = startPose('red', 0);
    const scores = scoreAuto(
      planOf({ 1: robot({ alliance: 'red', path: [wp(0, 20), wp(pose.x, pose.y, 0, 0, pose.heading)] }) }),
    );
    expect(scores.red.robots[1]).toMatchObject({ left: true, parked: false });
  });

  it('does not pay for leaving when the robot barely moves', () => {
    const scores = scoreAuto(planOf({ 0: robot({ alliance: 'red', path: [wp(10, 10), wp(10, 10)] }) }));
    expect(scores.red.robots[0]).toMatchObject({ left: false, parked: false, points: 0 });
  });

  it('gives the tip to the alliance that filled the CELL', () => {
    const scores = scoreAuto(
      planOf({
        2: robot({ alliance: 'blue', shotCycle: 0.3, path: [wp(30, -40, 0, FIRST_TIP_BALLS)] }),
      }),
    );
    expect(scores.blue.tips).toBe(1);
    expect(scores.blue.tipPoints).toBe(POINTS.tip);
    expect(scores.red.tips).toBe(0);
  });

  it('lands each point when it is scored, so the board can count up', () => {
    // Four artifacts from the first waypoint tip the CELL at about 1.95 s, the robot clears its
    // first waypoint at about 2.45 s, and it comes to rest in the LOADING ZONE at about 3.8 s.
    const plan = planOf({
      0: robot({ alliance: 'red', speed: 40, shotCycle: 0.5, path: [wp(0, 0, 0, 4), wp(-65, 30, 0, 0, 0)] }),
    });
    const events = scoreEvents(plan);

    expect(events.map((event) => event.regime)).toEqual(['tip', 'leave', 'park']);
    expect(events.map((event) => event.slot)).toEqual([null, 0, 0]);
    expect(events[0]!.time).toBeLessThan(events[1]!.time);
    expect(events[1]!.time).toBeLessThan(events[2]!.time);

    expect(scoreAt(events, 0).red.total).toBe(0);
    expect(scoreAt(events, 2).red).toMatchObject({ leave: 0, park: 0, tips: POINTS.tip, tipCount: 1 });
    expect(scoreAt(events, 3).red).toMatchObject({ leave: POINTS.leave, park: 0 });
    expect(scoreAt(events, 30).red.total).toBe(scoreAuto(plan).red.total);
  });

  it('ends the live score exactly on the final score', () => {
    const plan: AutoPlan = {
      version: 1,
      snap: 1,
      headingSnap: DEFAULT_HEADING_SNAP,
      robots: [
        robot({ alliance: 'red', speed: 40, shotCycle: 0.5, path: [wp(0, -40, 0, 4), wp(-65, 30, 0, 0, 0)] }),
        robot({ alliance: 'red', path: [wp(0, 0), wp(0, 30)] }),
        robot({ alliance: 'blue', shotCycle: 0.3, path: [wp(30, -40, 0, 5), wp(65, -30, 0, 0, 0)] }),
        defaultRobot(3),
      ],
    };
    const final = scoreAt(scoreEvents(plan), Number.POSITIVE_INFINITY);
    const scores = scoreAuto(plan);

    expect(final.red.total).toBe(scores.red.total);
    expect(final.blue.total).toBe(scores.blue.total);
    expect(final.red.leave).toBe(scores.red.leavePoints);
    expect(final.red.park).toBe(scores.red.parkPoints);
    expect(final.blue.tips).toBe(scores.blue.tipPoints);
    expect(final.blue.tipCount).toBe(scores.blue.tips);
  });

  it('never takes points away as the clock runs', () => {
    const plan = planOf({
      0: robot({ alliance: 'red', speed: 40, shotCycle: 0.5, path: [wp(0, 0, 0, 4), wp(-65, 30, 0, 0, 0)] }),
    });
    const events = scoreEvents(plan);
    let previous = 0;
    for (let t = 0; t <= 30; t += 0.25) {
      const total = scoreAt(events, t).red.total;
      expect(total).toBeGreaterThanOrEqual(previous);
      previous = total;
    }
  });

  it('has nothing to show for a plan with no programs', () => {
    const plan = planOf();
    expect(scoreEvents(plan)).toEqual([]);
    expect(scoreAt([], 12).red.total).toBe(0);
  });
});

describe('plan identity', () => {  it('keeps the storage key versioned so an older plan never loads', () => {
    expect(AUTO_PLAN_KEY).toBe('ftcdash.autoPlan.v3');
    expect(AUTO_SECONDS).toBe(30);
  });

  it('rounds to a tenth, which is the resolution of the timetable', () => {
    expect(round1(1.249)).toBe(1.2);
    expect(round1(1.25)).toBe(1.3);
  });
});