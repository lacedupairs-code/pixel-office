import { create } from "zustand";

export interface OfficeAgent {
  id: string;
  status: string;
  sessionPath: string | null;
}

interface OfficeStore {
  agents: OfficeAgent[];
  openClawBaseDir: string;
  setAgents: (agents: OfficeAgent[]) => void;
  setOpenClawBaseDir: (path: string) => void;
}

export const useOfficeStore = create<OfficeStore>((set) => ({
  agents: [],
  openClawBaseDir: "",
  setAgents: (agents) => set({ agents }),
  setOpenClawBaseDir: (openClawBaseDir) => set({ openClawBaseDir })
}));

