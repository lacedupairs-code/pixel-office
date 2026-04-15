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
const READING_BUBBLES = ["Reviewing", "Deep reading", "Quiet focus"];
const IDLE_BUBBLES = ["Coffee break", "Stretching", "Looping the room", "Chatting"];

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
    const couchApproach = findApproachTile(couchTile, walkableGrid, layout, [
      { x: 0, y: 1 },
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: -1 }
    ]);
    return {
      tile: couchApproach,
      point: toPoint(couchApproach),
      bubbleText: "Zzz"
    };
  }

  if (agent.state === "idle") {
    const idleIntent = pickIdleIntent(homeSeat, sprite.idleVariant, walkableGrid, layout, spawnTile, couchTile);
    return {
      tile: idleIntent.tile,
      point: toPoint(idleIntent.tile),
      bubbleText: idleIntent.bubbleText
    };
  }

  if (agent.state === "waiting") {
    const waitingIntent = pickWaitingIntent(homeSeat, sprite.idleVariant, walkableGrid, layout, spawnTile);
    return {
      tile: waitingIntent.tile,
      point: toPoint(waitingIntent.tile),
      bubbleText: waitingIntent.bubbleText
    };
  }

  if (agent.state === "reading") {
    const readingIntent = pickReadingIntent(homeSeat, sprite.idleVariant, walkableGrid, layout, couchTile);
    return {
      tile: readingIntent.tile,
      point: toPoint(readingIntent.tile),
      bubbleText: readingIntent.bubbleText ?? agent.taskHint
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

function pickIdleIntent(
  seat: LayoutAgentSeat,
  variant: number,
  walkableGrid: boolean[][],
  layout: OfficeLayout,
  spawnTile: TilePoint,
  couchTile: TilePoint
): { tile: TilePoint; bubbleText?: string } {
  const coffeeTile = findTile(layout, "coffee");
  const deskCluster = pickSeatApproachTile(seat, variant, walkableGrid, layout);
  const coffeeApproach = coffeeTile
    ? findApproachTile(coffeeTile, walkableGrid, layout, [
        { x: 0, y: 1 },
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: -1 }
      ])
    : undefined;
  const couchApproach = findApproachTile(couchTile, walkableGrid, layout, [
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: -1 }
  ]);
  const hallwayTile = findFirstWalkable(
    [
      { x: spawnTile.x + 2, y: spawnTile.y - 1 },
      { x: spawnTile.x + 3, y: spawnTile.y - 1 },
      { x: spawnTile.x + 1, y: spawnTile.y - 2 }
    ],
    walkableGrid,
    layout,
    deskCluster
  );

  const routines = [
    { tile: deskCluster, bubbleText: undefined },
    { tile: coffeeApproach, bubbleText: IDLE_BUBBLES[0] },
    { tile: hallwayTile, bubbleText: IDLE_BUBBLES[2] },
    { tile: couchApproach, bubbleText: IDLE_BUBBLES[1] }
  ];

  for (let step = 0; step < routines.length; step += 1) {
    const candidate = routines[(variant + step) % routines.length];
    if (candidate?.tile) {
      return {
        tile: candidate.tile,
        bubbleText: candidate.bubbleText
      };
    }
  }

  return { tile: deskCluster };
}

function pickWaitingIntent(
  seat: LayoutAgentSeat,
  variant: number,
  walkableGrid: boolean[][],
  layout: OfficeLayout,
  spawnTile: TilePoint
) {
  const coffeeTile = findTile(layout, "coffee");
  const lobbyTiles = [
    { x: spawnTile.x + 1, y: spawnTile.y },
    { x: spawnTile.x + 2, y: spawnTile.y },
    { x: spawnTile.x + 1, y: spawnTile.y - 1 }
  ];
  const queueTile = coffeeTile
    ? findApproachTile(coffeeTile, walkableGrid, layout, [
        { x: 0, y: 1 },
        { x: -1, y: 0 },
        { x: 1, y: 0 }
      ])
    : undefined;
  const fallbackTile = pickSeatApproachTile(seat, variant, walkableGrid, layout);
  const waitingTile = findFirstWalkable(lobbyTiles, walkableGrid, layout, queueTile ?? fallbackTile);

  return {
    tile: variant % 2 === 0 ? waitingTile : queueTile ?? waitingTile,
    bubbleText: variant % 2 === 0 ? WAITING_BUBBLE : "Standing by"
  };
}

function pickReadingIntent(
  seat: LayoutAgentSeat,
  variant: number,
  walkableGrid: boolean[][],
  layout: OfficeLayout,
  couchTile: TilePoint
) {
  const quietDeskTile = pickSeatApproachTile(seat, variant + 1, walkableGrid, layout);
  const couchApproach = findApproachTile(couchTile, walkableGrid, layout, [
    { x: 0, y: 1 },
    { x: 1, y: 0 },
    { x: -1, y: 0 }
  ]);
  const perimeterTile = findFirstWalkable(
    [
      { x: seat.deskX + 2, y: seat.deskY - 1 },
      { x: seat.deskX + 3, y: seat.deskY + 1 },
      { x: seat.deskX, y: seat.deskY + 3 }
    ],
    walkableGrid,
    layout,
    quietDeskTile
  );

  const routines = [quietDeskTile, couchApproach, perimeterTile].filter(Boolean) as TilePoint[];
  const tile = routines[variant % routines.length] ?? quietDeskTile;

  return {
    tile,
    bubbleText: READING_BUBBLES[variant % READING_BUBBLES.length]
  };
}

function pickSeatApproachTile(
  seat: LayoutAgentSeat,
  variant: number,
  walkableGrid: boolean[][],
  layout: OfficeLayout
) {
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

function findApproachTile(
  anchor: TilePoint,
  walkableGrid: boolean[][],
  layout: OfficeLayout,
  preferredOffsets: TilePoint[]
) {
  const approachCandidates = preferredOffsets.map((offset) => ({
    x: anchor.x + offset.x,
    y: anchor.y + offset.y
  }));

  return findFirstWalkable(approachCandidates, walkableGrid, layout, anchor);
}

function findFirstWalkable(
  candidates: TilePoint[],
  walkableGrid: boolean[][],
  layout: OfficeLayout,
  fallback: TilePoint
) {
  for (const candidate of candidates) {
    if (candidate.x <= 0 || candidate.y <= 0 || candidate.x >= layout.cols - 1 || candidate.y >= layout.rows - 1) {
      continue;
    }

    if (walkableGrid[candidate.y]?.[candidate.x]) {
      return candidate;
    }
  }

  return fallback;
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
