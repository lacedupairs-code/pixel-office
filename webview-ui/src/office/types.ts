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
  tiles: LayoutTile[];
  agents: LayoutAgentSeat[];
}

export type LayoutTileType = "floor" | "wall" | "desk" | "coffee" | "couch";

export interface LayoutTile {
  x: number;
  y: number;
  type: LayoutTileType;
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

export type Facing = "up" | "down" | "left" | "right";

export type LayoutTool = LayoutTileType | "erase";
