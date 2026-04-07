import { AgentState } from "./parser";

export interface AgentSnapshot {
  id: string;
  state: AgentState;
  taskHint?: string;
  isDefault: boolean;
  sessionPath: string | null;
  updatedAt: number;
}

export class AgentRegistry {
  private agents = new Map<string, AgentSnapshot>();

  seed(agentId: string, isDefault: boolean): AgentSnapshot {
    const snapshot: AgentSnapshot = {
      id: agentId,
      state: "offline",
      isDefault,
      sessionPath: null,
      updatedAt: Date.now()
    };

    this.agents.set(agentId, snapshot);
    return snapshot;
  }

  update(agentId: string, state: AgentState, sessionPath: string | null, isDefault: boolean, taskHint?: string): AgentSnapshot {
    const current = this.agents.get(agentId);
    const snapshot: AgentSnapshot = {
      id: agentId,
      state,
      taskHint,
      isDefault,
      sessionPath,
      updatedAt: Date.now()
    };

    this.agents.set(agentId, { ...current, ...snapshot });
    return this.agents.get(agentId)!;
  }

  get(agentId: string): AgentSnapshot | undefined {
    return this.agents.get(agentId);
  }

  getAll(): AgentSnapshot[] {
    return Array.from(this.agents.values()).sort((left, right) => left.id.localeCompare(right.id));
  }
}

