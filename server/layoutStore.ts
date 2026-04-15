import * as fs from "node:fs/promises";
import * as path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");
const layoutFilePath = path.join(dataDir, "layout.json");
const slotFilePath = path.join(dataDir, "layout-slots.json");
const slotMetaFilePath = path.join(dataDir, "layout-slots-meta.json");
const VALID_TILE_TYPES = new Set(["floor", "wall", "desk", "coffee", "couch"]);

export interface PersistedLayout {
  version: number;
  cols: number;
  rows: number;
  tiles: Array<{
    x: number;
    y: number;
    type: string;
  }>;
  agents: Array<{
    agentId: string;
    deskX: number;
    deskY: number;
  }>;
}

export interface PersistedLayoutRecord {
  layout: PersistedLayout;
  updatedAt: string;
}

export interface LayoutSaveRequest {
  layout: PersistedLayout;
  expectedUpdatedAt?: string | null;
  force?: boolean;
}

export interface PersistedLayoutSlotRecord {
  layout: PersistedLayout;
  savedAt: string;
  updatedAt: string;
  name?: string;
  description?: string;
  tags?: string[];
}

export type PersistedLayoutSlots = Record<string, PersistedLayoutSlotRecord>;
export interface LayoutSlotSaveRequest {
  record: PersistedLayoutSlotRecord;
  expectedUpdatedAt?: string | null;
  force?: boolean;
}

export interface PersistedLayoutSlotMeta {
  activeSlotId?: string;
}

export async function readLayoutFile(): Promise<PersistedLayoutRecord | null> {
  try {
    const [raw, stat] = await Promise.all([fs.readFile(layoutFilePath, "utf8"), fs.stat(layoutFilePath)]);
    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedLayout(parsed)) {
      return null;
    }

    return {
      layout: parsed,
      updatedAt: stat.mtime.toISOString()
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function writeLayoutFile(layout: PersistedLayout): Promise<PersistedLayoutRecord> {
  await writeJsonFileAtomic(layoutFilePath, layout);
  const stat = await fs.stat(layoutFilePath);
  return {
    layout,
    updatedAt: stat.mtime.toISOString()
  };
}

export async function readLayoutSlotsFile(): Promise<PersistedLayoutSlots> {
  try {
    const raw = await fs.readFile(slotFilePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedLayoutSlots(parsed)) {
      return {};
    }

    return normalizeLayoutSlots(parsed);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeLayoutSlotsFile(slots: PersistedLayoutSlots): Promise<PersistedLayoutSlots> {
  await writeJsonFileAtomic(slotFilePath, slots);
  return normalizeLayoutSlots(slots);
}

export async function readLayoutSlotMetaFile(): Promise<PersistedLayoutSlotMeta> {
  try {
    const raw = await fs.readFile(slotMetaFilePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedLayoutSlotMeta(parsed)) {
      return {};
    }

    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeLayoutSlotMetaFile(meta: PersistedLayoutSlotMeta): Promise<PersistedLayoutSlotMeta> {
  await writeJsonFileAtomic(slotMetaFilePath, meta);
  return meta;
}

export function isPersistedLayout(value: unknown): value is PersistedLayout {
  if (!value || typeof value !== "object") {
    return false;
  }

  const layout = value as Partial<PersistedLayout>;
  return (
    isNonNegativeInteger(layout.version) &&
    isPositiveInteger(layout.cols) &&
    isPositiveInteger(layout.rows) &&
    Array.isArray(layout.tiles) &&
    layout.tiles.every((tile) => isPersistedLayoutTile(tile)) &&
    Array.isArray(layout.agents) &&
    layout.agents.every((agent) => isPersistedLayoutAgentSeat(agent))
  );
}

export function isLayoutSaveRequest(value: unknown): value is LayoutSaveRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as Partial<LayoutSaveRequest>;
  return (
    isPersistedLayout(request.layout) &&
    (request.expectedUpdatedAt === undefined ||
      request.expectedUpdatedAt === null ||
      typeof request.expectedUpdatedAt === "string") &&
    (request.force === undefined || typeof request.force === "boolean")
  );
}

export function isPersistedLayoutSlotRecord(value: unknown): value is PersistedLayoutSlotRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<PersistedLayoutSlotRecord>;
  return (
    isPersistedLayout(record.layout) &&
    typeof record.savedAt === "string" &&
    typeof record.updatedAt === "string" &&
    (record.name === undefined || typeof record.name === "string") &&
    (record.description === undefined || typeof record.description === "string") &&
    (record.tags === undefined || (Array.isArray(record.tags) && record.tags.every((tag) => typeof tag === "string")))
  );
}

export function isPersistedLayoutSlots(value: unknown): value is PersistedLayoutSlots {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every((entry) => isPersistedLayoutSlotRecord(entry));
}

export function isLayoutSlotSaveRequest(value: unknown): value is LayoutSlotSaveRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as Partial<LayoutSlotSaveRequest>;
  return (
    isPersistedLayoutSlotRecord(request.record) &&
    (request.expectedUpdatedAt === undefined ||
      request.expectedUpdatedAt === null ||
      typeof request.expectedUpdatedAt === "string") &&
    (request.force === undefined || typeof request.force === "boolean")
  );
}

export function isPersistedLayoutSlotMeta(value: unknown): value is PersistedLayoutSlotMeta {
  if (!value || typeof value !== "object") {
    return false;
  }

  const meta = value as Partial<PersistedLayoutSlotMeta>;
  return meta.activeSlotId === undefined || typeof meta.activeSlotId === "string";
}

function normalizeLayoutSlots(slots: Record<string, PersistedLayoutSlotRecord | Omit<PersistedLayoutSlotRecord, "updatedAt">>) {
  return Object.fromEntries(
    Object.entries(slots).map(([slotId, record]) => [
      slotId,
      {
        ...record,
        updatedAt: "updatedAt" in record && typeof record.updatedAt === "string" ? record.updatedAt : record.savedAt,
        tags: Array.isArray(record.tags) ? record.tags.filter((tag) => typeof tag === "string") : undefined
      }
    ])
  ) as PersistedLayoutSlots;
}

function isPersistedLayoutTile(
  value: unknown
): value is {
  x: number;
  y: number;
  type: string;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const tile = value as Partial<PersistedLayout["tiles"][number]>;
  return (
    isNonNegativeInteger(tile.x) &&
    isNonNegativeInteger(tile.y) &&
    typeof tile.type === "string" &&
    VALID_TILE_TYPES.has(tile.type)
  );
}

function isPersistedLayoutAgentSeat(
  value: unknown
): value is {
  agentId: string;
  deskX: number;
  deskY: number;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const seat = value as Partial<PersistedLayout["agents"][number]>;
  return (
    typeof seat.agentId === "string" &&
    seat.agentId.trim().length > 0 &&
    isNonNegativeInteger(seat.deskX) &&
    isNonNegativeInteger(seat.deskY)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}
