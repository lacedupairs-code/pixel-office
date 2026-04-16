import type { OfficeAgent } from "../store/officeStore";
import type { Facing } from "./types";

const FRAME_WIDTH = 16;
const FRAME_HEIGHT = 20;
const FRAME_SCALE = 2;
const DIRECTIONS: Facing[] = ["down", "left", "right", "up"];
const FRAMES_PER_DIRECTION = 3;

type Palette = {
  head: string;
  headShadow: string;
  body: string;
  bodyShadow: string;
  accent: string;
  trim: string;
  legs: string;
  shoes: string;
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
          headShadow: "#d2ab8b",
          body: isBoss ? "#d7863e" : "#d06f4c",
          bodyShadow: isBoss ? "#a95f27" : "#a45035",
          accent: "#ffe0b8",
          trim: "#fff2db",
          legs: "#5d3b29",
          shoes: "#2d1f18"
        };
      case "reading":
        return {
          head: "#f2d2b6",
          headShadow: "#d0ab8d",
          body: isBoss ? "#6996d7" : "#5a84bf",
          bodyShadow: isBoss ? "#476ea9" : "#40618d",
          accent: "#dcecff",
          trim: "#f7fbff",
          legs: "#354965",
          shoes: "#1d2737"
        };
      case "waiting":
        return {
          head: "#f2d2b6",
          headShadow: "#d1ac8d",
          body: "#d0b04a",
          bodyShadow: "#a58a2e",
          accent: "#fff2b3",
          trim: "#fff8db",
          legs: "#60502a",
          shoes: "#2f2715"
        };
      case "sleeping":
        return {
          head: "#dcc4b0",
          headShadow: "#b69d8a",
          body: "#7d72b8",
          bodyShadow: "#5d528e",
          accent: "#c8c1eb",
          trim: "#efebff",
          legs: "#4c456f",
          shoes: "#2a2640"
        };
      case "offline":
        return {
          head: "#98887a",
          headShadow: "#77685c",
          body: "#5e5751",
          bodyShadow: "#463f3b",
          accent: "#867d77",
          trim: "#bbb0a8",
          legs: "#3f3935",
          shoes: "#24201d"
        };
      case "idle":
      default:
        return {
          head: "#f2d2b6",
          headShadow: "#d2ab8b",
          body: isBoss ? "#6fa86f" : "#69a98f",
          bodyShadow: isBoss ? "#4f7f52" : "#47806a",
          accent: "#dbf6de",
          trim: "#f1fff3",
          legs: "#345342",
          shoes: "#1c2d24"
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
  ctx.fillRect(offsetX + 4, offsetY + 1, 8, 7);
  ctx.fillStyle = "#e4c09f";
  ctx.fillRect(offsetX + 4, offsetY + 6, 8, 2);
  ctx.fillStyle = "#ff00ff";
  ctx.fillRect(offsetX + 5, offsetY + 8, 6, 5);
  ctx.fillStyle = "#b544a7";
  ctx.fillRect(offsetX + 5, offsetY + 12, 6, 2);
  ctx.fillStyle = "#ffd84f";
  ctx.fillRect(offsetX + 6, offsetY + 9, 4, 1);
  ctx.fillStyle = "#00ffff";
  ctx.fillRect(offsetX + 5, offsetY + 14, 2, 3);
  ctx.fillRect(offsetX + 9, offsetY + 14 + Math.abs(swing), 2, 3);
  ctx.fillStyle = "#5f7cff";
  ctx.fillRect(offsetX + 5, offsetY + 17, 2, 1);
  ctx.fillRect(offsetX + 9, offsetY + 17 + Math.abs(swing), 2, 1);

  ctx.fillStyle = "#00ff00";
  if (direction === "left") {
    ctx.fillRect(offsetX + 3, offsetY + 8 + swing, 2, 5);
  } else if (direction === "right") {
    ctx.fillRect(offsetX + 11, offsetY + 8 - swing, 2, 5);
  } else {
    ctx.fillRect(offsetX + 3, offsetY + 8 + swing, 2, 5);
    ctx.fillRect(offsetX + 11, offsetY + 8 - swing, 2, 5);
  }

  ctx.fillStyle = "#111111";
  if (direction === "up") {
    ctx.fillRect(offsetX + 4, offsetY + 1, 8, 1);
    ctx.fillRect(offsetX + 5, offsetY + 4, 6, 1);
  } else {
    ctx.fillRect(offsetX + 6, offsetY + 4, 1, 1);
    ctx.fillRect(offsetX + 9, offsetY + 4, 1, 1);
    ctx.fillRect(offsetX + 4, offsetY + 1, 8, 1);
  }
}
