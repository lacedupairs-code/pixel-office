import { AGENT_RADIUS, TILE_SIZE } from "./constants";
import type { OfficeAgent } from "../store/officeStore";
import type { Facing } from "./types";
import { getFrameRect, getFrameScale, getGeneratedSpriteSheet, getPalette } from "./sprites";

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
  const sheet = getGeneratedSpriteSheet();
  const frame = agent.state === "sleeping" ? 1 : moving ? Math.floor(timestampMs / 140) % 3 : 1;
  const frameRect = getFrameRect(direction, frame);
  const scale = getFrameScale();
  const opacity = agent.state === "offline" ? 0.58 : 1;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(sprite.x, sprite.y + AGENT_RADIUS + 6, 10, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (agent.state === "sleeping") {
    drawSleepingBody(ctx, sprite.x, bodyY, palette);
  } else {
    drawStandingBody(ctx, sheet, frameRect, sprite.x, bodyY, palette, scale);
  }

  drawAgentStateAccent(ctx, agent, sprite, bodyY, direction, timestampMs, moving);

  ctx.fillStyle = "#111";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(agent.id.slice(0, 8), sprite.x, sprite.y - 18);

  if (sprite.bubbleText) {
    drawBubble(ctx, sprite.x, sprite.y - 44, sprite.bubbleText);
  }
  ctx.restore();
}

function drawStandingBody(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLCanvasElement,
  frameRect: ReturnType<typeof getFrameRect>,
  x: number,
  y: number,
  palette: Palette,
  scale: number
) {
  const destWidth = frameRect.sw * scale;
  const destHeight = frameRect.sh * scale;
  const destX = x - destWidth / 2;
  const destY = y - destHeight / 2;

  ctx.drawImage(sheet, frameRect.sx, frameRect.sy, frameRect.sw, frameRect.sh, destX, destY, destWidth, destHeight);
  tintMask(ctx, destX, destY, destWidth, destHeight, "#ffffff", palette.head);
  tintMask(ctx, destX, destY, destWidth, destHeight, "#e4c09f", palette.headShadow);
  tintMask(ctx, destX, destY, destWidth, destHeight, "#ff00ff", palette.body);
  tintMask(ctx, destX, destY, destWidth, destHeight, "#b544a7", palette.bodyShadow);
  tintMask(ctx, destX, destY, destWidth, destHeight, "#00ffff", palette.legs);
  tintMask(ctx, destX, destY, destWidth, destHeight, "#5f7cff", palette.shoes);
  tintMask(ctx, destX, destY, destWidth, destHeight, "#00ff00", palette.accent);
  tintMask(ctx, destX, destY, destWidth, destHeight, "#ffd84f", palette.trim);
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

function drawAgentStateAccent(
  ctx: CanvasRenderingContext2D,
  agent: OfficeAgent,
  sprite: RenderAgentSprite,
  y: number,
  direction: Facing,
  timestampMs: number,
  moving: boolean
) {
  const x = sprite.x;
  switch (agent.state) {
    case "reading":
      drawBookProp(ctx, x, y + 1, direction, timestampMs);
      return;
    case "waiting":
      drawWaitingHalo(ctx, x, y - 10, timestampMs);
      return;
    case "idle":
      if ((sprite.bubbleText ?? "").toLowerCase().includes("coffee")) {
        drawCoffeeProp(ctx, x, y + 1, direction, timestampMs);
      }
      return;
    case "working":
      drawTypingTicks(ctx, x, y - 10, timestampMs, moving);
      return;
    case "offline":
      drawOfflineBadge(ctx, x, y - 10);
      return;
    default:
      return;
  }
}

function drawBookProp(ctx: CanvasRenderingContext2D, x: number, y: number, direction: Facing, timestampMs: number) {
  const offsetX = direction === "left" ? -10 : direction === "right" ? 6 : 0;
  const wobble = Math.sin(timestampMs / 260) * 0.6;
  ctx.fillStyle = "#d7e7ff";
  ctx.fillRect(x - 6 + offsetX, y - 2 + wobble, 12, 8);
  ctx.fillStyle = "#7ea3cf";
  ctx.fillRect(x - 1 + offsetX, y - 2 + wobble, 2, 8);
}

function drawCoffeeProp(ctx: CanvasRenderingContext2D, x: number, y: number, direction: Facing, timestampMs: number) {
  const offsetX = direction === "left" ? -9 : direction === "right" ? 7 : 5;
  const steam = Math.sin(timestampMs / 220) * 1.5;
  ctx.fillStyle = "#dca36b";
  ctx.fillRect(x - 3 + offsetX, y + 1, 6, 5);
  ctx.strokeStyle = "#f6d7b7";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 1 + offsetX, y + 2, 4, 3);
  ctx.beginPath();
  ctx.moveTo(x + offsetX, y - 1);
  ctx.quadraticCurveTo(x + offsetX - 2, y - 5 + steam, x + offsetX + 1, y - 8);
  ctx.stroke();
}

function drawWaitingHalo(ctx: CanvasRenderingContext2D, x: number, y: number, timestampMs: number) {
  const pulse = 0.45 + (Math.sin(timestampMs / 180) + 1) * 0.18;
  ctx.strokeStyle = `rgba(255, 230, 153, ${pulse.toFixed(2)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.stroke();
}

function drawTypingTicks(ctx: CanvasRenderingContext2D, x: number, y: number, timestampMs: number, moving: boolean) {
  if (moving) {
    return;
  }

  const pulse = Math.sin(timestampMs / 110) > 0 ? 1 : 0.45;
  ctx.fillStyle = `rgba(255, 220, 130, ${pulse.toFixed(2)})`;
  ctx.fillRect(x - 6, y, 2, 4);
  ctx.fillRect(x - 1, y - 1, 2, 5);
  ctx.fillRect(x + 4, y, 2, 4);
}

function drawOfflineBadge(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = "rgba(20, 18, 17, 0.82)";
  ctx.fillRect(x - 6, y - 1, 12, 8);
  ctx.strokeStyle = "rgba(166, 154, 144, 0.75)";
  ctx.strokeRect(x - 6, y - 1, 12, 8);
  ctx.fillStyle = "#b8aaa0";
  ctx.fillRect(x - 3, y + 1, 6, 2);
}

function getFacing(dx: number, dy: number): Facing {
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }

  return dy >= 0 ? "down" : "up";
}

interface Palette {
  head: string;
  headShadow: string;
  body: string;
  bodyShadow: string;
  accent: string;
  trim: string;
  legs: string;
  shoes: string;
}

export function drawDeskActivity(ctx: CanvasRenderingContext2D, agent: OfficeAgent, x: number, y: number, timestampMs: number) {
  if (agent.state !== "working" && agent.state !== "reading") {
    return;
  }

  const blink = Math.sin(timestampMs / 180) > 0 ? 1 : 0.4;
  ctx.fillStyle = agent.state === "working" ? `rgba(255, 214, 120, ${blink})` : `rgba(150, 210, 255, ${blink})`;
  ctx.fillRect(x - TILE_SIZE / 2 + 8, y - TILE_SIZE / 2 - 4, TILE_SIZE - 16, 4);
}

function tintMask(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  maskColor: string,
  tintColor: string
) {
  const imageData = ctx.getImageData(x, y, width, height);
  const mask = hexToRgb(maskColor);
  const tint = hexToRgb(tintColor);

  for (let i = 0; i < imageData.data.length; i += 4) {
    const r = imageData.data[i];
    const g = imageData.data[i + 1];
    const b = imageData.data[i + 2];
    const a = imageData.data[i + 3];

    if (a === 0) {
      continue;
    }

    if (r === mask.r && g === mask.g && b === mask.b) {
      imageData.data[i] = tint.r;
      imageData.data[i + 1] = tint.g;
      imageData.data[i + 2] = tint.b;
    }
  }

  ctx.putImageData(imageData, x, y);
}

function hexToRgb(value: string) {
  const normalized = value.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}
