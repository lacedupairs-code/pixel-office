import { create } from "zustand";

export type OfficeAgentState = "working" | "reading" | "idle" | "waiting" | "sleeping" | "offline";

export interface OfficeAgent {
  id: string;
  state: OfficeAgentState;
  taskHint?: string;
  isDefault: boolean;
  sessionPath: string | null;
}

interface OfficeStore {
  agents: OfficeAgent[];
  connectionState: "connecting" | "open" | "closed";
  initAgents: (agents: OfficeAgent[]) => void;
  updateAgent: (agent: OfficeAgent) => void;
  setConnectionState: (state: OfficeStore["connectionState"]) => void;
}

export const useOfficeStore = create<OfficeStore>((set) => ({
  agents: [],
  connectionState: "connecting",
  initAgents: (agents) => set({ agents }),
  updateAgent: (agent) =>
    set((state) => {
      const existingIndex = state.agents.findIndex((item) => item.id === agent.id);
      if (existingIndex === -1) {
        return {
          agents: [...state.agents, agent].sort((left, right) => left.id.localeCompare(right.id))
        };
      }

      const agents = [...state.agents];
      agents[existingIndex] = { ...agents[existingIndex], ...agent };
      return { agents };
    }),
  setConnectionState: (connectionState) => set({ connectionState })
}));
