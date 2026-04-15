import type { LayoutTileType } from "./types";

export interface TilesetRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TilesetManifest {
  version: number;
  image: string;
  tileSize: number;
  tiles: Record<LayoutTileType, TilesetRect>;
}

export interface LoadedTileset {
  manifest: TilesetManifest;
  atlas: CanvasImageSource;
  usingFallbackAtlas: boolean;
}

let cachedTilesetPromise: Promise<LoadedTileset> | null = null;

export function loadOfficeTileset(): Promise<LoadedTileset> {
  if (!cachedTilesetPromise) {
    cachedTilesetPromise = fetch("/assets/tileset-manifest.json")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unable to load tileset manifest: ${response.status}`);
        }

        const manifest = (await response.json()) as TilesetManifest;

        try {
          const atlas = await loadImage(`/assets/${manifest.image}`);
          return {
            manifest,
            atlas,
            usingFallbackAtlas: false
          };
        } catch {
          return {
            manifest,
            atlas: createFallbackAtlas(manifest),
            usingFallbackAtlas: true
          };
        }
      })
      .catch(() => {
        const manifest = createDefaultManifest();
        return {
          manifest,
          atlas: createFallbackAtlas(manifest),
          usingFallbackAtlas: true
        };
      });
  }

  return cachedTilesetPromise;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
    image.src = src;
  });
}

function createDefaultManifest(): TilesetManifest {
  return {
    version: 1,
    image: "tileset.png",
    tileSize: 16,
    tiles: {
      floor: { x: 0, y: 0, w: 16, h: 16 },
      wall: { x: 16, y: 0, w: 16, h: 16 },
      desk: { x: 32, y: 0, w: 16, h: 16 },
      coffee: { x: 48, y: 0, w: 16, h: 16 },
      couch: { x: 64, y: 0, w: 16, h: 16 }
    }
  };
}

function createFallbackAtlas(manifest: TilesetManifest): HTMLCanvasElement {
  const maxWidth = Math.max(...Object.values(manifest.tiles).map((tile) => tile.x + tile.w));
  const maxHeight = Math.max(...Object.values(manifest.tiles).map((tile) => tile.y + tile.h));
  const atlas = document.createElement("canvas");
  atlas.width = maxWidth;
  atlas.height = maxHeight;

  const ctx = atlas.getContext("2d");
  if (!ctx) {
    return atlas;
  }

  ctx.imageSmoothingEnabled = false;

  drawFloorTile(ctx, manifest.tiles.floor);
  drawWallTile(ctx, manifest.tiles.wall);
  drawDeskTile(ctx, manifest.tiles.desk);
  drawCoffeeTile(ctx, manifest.tiles.coffee);
  drawCouchTile(ctx, manifest.tiles.couch);

  return atlas;
}

function drawFloorTile(ctx: CanvasRenderingContext2D, rect: TilesetRect) {
  ctx.fillStyle = "#2f261f";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = "#3d3128";
  ctx.fillRect(rect.x, rect.y, rect.w, 1);
  ctx.fillRect(rect.x, rect.y + rect.h - 2, rect.w, 2);
  ctx.fillStyle = "#43362c";
  ctx.fillRect(rect.x + 1, rect.y + 4, rect.w - 2, 1);
  ctx.fillRect(rect.x + 1, rect.y + 10, rect.w - 2, 1);
  ctx.fillStyle = "#5d4937";
  ctx.fillRect(rect.x + 4, rect.y, 1, rect.h);
  ctx.fillRect(rect.x + 11, rect.y, 1, rect.h);
  ctx.fillStyle = "rgba(255, 235, 205, 0.18)";
  ctx.fillRect(rect.x + 2, rect.y + 2, 2, 1);
  ctx.fillRect(rect.x + 9, rect.y + 6, 2, 1);
  ctx.fillRect(rect.x + 6, rect.y + 12, 2, 1);
}

function drawWallTile(ctx: CanvasRenderingContext2D, rect: TilesetRect) {
  ctx.fillStyle = "#6a584a";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = "#4b3f36";
  ctx.fillRect(rect.x, rect.y, rect.w, 3);
  ctx.fillRect(rect.x, rect.y + rect.h - 2, rect.w, 2);
  ctx.fillStyle = "#8a7562";
  ctx.fillRect(rect.x + 2, rect.y + 5, rect.w - 4, 1);
  ctx.fillRect(rect.x + 2, rect.y + 9, rect.w - 4, 1);
  ctx.fillRect(rect.x + 2, rect.y + 13, rect.w - 4, 1);
  ctx.fillStyle = "rgba(255, 243, 224, 0.18)";
  ctx.fillRect(rect.x + 3, rect.y + 4, 1, 1);
  ctx.fillRect(rect.x + 11, rect.y + 8, 1, 1);
}

function drawDeskTile(ctx: CanvasRenderingContext2D, rect: TilesetRect) {
  ctx.fillStyle = "#6f513a";
  ctx.fillRect(rect.x + 1, rect.y + 4, rect.w - 2, rect.h - 5);
  ctx.fillStyle = "#b18057";
  ctx.fillRect(rect.x + 1, rect.y + 4, rect.w - 2, 2);
  ctx.fillStyle = "#3a2d24";
  ctx.fillRect(rect.x + 3, rect.y + 6, rect.w - 6, rect.h - 8);
  ctx.fillStyle = "#4c6d85";
  ctx.fillRect(rect.x + 5, rect.y + 7, rect.w - 10, 4);
  ctx.fillStyle = "#89bfd3";
  ctx.fillRect(rect.x + 6, rect.y + 8, rect.w - 12, 2);
  ctx.fillStyle = "#2a201a";
  ctx.fillRect(rect.x + 2, rect.y + rect.h - 3, 2, 3);
  ctx.fillRect(rect.x + rect.w - 4, rect.y + rect.h - 3, 2, 3);
  ctx.fillStyle = "#d5b18a";
  ctx.fillRect(rect.x + 11, rect.y + 11, 2, 2);
}

function drawCoffeeTile(ctx: CanvasRenderingContext2D, rect: TilesetRect) {
  ctx.fillStyle = "#533820";
  ctx.fillRect(rect.x + 3, rect.y + 5, rect.w - 6, rect.h - 5);
  ctx.fillStyle = "#82562f";
  ctx.fillRect(rect.x + 4, rect.y + 6, rect.w - 8, rect.h - 7);
  ctx.fillStyle = "#d9d1b7";
  ctx.fillRect(rect.x + 5, rect.y + 2, 6, 5);
  ctx.fillStyle = "#6d4c34";
  ctx.fillRect(rect.x + 6, rect.y + 3, 4, 2);
  ctx.fillStyle = "#f4e7c8";
  ctx.fillRect(rect.x + 9, rect.y + 3, 1, 2);
  ctx.fillStyle = "rgba(244, 231, 200, 0.5)";
  ctx.fillRect(rect.x + 6, rect.y + 1, 1, 2);
  ctx.fillRect(rect.x + 9, rect.y, 1, 3);
}

function drawCouchTile(ctx: CanvasRenderingContext2D, rect: TilesetRect) {
  ctx.fillStyle = "#435861";
  ctx.fillRect(rect.x + 1, rect.y + 6, rect.w - 2, rect.h - 5);
  ctx.fillStyle = "#688892";
  ctx.fillRect(rect.x + 2, rect.y + 3, rect.w - 4, 5);
  ctx.fillStyle = "#87aab1";
  ctx.fillRect(rect.x + 3, rect.y + 7, 4, 3);
  ctx.fillRect(rect.x + 9, rect.y + 7, 4, 3);
  ctx.fillStyle = "#2d3a40";
  ctx.fillRect(rect.x, rect.y + rect.h - 3, rect.w, 3);
  ctx.fillStyle = "#2a3338";
  ctx.fillRect(rect.x + 2, rect.y + rect.h - 2, 2, 2);
  ctx.fillRect(rect.x + rect.w - 4, rect.y + rect.h - 2, 2, 2);
}
