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
  warnings: string[];
}

export function getOpenClawDir(): string {
  return path.join(os.homedir(), ".openclaw");
}

export function discoverAgents(): OpenClawDiscovery {
  const openClawDir = getOpenClawDir();
  const configPath = path.join(openClawDir, "openclaw.json");
  const warnings: string[] = [];

  if (!fs.existsSync(openClawDir)) {
    warnings.push(`OpenClaw directory not found at ${openClawDir}.`);
    return { openClawDir, configPath, agents: [], warnings };
  }

  const configured = readAgentsFromConfig(openClawDir, configPath, warnings);

  if (configured.length > 0) {
    return { openClawDir, configPath, agents: configured, warnings };
  }

  const agentsDir = path.join(openClawDir, "agents");
  if (!fs.existsSync(agentsDir)) {
    warnings.push(`Agents directory not found at ${agentsDir}.`);
    return { openClawDir, configPath, agents: [], warnings };
  }

  const agentIds = fs
    .readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const defaultAgentId = agentIds.includes("main") ? "main" : agentIds[0];
  const agents = agentIds.map((id) => ({
    id,
    sessionDir: path.join(agentsDir, id, "sessions"),
    isDefault: id === defaultAgentId
  }));

  if (agents.length === 0) {
    warnings.push(`No OpenClaw agents were discovered under ${agentsDir}.`);
  }

  return { openClawDir, configPath, agents, warnings };
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

function readAgentsFromConfig(openClawDir: string, configPath: string, warnings: string[]): DiscoveredAgent[] {
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
    warnings.push(`Unable to parse ${configPath}; falling back to directory discovery.`);
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
