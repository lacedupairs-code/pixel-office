import { useEffect, useRef } from "react";
import layoutJson from "../assets/default-layout.json";
import {
  TILE_SIZE,
  AGENT_MOVE_SPEED,
  AGENT_RADIUS,
  IDLE_RETARGET_MS,
  GRID_LINE_COLOR,
  FLOOR_COLOR,
  WALL_COLOR,
  DESK_COLOR,
  COFFEE_COLOR,
  COUCH_COLOR
} from "./constants";
import { buildWalkableGrid, findPath, toCanvasPoint, toTilePoint, type TilePoint } from "./pathfinding";
import { drawAgentSprite, drawDeskActivity } from "./renderer";
import { resolveAgentIntent } from "./stateMachine";
import type { AgentMotionTarget, OfficeLayout } from "./types";
import type { OfficeAgent } from "../store/officeStore";

const layout = layoutJson as OfficeLayout;
const spawnPoint = { x: TILE_SIZE * 2.5, y: TILE_SIZE * (layout.rows - 2.2) };
const couchPoint = { x: TILE_SIZE * (layout.cols - 4), y: TILE_SIZE * (layout.rows - 2.7) };
const walkableGrid = buildWalkableGrid(layout);

interface OfficeCanvasProps {
  agents: OfficeAgent[];
}

interface AgentSprite {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  path: TilePoint[];
  pathIndex: number;
  lastKnownState: OfficeAgent["state"];
  idleVariant: number;
  nextRetargetAt: number;
  bubbleText?: string;
}

export function OfficeCanvas({ agents }: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agentsRef = useRef<Map<string, AgentSprite>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    const width = layout.cols * TILE_SIZE;
    const height = layout.rows * TILE_SIZE;

    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }, []);

  useEffect(() => {
    const seatMap = buildSeatMap();
    const nextIds = new Set(agents.map((agent) => agent.id));
    const sprites = agentsRef.current;

    const now = Date.now();
    for (const agent of agents) {
      const sprite = sprites.get(agent.id);
      const target = resolveTargetPoint(agent, seatMap, agents, sprite, now);

      if (!sprite) {
        const spawnTile = toTilePoint(spawnPoint, TILE_SIZE);
        const initialPath = findPath(walkableGrid, spawnTile, target.tile);
        sprites.set(agent.id, {
          id: agent.id,
          x: spawnPoint.x,
          y: spawnPoint.y,
          targetX: spawnPoint.x,
          targetY: spawnPoint.y,
          path: initialPath,
          pathIndex: 0,
          lastKnownState: agent.state,
          idleVariant: 0,
          nextRetargetAt: now + IDLE_RETARGET_MS,
          bubbleText: target.bubbleText
        });
        continue;
      }

      syncSpritePath(sprite, target);
      sprite.lastKnownState = agent.state;
      sprite.bubbleText = target.bubbleText;
    }

    for (const [id, sprite] of sprites) {
      if (nextIds.has(id)) {
        continue;
      }

      syncSpritePath(sprite, {
        point: spawnPoint,
        tile: toTilePoint(spawnPoint, TILE_SIZE)
      });
      if (distance(sprite.x, sprite.y, spawnPoint.x, spawnPoint.y) < 6) {
        sprites.delete(id);
      }
    }
  }, [agents]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const tick = (timestamp: number) => {
      if (lastTickRef.current === null) {
        lastTickRef.current = timestamp;
      }

      const deltaSeconds = Math.min((timestamp - lastTickRef.current) / 1000, 0.05);
      lastTickRef.current = timestamp;

      advanceAgents(agentsRef.current, deltaSeconds);
      updateIdleIntent(agentsRef.current, agents, timestamp);
      drawOffice(ctx, agents, agentsRef.current, timestamp);
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }

      animationFrameRef.current = null;
      lastTickRef.current = null;
    };
  }, [agents]);

  return <canvas ref={canvasRef} style={styles.canvas} aria-label="Pixel Office canvas" />;
}

function drawOffice(
  ctx: CanvasRenderingContext2D,
  agents: OfficeAgent[],
  sprites: Map<string, AgentSprite>,
  timestampMs: number
) {
  const width = layout.cols * TILE_SIZE;
  const height = layout.rows * TILE_SIZE;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = FLOOR_COLOR;
  ctx.fillRect(0, 0, width, height);

  drawRoomShell(ctx);
  drawLandmarks(ctx);
  drawGrid(ctx);
  drawAgents(ctx, agents, sprites, timestampMs);
}

function drawRoomShell(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = WALL_COLOR;
  ctx.fillRect(0, 0, layout.cols * TILE_SIZE, TILE_SIZE);
  ctx.fillRect(0, (layout.rows - 1) * TILE_SIZE, layout.cols * TILE_SIZE, TILE_SIZE);
  ctx.fillRect(0, 0, TILE_SIZE, layout.rows * TILE_SIZE);
  ctx.fillRect((layout.cols - 1) * TILE_SIZE, 0, TILE_SIZE, layout.rows * TILE_SIZE);
}

function drawLandmarks(ctx: CanvasRenderingContext2D) {
  const bossDesk = layout.agents[0];
  if (bossDesk) {
    drawDesk(ctx, bossDesk.deskX, bossDesk.deskY, true);
  }

  drawDesk(ctx, 5, 5, false);
  drawDesk(ctx, 14, 5, false);

  ctx.fillStyle = COFFEE_COLOR;
  ctx.fillRect(2 * TILE_SIZE + 6, (layout.rows - 3) * TILE_SIZE + 6, TILE_SIZE - 12, TILE_SIZE - 12);

  ctx.fillStyle = COUCH_COLOR;
  ctx.fillRect((layout.cols - 5) * TILE_SIZE, (layout.rows - 4) * TILE_SIZE, TILE_SIZE * 2, TILE_SIZE);
  ctx.fillRect((layout.cols - 5) * TILE_SIZE, (layout.rows - 3) * TILE_SIZE, TILE_SIZE * 2, TILE_SIZE);
}

function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number, boss: boolean) {
  ctx.fillStyle = boss ? "#a07148" : DESK_COLOR;
  ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE * 2, TILE_SIZE);
  ctx.fillStyle = "#2b2622";
  ctx.fillRect(x * TILE_SIZE + 6, y * TILE_SIZE + 6, TILE_SIZE - 12, TILE_SIZE - 12);
}

function drawGrid(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.lineWidth = 1;

  for (let x = 0; x <= layout.cols; x += 1) {
    const offset = x * TILE_SIZE + 0.5;
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset, layout.rows * TILE_SIZE);
    ctx.stroke();
  }

  for (let y = 0; y <= layout.rows; y += 1) {
    const offset = y * TILE_SIZE + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, offset);
    ctx.lineTo(layout.cols * TILE_SIZE, offset);
    ctx.stroke();
  }
}

function drawAgents(
  ctx: CanvasRenderingContext2D,
  agents: OfficeAgent[],
  sprites: Map<string, AgentSprite>,
  timestampMs: number
) {
  const seatMap = buildSeatMap();

  agents.forEach((agent, index) => {
    const sprite = sprites.get(agent.id) ?? {
      id: agent.id,
      x: spawnPoint.x + index * 12,
      y: spawnPoint.y,
      targetX: spawnPoint.x + index * 12,
      targetY: spawnPoint.y,
      path: [],
      pathIndex: 0
    };

    const seat = seatMap.get(agent.id);
    if (seat) {
      drawDeskActivity(
        ctx,
        agent,
        seat.deskX * TILE_SIZE + TILE_SIZE,
        seat.deskY * TILE_SIZE + TILE_SIZE,
        timestampMs
      );
    }

    drawAgentSprite(ctx, agent, sprite, timestampMs);
  });
}

function advanceAgents(sprites: Map<string, AgentSprite>, deltaSeconds: number) {
  const maxStep = AGENT_MOVE_SPEED * deltaSeconds;
  for (const sprite of sprites.values()) {
    if (distance(sprite.x, sprite.y, sprite.targetX, sprite.targetY) <= 1 && sprite.pathIndex < sprite.path.length) {
      const nextTile = sprite.path[sprite.pathIndex];
      if (nextTile) {
        const nextPoint = toCanvasPoint(nextTile, TILE_SIZE);
        sprite.targetX = nextPoint.x;
        sprite.targetY = nextPoint.y;
        sprite.pathIndex += 1;
      }
    }

    const dx = sprite.targetX - sprite.x;
    const dy = sprite.targetY - sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0.5) {
      sprite.x = sprite.targetX;
      sprite.y = sprite.targetY;
      continue;
    }

    const step = Math.min(maxStep, dist);
    sprite.x += (dx / dist) * step;
    sprite.y += (dy / dist) * step;
  }
}

function buildSeatMap() {
  return new Map(layout.agents.map((seat) => [seat.agentId, seat]));
}

function resolveTargetPoint(
  agent: OfficeAgent,
  seatMap: Map<string, OfficeLayout["agents"][number]>,
  agents: OfficeAgent[],
  sprite: AgentSprite | undefined,
  now: number
): AgentMotionTarget {
  const seat = seatMap.get(agent.id) ?? getFallbackSeat(agent.id, agents.findIndex((item) => item.id === agent.id));
  const idleVariant = sprite?.lastKnownState === "idle" ? sprite.idleVariant : 0;

  const intent = resolveAgentIntent({
    agent,
    layout,
    homeSeat: seat,
    spawnTile: toTilePoint(spawnPoint, TILE_SIZE),
    couchTile: { x: layout.cols - 4, y: layout.rows - 3 },
    sprite: {
      idleVariant
    },
    walkableGrid
  });

  if (sprite && agent.state === "idle" && agent.state !== sprite.lastKnownState) {
    sprite.idleVariant = Math.floor(now / IDLE_RETARGET_MS) % 4;
    sprite.nextRetargetAt = now + IDLE_RETARGET_MS;
  }

  return intent;
}

function getFallbackSeat(agentId: string, index: number) {
  return {
    agentId,
    deskX: 4 + (index % 4) * 3,
    deskY: 9 + Math.floor(index / 4) * 2
  };
}

function distance(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by);
}

function syncSpritePath(sprite: AgentSprite, target: AgentMotionTarget) {
  const currentTile = toTilePoint({ x: sprite.x, y: sprite.y }, TILE_SIZE);
  const nextPath = findPath(walkableGrid, currentTile, target.tile).slice(1);

  sprite.path = nextPath;
  sprite.pathIndex = 0;

  if (nextPath.length === 0) {
    sprite.targetX = target.point.x;
    sprite.targetY = target.point.y;
    return;
  }

  const firstStep = nextPath[0];
  const nextPoint = toCanvasPoint(firstStep, TILE_SIZE);
  sprite.targetX = nextPoint.x;
  sprite.targetY = nextPoint.y;
  sprite.pathIndex = 1;
}

function updateIdleIntent(sprites: Map<string, AgentSprite>, agents: OfficeAgent[], nowMs: number) {
  const seatMap = buildSeatMap();

  for (const agent of agents) {
    if (agent.state !== "idle") {
      continue;
    }

    const sprite = sprites.get(agent.id);
    if (!sprite || nowMs < sprite.nextRetargetAt) {
      continue;
    }

    if (distance(sprite.x, sprite.y, sprite.targetX, sprite.targetY) > 4 || sprite.pathIndex < sprite.path.length) {
      continue;
    }

    sprite.idleVariant = (sprite.idleVariant + 1) % 4;
    sprite.nextRetargetAt = nowMs + IDLE_RETARGET_MS;
    const target = resolveTargetPoint(agent, seatMap, agents, sprite, nowMs);
    sprite.bubbleText = target.bubbleText;
    syncSpritePath(sprite, target);
  }
}

const styles = {
  canvas: {
    display: "block",
    maxWidth: "100%",
    borderRadius: "18px",
    border: "1px solid rgba(255, 231, 198, 0.14)",
    background: "#171311",
    boxShadow: "0 24px 60px rgba(0, 0, 0, 0.35)"
  }
};
