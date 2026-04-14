import { AGENT_RADIUS, TILE_SIZE } from "./constants";
import type { OfficeAgent } from "../store/officeStore";

interface RenderAgentSprite {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  bubbleText?: string;
}

export function drawAgentSprite(
  ctx: CanvasRenderingContext2D,
  agent: OfficeAgent,
  sprite: RenderAgentSprite,
  timestampMs: number
) {
  const dx = sprite.targetX - sprite.x;
  const dy = sprite.targetY - sprite.y;
  const moving = Math.hypot(dx, dy) > 1.2;
  const direction = getFacing(dx, dy);
  const bob = moving ? Math.sin(timestampMs / 120) * 1.8 : Math.sin(timestampMs / 400) * 0.5;
  const bodyY = sprite.y + bob;
  const palette = getPalette(agent);

  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(sprite.x, sprite.y + AGENT_RADIUS + 6, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (agent.state === "sleeping") {
    drawSleepingBody(ctx, sprite.x, bodyY, palette);
  } else {
    drawStandingBody(ctx, sprite.x, bodyY, palette, direction, moving, timestampMs);
  }

  ctx.fillStyle = "#111";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(agent.id.slice(0, 8), sprite.x, sprite.y - 18);

  if (sprite.bubbleText) {
    drawBubble(ctx, sprite.x, sprite.y - 44, sprite.bubbleText);
  }
}

function drawStandingBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  palette: Palette,
  direction: Facing,
  moving: boolean,
  timestampMs: number
) {
  const sway = moving ? Math.sign(Math.sin(timestampMs / 130)) * 1.2 : 0;
  const legOffset = moving ? Math.sign(Math.sin(timestampMs / 130)) * 2 : 0;

  ctx.fillStyle = palette.legs;
  ctx.fillRect(x - 5, y + 6, 4, 8);
  ctx.fillRect(x + 1, y + 6 + legOffset, 4, 8);

  ctx.fillStyle = palette.body;
  ctx.fillRect(x - 7, y - 4, 14, 12);

  ctx.fillStyle = palette.head;
  ctx.fillRect(x - 5, y - 13, 10, 10);

  ctx.fillStyle = palette.accent;
  if (direction === "left") {
    ctx.fillRect(x - 9, y - 1 + sway, 3, 8);
  } else if (direction === "right") {
    ctx.fillRect(x + 6, y - 1 - sway, 3, 8);
  } else {
    ctx.fillRect(x - 9, y - 1 + sway, 3, 8);
    ctx.fillRect(x + 6, y - 1 - sway, 3, 8);
  }

  if (direction === "up") {
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(x - 4, y - 10, 8, 3);
  } else {
    ctx.fillStyle = "#1a1715";
    ctx.fillRect(x - 3, y - 9, 2, 2);
    ctx.fillRect(x + 1, y - 9, 2, 2);
  }
}

function drawSleepingBody(ctx: CanvasRenderingContext2D, x: number, y: number, palette: Palette) {
  ctx.fillStyle = palette.legs;
  ctx.fillRect(x - 8, y + 4, 16, 5);
  ctx.fillStyle = palette.body;
  ctx.fillRect(x - 10, y - 3, 20, 8);
  ctx.fillStyle = palette.head;
  ctx.fillRect(x - 12, y - 5, 8, 8);
}

function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  const label = text.slice(0, 14);
  const width = Math.max(40, label.length * 6 + 12);
  const height = 18;
  const left = x - width / 2;

  ctx.fillStyle = "rgba(255, 248, 232, 0.96)";
  ctx.fillRect(left, y, width, height);
  ctx.fillStyle = "#2b2622";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x, y + 12);

  ctx.beginPath();
  ctx.moveTo(x - 5, y + height);
  ctx.lineTo(x, y + height + 6);
  ctx.lineTo(x + 5, y + height);
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 248, 232, 0.96)";
  ctx.fill();
}

type Facing = "up" | "down" | "left" | "right";

function getFacing(dx: number, dy: number): Facing {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "down" : "up";
}

interface Palette {
  head: string;
  body: string;
  accent: string;
  legs: string;
}

function getPalette(agent: OfficeAgent): Palette {
  const isBoss = agent.isDefault;

  switch (agent.state) {
    case "working":
      return {
        head: "#f2d2b6",
        body: isBoss ? "#d7863e" : "#d06f4c",
        accent: "#ffe0b8",
        legs: "#5d3b29"
      };
    case "reading":
      return {
        head: "#f2d2b6",
        body: isBoss ? "#6996d7" : "#5a84bf",
        accent: "#dcecff",
        legs: "#354965"
      };
    case "waiting":
      return {
        head: "#f2d2b6",
        body: "#d0b04a",
        accent: "#fff2b3",
        legs: "#60502a"
      };
    case "sleeping":
      return {
        head: "#dcc4b0",
        body: "#7d72b8",
        accent: "#c8c1eb",
        legs: "#4c456f"
      };
    case "offline":
      return {
        head: "#98887a",
        body: "#5e5751",
        accent: "#867d77",
        legs: "#3f3935"
      };
    case "idle":
    default:
      return {
        head: "#f2d2b6",
        body: isBoss ? "#6fa86f" : "#69a98f",
        accent: "#dbf6de",
        legs: "#345342"
      };
  }
}

export function drawDeskActivity(ctx: CanvasRenderingContext2D, agent: OfficeAgent, x: number, y: number, timestampMs: number) {
  if (agent.state !== "working" && agent.state !== "reading") {
    return;
  }

  const blink = Math.sin(timestampMs / 180) > 0 ? 1 : 0.4;
  ctx.fillStyle = agent.state === "working" ? `rgba(255, 214, 120, ${blink})` : `rgba(150, 210, 255, ${blink})`;
  ctx.fillRect(x - TILE_SIZE / 2 + 8, y - TILE_SIZE / 2 - 4, TILE_SIZE - 16, 4);
}
