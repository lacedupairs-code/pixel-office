import * as fs from "node:fs/promises";
import * as path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");
const layoutFilePath = path.join(dataDir, "layout.json");
const slotFilePath = path.join(dataDir, "layout-slots.json");

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
  name?: string;
}

export type PersistedLayoutSlots = Record<string, PersistedLayoutSlotRecord>;

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
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(layoutFilePath, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
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

    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeLayoutSlotsFile(slots: PersistedLayoutSlots): Promise<PersistedLayoutSlots> {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(slotFilePath, `${JSON.stringify(slots, null, 2)}\n`, "utf8");
  return slots;
}

export function isPersistedLayout(value: unknown): value is PersistedLayout {
  if (!value || typeof value !== "object") {
    return false;
  }

  const layout = value as Partial<PersistedLayout>;
  return (
    typeof layout.version === "number" &&
    typeof layout.cols === "number" &&
    typeof layout.rows === "number" &&
    Array.isArray(layout.tiles) &&
    Array.isArray(layout.agents)
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
    (record.name === undefined || typeof record.name === "string")
  );
}

export function isPersistedLayoutSlots(value: unknown): value is PersistedLayoutSlots {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every((entry) => isPersistedLayoutSlotRecord(entry));
}
