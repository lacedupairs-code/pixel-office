import { AgentStatus } from "./jsonlParser";
import { OpenClawAgent } from "./openclawConfig";

export interface AgentSnapshot {
  id: string;
  sessionPath: string | null;
  status: AgentStatus;
  updatedAt: number;
}

export class AgentRegistry {
  private agents = new Map<string, AgentSnapshot>();

  register(agent: OpenClawAgent, sessionPath: string | null): AgentSnapshot {
    const snapshot: AgentSnapshot = {
      id: agent.id,
      sessionPath,
      status: sessionPath ? "idle" : "offline",
      updatedAt: Date.now()
    };

    this.agents.set(agent.id, snapshot);
    return snapshot;
  }

  upsertStatus(agentId: string, status: AgentStatus, sessionPath: string | null): AgentSnapshot {
    const current = this.agents.get(agentId);
    const next: AgentSnapshot = {
      id: agentId,
      sessionPath,
      status,
      updatedAt: Date.now()
    };

    this.agents.set(agentId, { ...current, ...next });
    return this.agents.get(agentId)!;
  }

  getAll(): AgentSnapshot[] {
    return Array.from(this.agents.values()).sort((left, right) => left.id.localeCompare(right.id));
  }
}

