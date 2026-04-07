import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface OpenClawAgent {
  id: string;
  sessionDir: string;
}

export interface OpenClawConfig {
  baseDir: string;
  configPath: string;
  agents: OpenClawAgent[];
}

export function getOpenClawDir(overrideDir?: string): string {
  return overrideDir ?? path.join(os.homedir(), ".openclaw");
}

export function discoverAgents(overrideDir?: string): OpenClawConfig {
  const baseDir = getOpenClawDir(overrideDir);
  const configPath = path.join(baseDir, "openclaw.json");
  const agentsDir = path.join(baseDir, "agents");

  if (!fs.existsSync(agentsDir)) {
    return { baseDir, configPath, agents: [] };
  }

  const directoryAgentIds = fs
    .readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const configuredAgentIds = readAgentIdsFromConfig(configPath);
  const agentIds = configuredAgentIds.length > 0 ? mergeUnique(configuredAgentIds, directoryAgentIds) : directoryAgentIds;

  return {
    baseDir,
    configPath,
    agents: agentIds.map((id) => ({
      id,
      sessionDir: path.join(agentsDir, id, "sessions")
    }))
  };
}

export function getActiveSessionPath(agent: OpenClawAgent): string | null {
  if (!fs.existsSync(agent.sessionDir)) {
    return null;
  }

  const newestFile = fs
    .readdirSync(agent.sessionDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => {
      const filePath = path.join(agent.sessionDir, entry.name);
      return {
        filePath,
        mtimeMs: fs.statSync(filePath).mtimeMs
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0];

  return newestFile?.filePath ?? null;
}

function readAgentIdsFromConfig(configPath: string): string[] {
  if (!fs.existsSync(configPath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      agents?: Record<string, unknown> | string[];
    };

    if (Array.isArray(parsed.agents)) {
      return parsed.agents.filter((value): value is string => typeof value === "string");
    }

    if (parsed.agents && typeof parsed.agents === "object") {
      return Object.keys(parsed.agents);
    }
  } catch {
    return [];
  }

  return [];
}

function mergeUnique(primary: string[], secondary: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const id of [...primary, ...secondary]) {
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    merged.push(id);
  }

  return merged;
}

