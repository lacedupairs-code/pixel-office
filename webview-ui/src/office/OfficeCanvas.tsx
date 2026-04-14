import { useEffect, useRef } from "react";
import layoutJson from "../assets/default-layout.json";
import { TILE_SIZE, GRID_LINE_COLOR, FLOOR_COLOR, WALL_COLOR, DESK_COLOR, COFFEE_COLOR, COUCH_COLOR } from "./constants";
import type { OfficeLayout } from "./types";
import type { OfficeAgent } from "../store/officeStore";

const layout = layoutJson as OfficeLayout;

interface OfficeCanvasProps {
  agents: OfficeAgent[];
}

export function OfficeCanvas({ agents }: OfficeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    drawOffice(ctx, agents);
  }, [agents]);

  return <canvas ref={canvasRef} style={styles.canvas} aria-label="Pixel Office canvas" />;
}

function drawOffice(ctx: CanvasRenderingContext2D, agents: OfficeAgent[]) {
  const width = layout.cols * TILE_SIZE;
  const height = layout.rows * TILE_SIZE;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = FLOOR_COLOR;
  ctx.fillRect(0, 0, width, height);

  drawRoomShell(ctx);
  drawLandmarks(ctx);
  drawGrid(ctx);
  drawAgents(ctx, agents);
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

function drawAgents(ctx: CanvasRenderingContext2D, agents: OfficeAgent[]) {
  const seats = new Map(layout.agents.map((seat) => [seat.agentId, seat]));

  agents.forEach((agent, index) => {
    const seat = seats.get(agent.id) ?? {
      agentId: agent.id,
      deskX: 4 + (index % 4) * 3,
      deskY: 9 + Math.floor(index / 4) * 2
    };

    const centerX = seat.deskX * TILE_SIZE + TILE_SIZE;
    const centerY = seat.deskY * TILE_SIZE + TILE_SIZE + 8;
    const color = getAgentColor(agent.state);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#111";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(agent.id.slice(0, 8), centerX, centerY - 16);

    if (agent.taskHint) {
      ctx.fillStyle = "rgba(255, 248, 232, 0.92)";
      ctx.fillRect(centerX - 40, centerY - 42, 80, 16);
      ctx.fillStyle = "#2b2622";
      ctx.font = "10px sans-serif";
      ctx.fillText(agent.taskHint.slice(0, 14), centerX, centerY - 30);
    }
  });
}

function getAgentColor(state: OfficeAgent["state"]) {
  switch (state) {
    case "working":
      return "#f29c52";
    case "reading":
      return "#7eb6ff";
    case "waiting":
      return "#f2d06b";
    case "sleeping":
      return "#8f86d8";
    case "offline":
      return "#5e5751";
    case "idle":
    default:
      return "#7cc08a";
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
