export type OfficeAgentState = "working" | "reading" | "idle" | "waiting" | "sleeping" | "offline";

export interface LayoutAgentSeat {
  agentId: string;
  deskX: number;
  deskY: number;
}

export interface OfficeLayout {
  version: number;
  cols: number;
  rows: number;
  tiles: Array<{
    x: number;
    y: number;
    type: string;
  }>;
  agents: LayoutAgentSeat[];
}

export interface Point {
  x: number;
  y: number;
}
