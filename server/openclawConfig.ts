import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import JSON5 from "json5";

export interface DiscoveredAgent {
  id: string;
  sessionDir: string;
  isDefault: boolean;
}

export interface OpenClawDiscovery {
  openClawDir: string;
  configPath: string;
  agents: DiscoveredAgent[];
}

export function getOpenClawDir(): string {
  return path.join(os.homedir(), ".openclaw");
}

export function discoverAgents(): OpenClawDiscovery {
  const openClawDir = getOpenClawDir();
  const configPath = path.join(openClawDir, "openclaw.json");
  const configured = readAgentsFromConfig(openClawDir, configPath);

  if (configured.length > 0) {
    return { openClawDir, configPath, agents: configured };
  }

  const agentsDir = path.join(openClawDir, "agents");
  if (!fs.existsSync(agentsDir)) {
    return { openClawDir, configPath, agents: [] };
  }

  const agents = fs
    .readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry, index) => ({
      id: entry.name,
      sessionDir: path.join(agentsDir, entry.name, "sessions"),
      isDefault: index === 0
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return { openClawDir, configPath, agents };
}

export function getActiveSessionPath(sessionDir: string): string | null {
  if (!fs.existsSync(sessionDir)) {
    return null;
  }

  const latest = fs
    .readdirSync(sessionDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => {
      const filePath = path.join(sessionDir, entry.name);
      return {
        filePath,
        mtimeMs: safeStat(filePath)?.mtimeMs ?? 0
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0];

  return latest?.filePath ?? null;
}

function readAgentsFromConfig(openClawDir: string, configPath: string): DiscoveredAgent[] {
  if (!fs.existsSync(configPath)) {
    return [];
  }

  try {
    const parsed = JSON5.parse(fs.readFileSync(configPath, "utf8")) as {
      agents?: {
        list?: Array<{
          id?: string;
          default?: boolean;
        }>;
      };
    };

    const list = parsed.agents?.list;
    if (!Array.isArray(list)) {
      return [];
    }

    return list
      .filter((agent): agent is { id: string; default?: boolean } => typeof agent?.id === "string" && agent.id.length > 0)
      .map((agent) => ({
        id: agent.id,
        sessionDir: path.join(openClawDir, "agents", agent.id, "sessions"),
        isDefault: Boolean(agent.default)
      }));
  } catch {
    return [];
  }
}

function safeStat(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

