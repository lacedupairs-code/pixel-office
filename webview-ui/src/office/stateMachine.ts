import type { OfficeAgent } from "../store/officeStore";
import type { AgentIntent, LayoutAgentSeat, OfficeLayout } from "./types";
import type { TilePoint } from "./pathfinding";

interface AgentSpriteStateLike {
  idleVariant: number;
}

interface ResolveIntentOptions {
  agent: OfficeAgent;
  layout: OfficeLayout;
  homeSeat: LayoutAgentSeat;
  spawnTile: TilePoint;
  couchTile: TilePoint;
  sprite: AgentSpriteStateLike;
  walkableGrid: boolean[][];
}

const WAITING_BUBBLE = "Waiting...";

export function resolveAgentIntent({
  agent,
  layout,
  homeSeat,
  spawnTile,
  couchTile,
  sprite,
  walkableGrid
}: ResolveIntentOptions): AgentIntent {
  if (agent.state === "offline") {
    return {
      tile: spawnTile,
      point: toPoint(spawnTile)
    };
  }

  if (agent.state === "sleeping") {
    return {
      tile: couchTile,
      point: toPoint(couchTile),
      bubbleText: "Zzz"
    };
  }

  if (agent.state === "idle") {
    const idleTile = pickIdleTile(homeSeat, sprite.idleVariant, walkableGrid, layout);
    return {
      tile: idleTile,
      point: toPoint(idleTile)
    };
  }

  const deskTile = {
    x: homeSeat.deskX + 1,
    y: homeSeat.deskY + 1
  };

  return {
    tile: deskTile,
    point: toPoint(deskTile),
    bubbleText: agent.state === "waiting" ? WAITING_BUBBLE : agent.taskHint
  };
}

function pickIdleTile(
  seat: LayoutAgentSeat,
  variant: number,
  walkableGrid: boolean[][],
  layout: OfficeLayout
): TilePoint {
  const candidates: TilePoint[] = [
    { x: seat.deskX + 1, y: seat.deskY + 1 },
    { x: seat.deskX + 3, y: seat.deskY + 1 },
    { x: seat.deskX + 1, y: seat.deskY + 3 },
    { x: seat.deskX - 1, y: seat.deskY + 2 }
  ];

  for (let step = 0; step < candidates.length; step += 1) {
    const candidate = candidates[(variant + step) % candidates.length];
    if (!candidate) {
      continue;
    }

    if (candidate.x <= 0 || candidate.y <= 0 || candidate.x >= layout.cols - 1 || candidate.y >= layout.rows - 1) {
      continue;
    }

    if (walkableGrid[candidate.y]?.[candidate.x]) {
      return candidate;
    }
  }

  return { x: seat.deskX + 1, y: seat.deskY + 1 };
}

function toPoint(tile: TilePoint) {
  return {
    x: tile.x * 32 + 16,
    y: tile.y * 32 + 24
  };
}
