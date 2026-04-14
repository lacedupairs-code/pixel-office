import type { OfficeAgent } from "../store/officeStore";
import type { AgentIntent, LayoutAgentSeat, OfficeLayout } from "./types";
import type { TilePoint } from "./pathfinding";
import { TILE_SIZE } from "./constants";

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
    const coffeeTile = findTile(layout, "coffee");
    const takingCoffeeBreak = sprite.idleVariant % 4 === 2 && coffeeTile;
    return {
      tile: takingCoffeeBreak ? coffeeTile : idleTile,
      point: toPoint(takingCoffeeBreak ? coffeeTile : idleTile),
      bubbleText: takingCoffeeBreak ? "Coffee break" : undefined
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
    x: tile.x * TILE_SIZE + TILE_SIZE / 2,
    y: tile.y * TILE_SIZE + TILE_SIZE / 2 + 8
  };
}

function findTile(layout: OfficeLayout, type: "coffee" | "couch"): TilePoint | undefined {
  const tile = layout.tiles.find((item) => item.type === type);
  if (!tile) {
    return undefined;
  }

  return {
    x: tile.x,
    y: tile.y
  };
}
