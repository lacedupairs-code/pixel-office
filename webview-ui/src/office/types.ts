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

export interface AgentMotionTarget {
  point: Point;
  tile: {
    x: number;
    y: number;
  };
}

export interface AgentIntent {
  tile: {
    x: number;
    y: number;
  };
  point: Point;
  bubbleText?: string;
}
