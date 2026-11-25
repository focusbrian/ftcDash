import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { AssetStore } from './assets';
import {
  BALL_FLIGHT_SECONDS,
  FLOWERS,
  FIELD_SIZE,
  GARDEN,
  HALF_FIELD,
  HIVE_FRAME,
  LOADING,
  ROBOT_SIZE,
  TILE,
  buildSchedule,
  cellAim,
  cellsAt,
  drivenPath,
  flowerBox,
  hiveCellOnSide,
  initialRaisedSide,
  launches,
  scheduleAt,
  simulateCells,
  startPose,
  type Alliance,
  type AutoPlan,
  type CellSide,
  type Rect,
  type RobotPlan,
} from './autoplan';

/**
 * The 3D playback of a plan. Everything is drawn in inches, the unit the model already uses: X is
 * across the field towards blue, Z is towards the audience (so the map's +y, which points at the rear
 * wall, becomes -Z), and Y is up.
 */

const WALL_HEIGHT = 12.7;
const WALL_THICKNESS = 2;
/** How far outside the field's inner face a CAD part may sit before it is treated as off-field. */
const WALL_CLEARANCE = 4;
/** The HIVE pivot sits at 44 in., which is where the two CELLs hang. */
const HIVE_PIVOT = 44;
/** A tipped CELL swings 60° about the pivot bar, the way the CAD's own rig does. */
const HIVE_TILT = -Math.PI / 3;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const ALLIANCES: Alliance[] = ['red', 'blue'];
const FLOWER_HEIGHT = 21.5;

const ALLIANCE_COLOR: Record<Alliance, number> = { red: 0xdf5f6b, blue: 0x5d93d4 };
const ALLIANCE_DARK: Record<Alliance, number> = { red: 0x7d2b34, blue: 0x2c4f7d };

/** A planner point in scene space. */
function to3(x: number, y: number, height = 0): THREE.Vector3 {
  return new THREE.Vector3(x, height, -y);
}

/** A planner rectangle as the centre and size of a flat patch on the floor. */
function rectCentreSize(box: Rect): { cx: number; cz: number; width: number; depth: number } {
  return {
    cx: box.x + box.width / 2,
    cz: -(box.y + box.height / 2),
    width: box.width,
    depth: box.height,
  };
}

function standard(color: number, roughness = 0.72, metalness = 0.05): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

/** A flat tinted patch just above the mat, for a zone. */
function patch(box: Rect, color: number, opacity: number): THREE.Mesh {
  const { cx, cz, width, depth } = rectCentreSize(box);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(width, 0.5), Math.max(depth, 0.5)),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(cx, 0.12, cz);
  return mesh;
}

/** The outline of a rectangle on the floor. */
function outline(box: Rect, color: number, opacity = 0.75): THREE.LineLoop {
  const corners = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height],
  ].map(([x, y]) => to3(x!, y!, 0.2));
  const geometry = new THREE.BufferGeometry().setFromPoints(corners);
  return new THREE.LineLoop(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

/** The floor, walls, FLOWERS and HIVE, as a stand-in until the CAD field model loads. */
function buildFieldScenery(): THREE.Group {
  const group = new THREE.Group();

  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD_SIZE, FIELD_SIZE),
    standard(0x24302b, 0.96),
  );
  mat.rotation.x = -Math.PI / 2;
  mat.receiveShadow = true;
  group.add(mat);

  const grid = new THREE.GridHelper(
    FIELD_SIZE,
    Math.round(FIELD_SIZE / TILE),
    0x3c4d44,
    0x2a3630,
  );
  grid.position.y = 0.06;
  group.add(grid);

  // Perimeter walls, thick enough to read as walls at this scale.
  const wallColor = 0x39463f;
  const long = FIELD_SIZE + WALL_THICKNESS * 2;
  const walls: [number, number, number, number, number, number][] = [
    [long, WALL_HEIGHT, WALL_THICKNESS, 0, WALL_HEIGHT / 2, -(HALF_FIELD + WALL_THICKNESS / 2)],
    [long, WALL_HEIGHT, WALL_THICKNESS, 0, WALL_HEIGHT / 2, HALF_FIELD + WALL_THICKNESS / 2],
    [WALL_THICKNESS, WALL_HEIGHT, long, -(HALF_FIELD + WALL_THICKNESS / 2), WALL_HEIGHT / 2, 0],
    [WALL_THICKNESS, WALL_HEIGHT, long, HALF_FIELD + WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0],
  ];
  for (const [w, h, d, x, y, z] of walls) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), standard(wallColor, 0.85));
    wall.position.set(x, y, z);
    wall.receiveShadow = true;
    group.add(wall);
  }

  // The four FLOWERS stand against the walls.
  for (const flower of FLOWERS) {
    const box = flowerBox(flower);
    const { cx, cz, width, depth } = rectCentreSize(box);
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(width, FLOWER_HEIGHT, depth),
      standard(0x50695c, 0.8),
    );
    post.position.set(cx, FLOWER_HEIGHT / 2, cz);
    post.castShadow = true;
    group.add(post);
  }

  // The shared HIVE frame: four legs and an open box, so the field behind it stays readable.
  const hive = rectCentreSize(HIVE_FRAME);
  const frameOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(hive.width, HIVE_PIVOT, hive.depth)),
    new THREE.LineBasicMaterial({ color: 0x6d8a7a, transparent: true, opacity: 0.85 }),
  );
  frameOutline.position.set(hive.cx, HIVE_PIVOT / 2, hive.cz);
  group.add(frameOutline);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, HIVE_PIVOT, 1.8),
        standard(0x3c4b43, 0.7, 0.2),
      );
      leg.position.set(
        hive.cx + sx * (hive.width / 2 - 0.9),
        HIVE_PIVOT / 2,
        hive.cz + sz * (hive.depth / 2 - 0.9),
      );
      leg.castShadow = true;
      group.add(leg);
    }
  }

  for (const alliance of ['red', 'blue'] as const) {
    for (const side of ['rear', 'audience'] as const) {
      const cell = rectCentreSize(hiveCellOnSide(alliance, side));
      const raised = initialRaisedSide(alliance) === side;
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(cell.width, 1.4, cell.depth),
        new THREE.MeshStandardMaterial({
          color: ALLIANCE_COLOR[alliance],
          roughness: 0.55,
          transparent: true,
          opacity: raised ? 0.95 : 0.35,
        }),
      );
      plate.position.set(cell.cx, HIVE_PIVOT - 2, cell.cz);
      // The raised CELL leans up, the lowered one hangs down: the tip is the whole game.
      plate.rotation.x = (raised ? -1 : 1) * 0.22;
      group.add(plate);
    }
  }

  return group;
}

/**
 * The parts of the picture that come from the plan rather than the field: the LOADING ZONEs a robot
 * parks in, the GARDENs and the starting squares. These sit over the CAD model as well.
 */
function buildPlanOverlays(): THREE.Group {
  const group = new THREE.Group();

  for (const alliance of ['red', 'blue'] as const) {
    group.add(patch(LOADING[alliance], ALLIANCE_COLOR[alliance], 0.16));
    group.add(patch(GARDEN[alliance], 0x4ade80, 0.12));
    group.add(outline(LOADING[alliance], ALLIANCE_COLOR[alliance], 0.6));
    group.add(outline(GARDEN[alliance], 0x4ade80, 0.4));
  }

  for (const alliance of ['red', 'blue'] as const) {
    for (const slot of [0, 1]) {
      const pose = startPose(alliance, slot);
      group.add(
        outline(
          {
            x: pose.x - ROBOT_SIZE / 2,
            y: pose.y - ROBOT_SIZE / 2,
            width: ROBOT_SIZE,
            height: ROBOT_SIZE,
          },
          ALLIANCE_COLOR[alliance],
          0.5,
        ),
      );
    }
  }

  return group;
}

/** A boxy 18 in. mecanum robot, tinted for its alliance so the two sides read apart. */
function buildRobotBody(alliance: Alliance): THREE.Group {
  const group = new THREE.Group();
  const main = standard(ALLIANCE_COLOR[alliance], 0.5, 0.15);
  const dark = standard(ALLIANCE_DARK[alliance], 0.6, 0.1);
  const rubber = standard(0x161a18, 0.95);
  const metal = standard(0x9aa7a0, 0.45, 0.35);

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(16.4, 5, 16.8), main);
  chassis.position.y = 6.4;
  group.add(chassis);

  // A dark skirt under the plate reads as the frame the wheels hang off.
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(15.6, 1.6, 16), dark);
  skirt.position.y = 3.8;
  group.add(skirt);

  for (const along of [-1, 1]) {
    for (const across of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 2.6, 18), rubber);
      // The axle runs across the robot, so the cylinder's own Y axis becomes Z.
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(along * 6, 2.3, across * 8.2);
      group.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.8, 12), metal);
      hub.rotation.x = Math.PI / 2;
      hub.position.set(along * 6, 2.3, across * 8.2);
      group.add(hub);
    }
  }

  // The intake lip at the front (+X is the way the robot faces at heading 0).
  const intake = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 14), metal);
  intake.position.set(9.2, 2.6, 0);
  group.add(intake);

  // The launcher tower at the back, with its barrel angled at the raised CELL.
  const tower = new THREE.Mesh(new THREE.BoxGeometry(9, 7, 6), dark);
  tower.position.set(-4.4, 12.2, 0);
  group.add(tower);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 8, 14), metal);
  barrel.rotation.z = -Math.PI / 3;
  barrel.position.set(-1.2, 15.4, 0);
  group.add(barrel);

  // A painted nose stripe, so the facing is obvious from any camera angle.
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 10), standard(0xf4f7f4, 0.6));
  nose.position.set(7.6, 7.6, 0);
  group.add(nose);

  return group;
}

/** The disc that floats over a robot: the team's logo if it has one, else its initial or number. */
function badgeSprite(
  label: string,
  logo: string | undefined,
  alliance: Alliance,
  onReady: () => void,
): THREE.Sprite {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const ring = `#${ALLIANCE_COLOR[alliance].toString(16).padStart(6, '0')}`;

  const paint = (image?: HTMLImageElement) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(12, 16, 14, 0.92)';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
    ctx.fill();
    if (image) {
      // Clip the logo to the disc so a wide logo cannot spill outside it.
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
      ctx.clip();
      const scale = Math.min((size - 16) / image.width, (size - 16) / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
      ctx.restore();
    } else {
      ctx.fillStyle = '#eef4ee';
      ctx.font = `600 ${Math.round(size * 0.46)}px 'Inter', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.slice(0, 2), size / 2, size / 2 + 2);
    }
    ctx.strokeStyle = ring;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
  };

  paint();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  if (logo) {
    const image = new Image();
    image.onload = () => {
      paint(image);
      texture.needsUpdate = true;
      onReady();
    };
    image.src = logo;
  }

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  sprite.scale.set(14, 14, 1);
  sprite.position.y = 26;
  sprite.renderOrder = 10;
  return sprite;
}

function pathLine(points: THREE.Vector3[], color: number, opacity: number): THREE.Line {
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.length > 1 ? points : [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)],
  );
  return new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}

function trailLine(maxPoints: number, color: number): THREE.Line {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(Math.max(maxPoints, 2) * 3), 3),
  );
  geometry.setDrawRange(0, 0);
  return new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }),
  );
}

interface RobotView {
  group: THREE.Group;
  body: THREE.Group;
  badge: THREE.Sprite;
  trail: THREE.Line;
  plan: RobotPlan;
  /** The robot's timetable, and every artifact it launches, kept so playback can fly the balls. */
  schedule: ReturnType<typeof buildSchedule>;
  launches: ReturnType<typeof launches>;
  /** Which CELL each of its artifacts lands in, keyed `${step}-${ball}`. */
  sides: Map<string, CellSide>;
}

/** Where the field CAD lives. Vite copies `public/` as-is, so this works under any base path. */
const FIELD_MODEL_URL = `${import.meta.env.BASE_URL}models/auton-field.glb`;

/** Frees the GPU buffers a group of meshes and lines holds. */
function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    if (
      child instanceof THREE.Mesh ||
      child instanceof THREE.Line ||
      child instanceof THREE.LineSegments
    ) {
      child.geometry?.dispose();
      const material = child.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material?.dispose();
    }
  });
}

/** The CAD field, with the two hive pivots the tipping animation turns. */
interface CadField {
  root: THREE.Object3D;
  pivots: Partial<Record<Alliance, THREE.Object3D>>;
}

/**
 * The BIOBUZZ field CAD, exported from the team's Robot Lab as a meshopt-compressed GLB. It is built
 * in metres with the field centred on the origin, so the only change needed is the unit: inches.
 */
async function loadCadField(): Promise<CadField> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(FIELD_MODEL_URL);
  const model = gltf.scene;
  model.scale.setScalar(1 / 0.0254);

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    // The CAD is a million triangles; let it catch shadows but never cast them.
    child.castShadow = false;
    child.receiveShadow = true;
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (!material) continue;
      if (material.transparent && material.opacity < 1) {
        // The "clear walls" export keeps the walls faint; a level, unlit-ish look reads best.
        material.depthWrite = false;
        material.roughness = 0.2;
        material.metalness = 0;
        child.renderOrder = 2;
      } else {
        material.roughness = 0.78;
        material.metalness = 0.08;
      }
    }
  });

  // The export keeps the alliance-station markings that sit outside the walls; clip the CAD to the
  // field so the view starts at the field edge.
  const limit = HALF_FIELD + WALL_CLEARANCE;
  const planes = [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), limit),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), limit),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), limit),
    new THREE.Plane(new THREE.Vector3(0, 0, 1), limit),
  ];
  const clipped = new Set<THREE.Material>();
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments)) {
      return;
    }
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (!material || clipped.has(material)) continue;
      clipped.add(material);
      material.clippingPlanes = planes;
      material.clipShadows = false;
      material.needsUpdate = true;
    }
  });

  // The export rigs only the blue hive: the red cell is baked into the static meshes. Rebuild it as a
  // half-turn copy of the blue assembly (which is how the two hives are laid out) and hide the baked
  // red cell parts it stands in for.
  const pivots: Partial<Record<Alliance, THREE.Object3D>> = {};
  const bluePivot = model.getObjectByName('BlueHivePivot');
  if (bluePivot?.parent) {
    pivots.blue = bluePivot;

    // Parts of the static field that only draw the red CELL: it swings with the pivot instead.
    model.updateMatrixWorld(true);
    const hive = new THREE.Box3(new THREE.Vector3(-26, 26, -32), new THREE.Vector3(-1, 70, 32));
    const baked = new THREE.Box3();
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.name === 'StaticField_ff0000') {
        child.visible = false;
        return;
      }
      child.geometry.computeBoundingBox();
      baked.copy(child.geometry.boundingBox!).applyMatrix4(child.matrixWorld);
      if (hive.containsBox(baked)) child.visible = false;
    });

    const reused = new Map<THREE.Material, THREE.Material>();
    const redPivot = bluePivot.clone(true);
    redPivot.name = 'RedHivePivot';
    redPivot.position.set(-bluePivot.position.x, bluePivot.position.y, -bluePivot.position.z);
    redPivot.rotation.set(0, Math.PI, 0);
    redPivot.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const swap = (material: THREE.Material) => {
        let copy = reused.get(material);
        if (!copy) {
          copy = material.clone();
          const hsl = { h: 0, s: 0, l: 0 };
          const colour = (copy as { color?: THREE.Color }).color;
          // Everything blue in the moving assembly is the CELL: give it the red alliance's paint.
          if (colour && 'getHSL' in colour) {
            colour.getHSL(hsl);
            if (hsl.s > 0.3 && hsl.h > 0.5 && hsl.h < 0.78) colour.setHSL(0.985, hsl.s, hsl.l);
          }
          reused.set(material, copy);
        }
        return copy;
      };
      child.material = Array.isArray(child.material)
        ? child.material.map(swap)
        : swap(child.material);
    });
    redPivot.visible = true;
    bluePivot.parent.add(redPivot);    pivots.red = redPivot;
  }

  return { root: model, pivots };
}

export interface AutoplanScene {
  setPlan(plan: AutoPlan, assets: AssetStore, teamNames: (string | null | undefined)[]): void;
  setTime(seconds: number): void;
  setView(view: 'field' | 'top'): void;
  dispose(): void;
}

export interface AutoplanSceneOptions {
  container: HTMLElement;
  plan: AutoPlan;
  assets: AssetStore;
  teamNames: (string | null | undefined)[];
}
/** The letter or number shown on a robot with no logo. */
function badgeLabel(robot: RobotPlan, name: string | null | undefined): string {
  const trimmed = name?.trim() ?? '';
  if (trimmed.length > 0) return trimmed[0]!.toUpperCase();
  if (robot.teamNumber !== null) return String(robot.teamNumber).slice(0, 2);
  return '?';
}

export async function createAutoplanScene(options: AutoplanSceneOptions): Promise<AutoplanScene> {
  const { container } = options;
  const alignments = new THREE.Group();

  const scene = new THREE.Scene();
  scene.add(alignments);
  scene.add(new THREE.HemisphereLight(0xe8f4ec, 0x5d7264, 1.4));
  const key = new THREE.DirectionalLight(0xffe9d7, 3);
  key.position.set(90, 220, 140);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -110;
  key.shadow.camera.right = 110;
  key.shadow.camera.top = 110;
  key.shadow.camera.bottom = -110;
  key.shadow.camera.near = 40;
  key.shadow.camera.far = 480;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xb0c9ff, 0.9);
  fill.position.set(-140, 120, -110);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(42, 1, 1, 6000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  // A soft contact shadow is what makes the robots look like they are standing on the field.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // The field CAD is clipped to the field box, so its off-field markings never reach the camera.
  renderer.localClippingEnabled = true;
  container.append(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 40;
  controls.maxDistance = 700;
  controls.maxPolarAngle = Math.PI * 0.49;

  // The stand-in field draws straight away; the CAD model replaces it once it has downloaded.
  let field: THREE.Object3D = buildFieldScenery();
  scene.add(field);
  const overlayGroup = buildPlanOverlays();
  scene.add(overlayGroup);

  // Hive pivots, once the CAD arrives: the tipping animation turns them about the frame's top bar.
  const pivots: Partial<Record<Alliance, THREE.Object3D>> = {};
  const pivotBase: Partial<Record<Alliance, THREE.Quaternion>> = {};
  const hiveBlend: Record<Alliance, number> = { red: 0, blue: 0 };
  const hiveTarget: Record<Alliance, number> = { red: 0, blue: 0 };
  // Artifacts in flight: one small pollen-coloured sphere per shot, reused from a pool.
  const BALL_RADIUS = 1.4;
  /** The shooter sits above the chassis, and artifacts land in the mouth of the raised CELL. */
  const LAUNCH_HEIGHT = 18;
  const CELL_MOUTH = HIVE_PIVOT + 8;
  const ARC_HEIGHT = 24;
  const ballGeometry = new THREE.SphereGeometry(BALL_RADIUS, 14, 10);
  const ballMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd75e,
    roughness: 0.55,
    metalness: 0.05,
  });
  const ballPool: THREE.Mesh[] = [];
  const ballFrom = new THREE.Vector3();
  const ballTo = new THREE.Vector3();
  const ballFor = (index: number) => {
    let mesh = ballPool[index];
    if (!mesh) {
      mesh = new THREE.Mesh(ballGeometry, ballMaterial);
      mesh.castShadow = true;
      scene.add(mesh);
      ballPool[index] = mesh;
    }
    return mesh;
  };

  let cells = simulateCells(options.plan);

  let robots: RobotView[] = [];
  let pathLines: THREE.Line[] = [];
  let frame = 0;
  let disposed = false;
  let lastFrame = 0;
  let currentTime = 0;
  const tilt = new THREE.Quaternion();

  const viewTo = (view: 'field' | 'top') => {
    if (view === 'top') {
      controls.target.set(0, 0, 0);
      camera.position.set(0, 250, 0.01);
    } else {
      // A three-quarter look from the audience side, close enough that the field fills the stage.
      controls.target.set(0, 6, -8);
      camera.position.set(70, 116, 162);
    }
    controls.update();
  };

  const clearRobots = () => {
    for (const view of robots) {
      view.group.removeFromParent();
      view.group.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          child.geometry.dispose();
          const material = child.material;
          if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
          else material.dispose();
        }
      });
      if (view.badge.material.map) view.badge.material.map.dispose();
      view.badge.material.dispose();
    }
    for (const line of pathLines) {
      line.removeFromParent();
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    robots = [];
    pathLines = [];
  };

  const setPlan = (
    plan: AutoPlan,
    assets: AssetStore,
    teamNames: (string | null | undefined)[],
  ) => {
    clearRobots();
    cells = simulateCells(plan);

    plan.robots.forEach((robot, slot) => {
      const group = new THREE.Group();
      const body = buildRobotBody(robot.alliance);
      body.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      group.add(body);
      const logo = robot.teamNumber === null ? undefined : assets[String(robot.teamNumber)]?.logo;
      const badge = badgeSprite(badgeLabel(robot, teamNames[slot]), logo, robot.alliance, () => {
        renderer.render(scene, camera);
      });
      group.add(badge);
      alignments.add(group);
      const planned = robot.path.map((point) => to3(point.x, point.y, 1));
      const line = pathLine(planned, ALLIANCE_COLOR[robot.alliance], 0.6);
      alignments.add(line);
      pathLines.push(line);

      const trail = trailLine(robot.path.length + 2, 0xff8d47);
      alignments.add(trail);

      const sides = new Map<string, CellSide>();
      for (const tick of cells[robot.alliance].ticks) {
        if (tick.robot === slot) sides.set(`${tick.step}-${tick.ball}`, tick.side);
      }
      const schedule = buildSchedule(robot);
      robots.push({
        group,
        body,
        badge,
        trail,
        plan: robot,
        schedule,
        launches: launches(schedule, robot.shotCycle),
        sides,
      });
    });
  };

  const setTime = (seconds: number) => {
    currentTime = seconds;
    for (const view of robots) {
      const sample = scheduleAt(view.schedule, seconds);
      if (!sample) {
        view.group.visible = false;
        continue;
      }
      view.group.visible = true;
      view.group.position.set(sample.pos.x, 0, -sample.pos.y);
      // A planner heading turns +x towards +y, which is -z here: the same sign as three's Y rotation.
      view.group.rotation.y = sample.heading;

      const trail = drivenPath(view.schedule, seconds);
      const attribute = view.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
      const usable = Math.min(trail.length, attribute.count);
      for (let i = 0; i < usable; i += 1) {
        const point = trail[i]!;
        attribute.setXYZ(i, point.x, 2.6, -point.y);
      }
      attribute.needsUpdate = true;
      view.trail.geometry.setDrawRange(0, usable);
      view.trail.visible = usable > 1;
    }

    for (const alliance of ALLIANCES) {
      const at = cellsAt(cells[alliance], seconds);
      hiveTarget[alliance] = at.raised === initialRaisedSide(alliance) ? 0 : 1;
    }

    let used = 0;
    for (const view of robots) {
      const alliance = view.plan.alliance;
      for (const launch of view.launches) {
        const progress = (seconds - launch.time) / BALL_FLIGHT_SECONDS;
        if (progress < 0 || progress > 1) continue;
        const side = view.sides.get(`${launch.step}-${launch.ball}`) ?? initialRaisedSide(alliance);
        const aim = cellAim(alliance, side);
        const ball = ballFor(used);
        ballFrom.set(launch.from.x, LAUNCH_HEIGHT, -launch.from.y);
        ballTo.set(aim.x, CELL_MOUTH, -aim.y);
        ball.position.lerpVectors(ballFrom, ballTo, progress);
        ball.position.y += ARC_HEIGHT * Math.sin(Math.PI * progress);
        ball.visible = true;
        used += 1;
      }
    }
    for (let i = used; i < ballPool.length; i += 1) ballPool[i]!.visible = false;
  };

  const resize = () => {
    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  viewTo('field');
  setPlan(options.plan, options.assets, options.teamNames);
  setTime(0);

  const loop = () => {
    if (disposed) return;
    const now = performance.now();
    // A first frame has no previous timestamp, and a backgrounded tab jumps: clamp the step.
    const delta = lastFrame === 0 ? 0 : Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;

    for (const alliance of ALLIANCES) {
      const pivot = pivots[alliance];
      const base = pivotBase[alliance];
      if (!pivot || !base) continue;
      // The CELL swings down in about a third of a second rather than snapping.
      hiveBlend[alliance] += (hiveTarget[alliance] - hiveBlend[alliance]) * Math.min(1, delta * 8);
      tilt.setFromAxisAngle(X_AXIS, HIVE_TILT * hiveBlend[alliance]);
      pivot.quaternion.copy(base).multiply(tilt);
    }

    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);

  // Swap in the field CAD once it arrives; if it cannot load, the stand-in field stays.
  const cad = await loadCadField().catch(() => null);
  if (cad && !disposed) {
    scene.remove(field);
    disposeObject(field);
    field = cad.root;
    scene.add(field);
    for (const alliance of ALLIANCES) {
      const pivot = cad.pivots[alliance];
      if (!pivot) continue;
      pivots[alliance] = pivot;
      pivotBase[alliance] = pivot.quaternion.clone();
    }
    setTime(currentTime);
  }

  return {
    setPlan,
    setTime,
    setView: viewTo,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      clearRobots();
      for (const ball of ballPool) ball.removeFromParent();
      ballGeometry.dispose();
      ballMaterial.dispose();
      disposeObject(field);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
