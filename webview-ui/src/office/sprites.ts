import type { OfficeAgent } from "../store/officeStore";
import type { Facing } from "./types";

const FRAME_WIDTH = 16;
const FRAME_HEIGHT = 20;
const FRAME_SCALE = 2;
const DIRECTIONS: Facing[] = ["down", "left", "right", "up"];
const FRAMES_PER_DIRECTION = 3;

type Palette = {
  head: string;
  body: string;
  accent: string;
  legs: string;
};

let spriteSheetCache: HTMLCanvasElement | null = null;
const paletteCache = new Map<string, Palette>();

export function getGeneratedSpriteSheet(): HTMLCanvasElement {
  if (spriteSheetCache) {
    return spriteSheetCache;
  }

  const canvas = document.createElement("canvas");
  canvas.width = FRAME_WIDTH * FRAMES_PER_DIRECTION;
  canvas.height = FRAME_HEIGHT * DIRECTIONS.length;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create sprite sheet context.");
  }

  ctx.imageSmoothingEnabled = false;

  for (const [row, direction] of DIRECTIONS.entries()) {
    for (let frame = 0; frame < FRAMES_PER_DIRECTION; frame += 1) {
      drawTemplateFrame(ctx, frame * FRAME_WIDTH, row * FRAME_HEIGHT, direction, frame);
    }
  }

  spriteSheetCache = canvas;
  return canvas;
}

export function getFrameRect(direction: Facing, frame: number) {
  const row = DIRECTIONS.indexOf(direction);
  const column = frame % FRAMES_PER_DIRECTION;
  return {
    sx: column * FRAME_WIDTH,
    sy: row * FRAME_HEIGHT,
    sw: FRAME_WIDTH,
    sh: FRAME_HEIGHT
  };
}

export function getFrameScale() {
  return FRAME_SCALE;
}

export function getPalette(agent: OfficeAgent): Palette {
  const key = `${agent.state}:${agent.isDefault ? "boss" : "staff"}`;
  const cached = paletteCache.get(key);
  if (cached) {
    return cached;
  }

  const isBoss = agent.isDefault;
  const palette = (() => {
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
  })();

  paletteCache.set(key, palette);
  return palette;
}

function drawTemplateFrame(
  ctx: CanvasRenderingContext2D,
  offsetX: number,
  offsetY: number,
  direction: Facing,
  frame: number
) {
  const swing = frame === 1 ? 0 : frame === 0 ? -1 : 1;

  ctx.clearRect(offsetX, offsetY, FRAME_WIDTH, FRAME_HEIGHT);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(offsetX + 5, offsetY + 2, 6, 6);
  ctx.fillStyle = "#ff00ff";
  ctx.fillRect(offsetX + 4, offsetY + 8, 8, 6);
  ctx.fillStyle = "#00ffff";
  ctx.fillRect(offsetX + 4, offsetY + 14, 3, 4);
  ctx.fillRect(offsetX + 9, offsetY + 14 + Math.abs(swing), 3, 4);

  ctx.fillStyle = "#00ff00";
  if (direction === "left") {
    ctx.fillRect(offsetX + 2, offsetY + 9 + swing, 2, 5);
  } else if (direction === "right") {
    ctx.fillRect(offsetX + 12, offsetY + 9 - swing, 2, 5);
  } else {
    ctx.fillRect(offsetX + 2, offsetY + 9 + swing, 2, 5);
    ctx.fillRect(offsetX + 12, offsetY + 9 - swing, 2, 5);
  }

  ctx.fillStyle = "#111111";
  if (direction === "up") {
    ctx.fillRect(offsetX + 5, offsetY + 3, 6, 1);
  } else {
    ctx.fillRect(offsetX + 6, offsetY + 4, 1, 1);
    ctx.fillRect(offsetX + 9, offsetY + 4, 1, 1);
  }
}
