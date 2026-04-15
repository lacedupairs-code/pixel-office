import * as fs from "node:fs/promises";
import * as path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");
const layoutFilePath = path.join(dataDir, "layout.json");

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

export async function readLayoutFile(): Promise<PersistedLayout | null> {
  try {
    const raw = await fs.readFile(layoutFilePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedLayout(parsed)) {
      return null;
    }

    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

export async function writeLayoutFile(layout: PersistedLayout): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(layoutFilePath, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
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
