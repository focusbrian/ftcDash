import { parseRobotPlan, serializeRobotPlan, type RobotPlan } from './autoplan';

/**
 * The browser's shelf of single-robot autons: what a team keeps instead of a pile of downloaded
 * files. Each entry holds the same auton file the planner used to download, so a saved auton is a
 * program that can be loaded into any column — the slot it was written for only decides the alliance.
 */

export const AUTON_LIBRARY_KEY = 'ftcdash.autons.v1';

/** The shelf is small on purpose: past this the oldest autonomous is dropped. */
export const MAX_SAVED_AUTONS = 24;
export const MAX_AUTON_NAME = 40;

export interface SavedAuton {
  /** What the team called it. Also its identity: saving under the same name overwrites it. */
  name: string;
  /** ISO timestamp of the save, which is how the list orders itself. */
  savedAt: string;
  /** The column it was written for, so the list can say where it came from. */
  slot: number;
  /** An auton file, exactly as `serializeRobotPlan` writes it. */
  text: string;
}

/** Trims and collapses a name so two saves of the same auton cannot look different. */
export function autonName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_AUTON_NAME);
}

/** Names are compared without case, so "left side" replaces "Left side" rather than doubling it. */
function nameKey(raw: string): string {
  return autonName(raw).toLowerCase();
}

function readEntry(raw: unknown): SavedAuton | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as { name?: unknown; savedAt?: unknown; slot?: unknown; text?: unknown };
  if (typeof source.name !== 'string' || typeof source.text !== 'string') return null;
  const name = autonName(source.name);
  if (!name) return null;
  const slot =
    typeof source.slot === 'number' && Number.isInteger(source.slot) && source.slot >= 0 && source.slot <= 3
      ? source.slot
      : 0;
  // A stored auton that no longer reads back is dropped rather than shown as a broken row.
  if (!parseRobotPlan(source.text, slot)) return null;
  return {
    name,
    savedAt: typeof source.savedAt === 'string' ? source.savedAt : '',
    slot,
    text: source.text,
  };
}

/** Newest first, which is the order the shelf is offered in. */
function order(entries: SavedAuton[]): SavedAuton[] {
  return [...entries].sort(
    (a, b) => b.savedAt.localeCompare(a.savedAt) || a.name.localeCompare(b.name),
  );
}

/** Reads a list of stored entries, dropping anything that no longer reads back. */
function readAll(stored: unknown): SavedAuton[] {
  if (!Array.isArray(stored)) return [];
  const byName = new Map<string, SavedAuton>();
  for (const entry of stored) {
    const read = readEntry(entry);
    // Reading newest first means a duplicate name keeps the later save.
    const key = read ? nameKey(read.name) : '';
    if (read && key && !byName.has(key)) byName.set(key, read);
  }
  return order([...byName.values()]).slice(0, MAX_SAVED_AUTONS);
}

function readJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Anything read out of storage goes through here, so a bad entry cannot break the planner. */
export function parseAutonLibrary(raw: string | null): SavedAuton[] {
  const parsed = readJson(raw);
  return readAll(Array.isArray(parsed) ? parsed : (parsed as { autons?: unknown })?.autons);
}

/**
 * Reads the autons bundled inside an exported plan file. A plan saved before bundling existed has
 * none, which is not an error.
 */
export function parseAutonBundle(raw: string | null): SavedAuton[] {
  return readAll((readJson(raw) as { autons?: unknown } | null)?.autons);
}

/** Adds the chosen autons to a plan file, so a shelf can travel to another browser with it. */
export function withAutons(planJson: string, entries: SavedAuton[]): string {
  if (entries.length === 0) return planJson;
  const plan = readJson(planJson);
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return planJson;
  return JSON.stringify({ ...plan, autons: entries }, null, 2);
}

/**
 * Folds autons from an imported file into the shelf: a name already here is kept when it is the
 * newer save, so importing an older export cannot quietly undo newer work.
 */
export function mergeAutons(current: SavedAuton[], incoming: SavedAuton[]): SavedAuton[] {
  const merged = new Map<string, SavedAuton>();
  for (const entry of current) merged.set(nameKey(entry.name), entry);
  for (const entry of incoming) {
    const key = nameKey(entry.name);
    const existing = merged.get(key);
    if (!existing || entry.savedAt >= existing.savedAt) merged.set(key, entry);
  }
  return order([...merged.values()]).slice(0, MAX_SAVED_AUTONS);
}

export function serializeAutonLibrary(entries: SavedAuton[]): string {
  return JSON.stringify({ app: 'ftcdash', kind: 'auton-library', version: 1, autons: entries }, null, 2);
}

/**
 * Puts a robot on the shelf, replacing any auton of the same name, and drops the oldest once the
 * shelf is full. `now` is passed in so the caller (not the clock) decides the timestamp.
 */
export function saveAuton(
  entries: SavedAuton[],
  robot: RobotPlan,
  slot: number,
  rawName: string,
  now: string,
): SavedAuton[] {
  const name = autonName(rawName);
  if (!name) return entries;
  const key = nameKey(name);
  const others = entries.filter((entry) => nameKey(entry.name) !== key);
  return order([
    { name, savedAt: now, slot, text: serializeRobotPlan(robot, slot) },
    ...others,
  ]).slice(0, MAX_SAVED_AUTONS);
}

export function removeAuton(entries: SavedAuton[], name: string): SavedAuton[] {
  const key = nameKey(name);
  return entries.filter((entry) => nameKey(entry.name) !== key);
}

/** The saved auton a name would replace, if the shelf already holds one. */
export function findAuton(entries: SavedAuton[], rawName: string): SavedAuton | null {
  const key = nameKey(rawName);
  if (key.length === 0) return null;
  return entries.find((entry) => nameKey(entry.name) === key) ?? null;
}

/** True when saving under this name would replace something. */
export function autonNameTaken(entries: SavedAuton[], rawName: string): boolean {
  return findAuton(entries, rawName) !== null;
}

/** Reads a shelf entry back as a program for the column it is going into. */
export function loadAuton(entry: SavedAuton, slot: number): RobotPlan | null {
  return parseRobotPlan(entry.text, slot);
}
