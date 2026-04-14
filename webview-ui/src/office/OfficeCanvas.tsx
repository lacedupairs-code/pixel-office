import { useEffect, useMemo, useRef, useState } from "react";
import {
  TILE_SIZE,
  AGENT_MOVE_SPEED,
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
import type { AgentMotionTarget, LayoutTileType, LayoutTool, OfficeLayout } from "./types";
import { loadOfficeTileset, type LoadedTileset } from "./tileset";
import type { OfficeAgent } from "../store/officeStore";

interface OfficeCanvasProps {
  agents: OfficeAgent[];
  layout: OfficeLayout;
  editMode?: boolean;
  selectedTool?: LayoutTool;
  onPaintTile?: (tileX: number, tileY: number) => void;
  selectedSeatAgentId?: string | null;
  onAssignSeatToTile?: (tileX: number, tileY: number) => void;
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

interface HoverTile {
  tileX: number;
  tileY: number;
}

export function OfficeCanvas({
  agents,
  layout,
  editMode = false,
  selectedTool = "floor",
  onPaintTile,
  selectedSeatAgentId = null,
  onAssignSeatToTile
}: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agentsRef = useRef<Map<string, AgentSprite>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const tilesetRef = useRef<LoadedTileset | null>(null);
  const dragPaintRef = useRef(false);
  const lastPaintedTileRef = useRef<string | null>(null);
  const [tilesetReady, setTilesetReady] = useState(false);
  const [hoverTile, setHoverTile] = useState<HoverTile | null>(null);
  const spawnPoint = useMemo(() => ({ x: TILE_SIZE * 2.5, y: TILE_SIZE * (layout.rows - 2.2) }), [layout.rows]);
  const walkableGrid = useMemo(() => buildWalkableGrid(layout), [layout]);

  useEffect(() => {
    let cancelled = false;

    loadOfficeTileset().then((tileset) => {
      if (cancelled) {
        return;
      }

      tilesetRef.current = tileset;
      setTilesetReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

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
  }, [layout.cols, layout.rows]);

  useEffect(() => {
    const seatMap = buildSeatMap(layout);
    const nextIds = new Set(agents.map((agent) => agent.id));
    const sprites = agentsRef.current;
    const now = Date.now();

    for (const agent of agents) {
      const sprite = sprites.get(agent.id);
      const target = resolveTargetPoint(agent, seatMap, agents, sprite, now, layout, spawnPoint, walkableGrid);

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

      syncSpritePath(sprite, target, walkableGrid);
      sprite.lastKnownState = agent.state;
      sprite.bubbleText = target.bubbleText;
    }

    for (const [id, sprite] of sprites) {
      if (nextIds.has(id)) {
        continue;
      }

      syncSpritePath(
        sprite,
        {
          point: spawnPoint,
          tile: toTilePoint(spawnPoint, TILE_SIZE)
        },
        walkableGrid
      );

      if (distance(sprite.x, sprite.y, spawnPoint.x, spawnPoint.y) < 6) {
        sprites.delete(id);
      }
    }
  }, [agents, layout, spawnPoint, walkableGrid]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !editMode) {
      return;
    }

    const resolveTile = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const tileX = Math.floor(x / TILE_SIZE);
      const tileY = Math.floor(y / TILE_SIZE);

      if (tileX < 0 || tileY < 0 || tileX >= layout.cols || tileY >= layout.rows) {
        return null;
      }

      return { tileX, tileY };
    };

    const paintTile = (tileX: number, tileY: number) => {
      if (!onPaintTile) {
        return;
      }

      const nextKey = `${tileX},${tileY}`;
      if (lastPaintedTileRef.current === nextKey) {
        return;
      }

      lastPaintedTileRef.current = nextKey;
      onPaintTile(tileX, tileY);
    };

    const handlePointerDown = (event: PointerEvent) => {
      const tile = resolveTile(event);
      if (!tile) {
        return;
      }

      setHoverTile(tile);

      if (selectedSeatAgentId) {
        onAssignSeatToTile?.(tile.tileX, tile.tileY);
        return;
      }

      dragPaintRef.current = true;
      paintTile(tile.tileX, tile.tileY);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragPaintRef.current || selectedSeatAgentId) {
        const tile = resolveTile(event);
        setHoverTile(tile);
        return;
      }

      const tile = resolveTile(event);
      setHoverTile(tile);
      if (!tile) {
        return;
      }

      paintTile(tile.tileX, tile.tileY);
    };

    const handlePointerUp = () => {
      dragPaintRef.current = false;
      lastPaintedTileRef.current = null;
    };

    const handlePointerLeave = () => {
      dragPaintRef.current = false;
      lastPaintedTileRef.current = null;
      setHoverTile(null);
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [editMode, layout.cols, layout.rows, onAssignSeatToTile, onPaintTile, selectedSeatAgentId]);

  useEffect(() => {
    if (editMode) {
      return;
    }

    setHoverTile(null);
  }, [editMode]);

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
      updateIdleIntent(agentsRef.current, agents, timestamp, layout, spawnPoint, walkableGrid);
      drawOffice(ctx, agents, agentsRef.current, timestamp, layout, editMode, selectedTool, tilesetRef.current, selectedSeatAgentId, hoverTile);
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
  }, [agents, editMode, hoverTile, layout, selectedSeatAgentId, selectedTool, spawnPoint, tilesetReady, walkableGrid]);

  return (
    <canvas
      ref={canvasRef}
      style={{ ...styles.canvas, cursor: editMode ? (selectedSeatAgentId ? "pointer" : "crosshair") : "default" }}
      aria-label="Pixel Office canvas"
    />
  );
}

function drawOffice(
  ctx: CanvasRenderingContext2D,
  agents: OfficeAgent[],
  sprites: Map<string, AgentSprite>,
  timestampMs: number,
  layout: OfficeLayout,
  editMode: boolean,
  selectedTool: LayoutTool,
  tileset: LoadedTileset | null,
  selectedSeatAgentId: string | null,
  hoverTile: HoverTile | null
) {
  const width = layout.cols * TILE_SIZE;
  const height = layout.rows * TILE_SIZE;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = FLOOR_COLOR;
  ctx.fillRect(0, 0, width, height);

  drawTiles(ctx, layout, tileset);
  drawGrid(ctx, layout);
  if (editMode) {
    drawEditorBadge(ctx, selectedTool, selectedSeatAgentId);
    drawHoverPreview(ctx, layout, hoverTile, selectedTool, selectedSeatAgentId);
  }
  drawAgents(ctx, agents, sprites, timestampMs, layout);
}

function drawTiles(ctx: CanvasRenderingContext2D, layout: OfficeLayout, tileset: LoadedTileset | null) {
  const tileMap = buildResolvedTileMap(layout);

  for (let y = 0; y < layout.rows; y += 1) {
    for (let x = 0; x < layout.cols; x += 1) {
      const tileType = tileMap.get(`${x},${y}`) ?? "floor";

      drawTileSprite(ctx, tileset, tileType, x, y);
      drawAutoTileAccents(ctx, tileMap, tileType, x, y);

      if (tileType === "desk") {
        const isBossDesk = layout.agents.some((seat) => seat.agentId === "main" && seat.deskX === x && seat.deskY === y);
        if (isBossDesk) {
          ctx.fillStyle = "rgba(222, 165, 96, 0.28)";
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  if (tileset?.usingFallbackAtlas) {
    drawFallbackDecor(ctx, layout);
  }
}

function drawTileSprite(
  ctx: CanvasRenderingContext2D,
  tileset: LoadedTileset | null,
  tileType: "floor" | "wall" | "desk" | "coffee" | "couch",
  tileX: number,
  tileY: number
) {
  if (tileset) {
    const rect = tileset.manifest.tiles[tileType];
    const scale = TILE_SIZE / tileset.manifest.tileSize;

    ctx.drawImage(
      tileset.atlas,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      tileX * TILE_SIZE,
      tileY * TILE_SIZE,
      rect.w * scale,
      rect.h * scale
    );
    return;
  }

  drawPrimitiveTile(ctx, tileType, tileX, tileY);
}

function drawPrimitiveTile(
  ctx: CanvasRenderingContext2D,
  tileType: "floor" | "wall" | "desk" | "coffee" | "couch",
  tileX: number,
  tileY: number
) {
  const x = tileX * TILE_SIZE;
  const y = tileY * TILE_SIZE;

  if (tileType === "wall") {
    ctx.fillStyle = WALL_COLOR;
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    return;
  }

  ctx.fillStyle = FLOOR_COLOR;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillRect(x + 8, y + 8, TILE_SIZE - 16, TILE_SIZE - 16);

  if (tileType === "desk") {
    ctx.fillStyle = DESK_COLOR;
    ctx.fillRect(x + 2, y + 4, TILE_SIZE - 4, TILE_SIZE - 8);
    ctx.fillStyle = "#2b2622";
    ctx.fillRect(x + 7, y + 7, TILE_SIZE - 14, TILE_SIZE - 14);
  } else if (tileType === "coffee") {
    ctx.fillStyle = COFFEE_COLOR;
    ctx.fillRect(x + 6, y + 6, TILE_SIZE - 12, TILE_SIZE - 12);
  } else if (tileType === "couch") {
    ctx.fillStyle = COUCH_COLOR;
    ctx.fillRect(x + 2, y + 8, TILE_SIZE - 4, TILE_SIZE - 10);
  }
}

function drawFallbackDecor(ctx: CanvasRenderingContext2D, layout: OfficeLayout) {
  ctx.strokeStyle = "rgba(255, 235, 205, 0.08)";
  ctx.lineWidth = 1;

  for (const tile of layout.tiles) {
    if (tile.type !== "floor") {
      continue;
    }

    ctx.strokeRect(tile.x * TILE_SIZE + 6, tile.y * TILE_SIZE + 6, TILE_SIZE - 12, TILE_SIZE - 12);
  }
}

function buildResolvedTileMap(layout: OfficeLayout) {
  const tileMap = new Map<string, LayoutTileType>();

  for (let y = 0; y < layout.rows; y += 1) {
    for (let x = 0; x < layout.cols; x += 1) {
      const isBorder = x === 0 || y === 0 || x === layout.cols - 1 || y === layout.rows - 1;
      tileMap.set(`${x},${y}`, isBorder ? "wall" : "floor");
    }
  }

  for (const tile of layout.tiles) {
    tileMap.set(`${tile.x},${tile.y}`, tile.type);
  }

  return tileMap;
}

function drawAutoTileAccents(
  ctx: CanvasRenderingContext2D,
  tileMap: Map<string, LayoutTileType>,
  tileType: LayoutTileType,
  tileX: number,
  tileY: number
) {
  const x = tileX * TILE_SIZE;
  const y = tileY * TILE_SIZE;
  const top = getTileType(tileMap, tileX, tileY - 1);
  const right = getTileType(tileMap, tileX + 1, tileY);
  const bottom = getTileType(tileMap, tileX, tileY + 1);
  const left = getTileType(tileMap, tileX - 1, tileY);

  if (tileType === "wall") {
    ctx.fillStyle = "rgba(255, 248, 232, 0.08)";
    if (top !== "wall") {
      ctx.fillRect(x, y, TILE_SIZE, 3);
    }
    if (left !== "wall") {
      ctx.fillRect(x, y, 3, TILE_SIZE);
    }

    ctx.fillStyle = "rgba(23, 17, 13, 0.18)";
    if (right !== "wall") {
      ctx.fillRect(x + TILE_SIZE - 4, y, 4, TILE_SIZE);
    }
    if (bottom !== "wall") {
      ctx.fillRect(x, y + TILE_SIZE - 4, TILE_SIZE, 4);
    }
    return;
  }

  if (tileType === "floor") {
    ctx.fillStyle = "rgba(255, 240, 216, 0.06)";
    if (top === "wall") {
      ctx.fillRect(x, y, TILE_SIZE, 4);
    }
    if (left === "wall") {
      ctx.fillRect(x, y, 4, TILE_SIZE);
    }
    return;
  }

  if (tileType === "desk") {
    ctx.strokeStyle = right === "desk" ? "rgba(255, 229, 188, 0.12)" : "rgba(49, 32, 20, 0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + TILE_SIZE - 1, y + 6);
    ctx.lineTo(x + TILE_SIZE - 1, y + TILE_SIZE - 6);
    ctx.stroke();
    return;
  }

  if (tileType === "couch") {
    ctx.fillStyle = right === "couch" ? "rgba(255,255,255,0.08)" : "rgba(17, 24, 27, 0.18)";
    ctx.fillRect(x + TILE_SIZE - 4, y + 6, 4, TILE_SIZE - 8);
  }
}

function getTileType(tileMap: Map<string, LayoutTileType>, tileX: number, tileY: number) {
  return tileMap.get(`${tileX},${tileY}`) ?? null;
}

function drawHoverPreview(
  ctx: CanvasRenderingContext2D,
  layout: OfficeLayout,
  hoverTile: HoverTile | null,
  selectedTool: LayoutTool,
  selectedSeatAgentId: string | null
) {
  if (!hoverTile) {
    return;
  }

  if (hoverTile.tileX < 0 || hoverTile.tileY < 0 || hoverTile.tileX >= layout.cols || hoverTile.tileY >= layout.rows) {
    return;
  }

  const x = hoverTile.tileX * TILE_SIZE;
  const y = hoverTile.tileY * TILE_SIZE;
  const isSeatMode = selectedSeatAgentId !== null;
  const previewLabel = isSeatMode ? `Desk for ${selectedSeatAgentId}` : selectedTool === "erase" ? "Erase" : `Paint ${selectedTool}`;
  const labelWidth = Math.max(68, previewLabel.length * 7);
  const labelY = Math.max(4, y - 18);

  ctx.fillStyle = isSeatMode ? "rgba(240, 181, 106, 0.18)" : "rgba(144, 200, 255, 0.18)";
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = isSeatMode ? "#f0b56a" : "#8fd0ff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, TILE_SIZE - 2, TILE_SIZE - 2);

  ctx.fillStyle = "rgba(20, 16, 13, 0.92)";
  ctx.fillRect(x + 2, labelY, labelWidth, 16);
  ctx.fillStyle = "#f0dfc4";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(previewLabel, x + 6, labelY + 12);
}

function drawGrid(ctx: CanvasRenderingContext2D, layout: OfficeLayout) {
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
  timestampMs: number,
  layout: OfficeLayout
) {
  const seatMap = buildSeatMap(layout);

  agents.forEach((agent, index) => {
    const sprite = sprites.get(agent.id) ?? {
      id: agent.id,
      x: TILE_SIZE * 2.5 + index * 12,
      y: TILE_SIZE * (layout.rows - 2.2),
      targetX: TILE_SIZE * 2.5 + index * 12,
      targetY: TILE_SIZE * (layout.rows - 2.2),
      path: [],
      pathIndex: 0,
      lastKnownState: agent.state,
      idleVariant: 0,
      nextRetargetAt: 0
    };

    const seat = seatMap.get(agent.id);
    if (seat) {
      drawDeskActivity(ctx, agent, seat.deskX * TILE_SIZE + TILE_SIZE, seat.deskY * TILE_SIZE + TILE_SIZE, timestampMs);
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

function buildSeatMap(layout: OfficeLayout) {
  return new Map(layout.agents.map((seat) => [seat.agentId, seat]));
}

function resolveTargetPoint(
  agent: OfficeAgent,
  seatMap: Map<string, OfficeLayout["agents"][number]>,
  agents: OfficeAgent[],
  sprite: AgentSprite | undefined,
  now: number,
  layout: OfficeLayout,
  spawnPoint: { x: number; y: number },
  walkableGrid: boolean[][]
): AgentMotionTarget {
  const seat = seatMap.get(agent.id) ?? getFallbackSeat(agent.id, agents.findIndex((item) => item.id === agent.id));
  const idleVariant = sprite?.lastKnownState === "idle" ? sprite.idleVariant : 0;

  const intent = resolveAgentIntent({
    agent,
    layout,
    homeSeat: seat,
    spawnTile: toTilePoint(spawnPoint, TILE_SIZE),
    couchTile: findCouchTile(layout),
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

function syncSpritePath(sprite: AgentSprite, target: AgentMotionTarget, walkableGrid: boolean[][]) {
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

function updateIdleIntent(
  sprites: Map<string, AgentSprite>,
  agents: OfficeAgent[],
  nowMs: number,
  layout: OfficeLayout,
  spawnPoint: { x: number; y: number },
  walkableGrid: boolean[][]
) {
  const seatMap = buildSeatMap(layout);

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
    const target = resolveTargetPoint(agent, seatMap, agents, sprite, nowMs, layout, spawnPoint, walkableGrid);
    sprite.bubbleText = target.bubbleText;
    syncSpritePath(sprite, target, walkableGrid);
  }
}

function drawEditorBadge(ctx: CanvasRenderingContext2D, tool: LayoutTool, selectedSeatAgentId: string | null) {
  ctx.fillStyle = "rgba(25, 21, 18, 0.88)";
  ctx.fillRect(12, 12, selectedSeatAgentId ? 220 : 122, 24);
  ctx.fillStyle = "#f0dfc4";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(selectedSeatAgentId ? `Assigning: ${selectedSeatAgentId}` : `Tool: ${tool}`, 20, 28);
}

function findCouchTile(layout: OfficeLayout) {
  const tile = layout.tiles.find((item) => item.type === "couch");
  if (!tile) {
    return { x: layout.cols - 4, y: layout.rows - 3 };
  }

  return { x: tile.x, y: tile.y };
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
