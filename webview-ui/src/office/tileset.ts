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
  ctx.fillStyle = "#2a231d";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = "#342b23";
  ctx.fillRect(rect.x, rect.y + rect.h - 3, rect.w, 3);
  ctx.fillStyle = "rgba(248, 227, 198, 0.08)";
  ctx.fillRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 7);
  ctx.fillStyle = "rgba(255, 240, 218, 0.14)";
  ctx.fillRect(rect.x + 3, rect.y + 3, 2, 2);
  ctx.fillRect(rect.x + 10, rect.y + 7, 2, 2);
}

function drawWallTile(ctx: CanvasRenderingContext2D, rect: TilesetRect) {
  ctx.fillStyle = "#5f5143";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = "#4a3f34";
  ctx.fillRect(rect.x, rect.y, rect.w, 4);
  ctx.fillStyle = "#7a6a59";
  ctx.fillRect(rect.x + 2, rect.y + 6, rect.w - 4, 2);
  ctx.fillRect(rect.x + 2, rect.y + 11, rect.w - 4, 2);
}

function drawDeskTile(ctx: CanvasRenderingContext2D, rect: TilesetRect) {
  ctx.fillStyle = "#8d694a";
  ctx.fillRect(rect.x + 1, rect.y + 3, rect.w - 2, rect.h - 4);
  ctx.fillStyle = "#b4875b";
  ctx.fillRect(rect.x + 1, rect.y + 3, rect.w - 2, 3);
  ctx.fillStyle = "#2b2722";
  ctx.fillRect(rect.x + 4, rect.y + 6, rect.w - 8, rect.h - 8);
  ctx.fillStyle = "#4c3928";
  ctx.fillRect(rect.x + 2, rect.y + rect.h - 2, 2, 2);
  ctx.fillRect(rect.x + rect.w - 4, rect.y + rect.h - 2, 2, 2);
}

function drawCoffeeTile(ctx: CanvasRenderingContext2D, rect: TilesetRect) {
  ctx.fillStyle = "#73512b";
  ctx.fillRect(rect.x + 2, rect.y + 4, rect.w - 4, rect.h - 4);
  ctx.fillStyle = "#9d7440";
  ctx.fillRect(rect.x + 3, rect.y + 5, rect.w - 6, rect.h - 7);
  ctx.fillStyle = "#ece0c2";
  ctx.fillRect(rect.x + 5, rect.y + 2, 6, 4);
  ctx.fillStyle = "#5b3820";
  ctx.fillRect(rect.x + 6, rect.y + 3, 4, 2);
}

function drawCouchTile(ctx: CanvasRenderingContext2D, rect: TilesetRect) {
  ctx.fillStyle = "#4f6873";
  ctx.fillRect(rect.x + 1, rect.y + 5, rect.w - 2, rect.h - 4);
  ctx.fillStyle = "#6f8891";
  ctx.fillRect(rect.x + 2, rect.y + 3, rect.w - 4, 4);
  ctx.fillStyle = "#3c4f57";
  ctx.fillRect(rect.x, rect.y + rect.h - 3, rect.w, 3);
  ctx.fillStyle = "#8ea3aa";
  ctx.fillRect(rect.x + 3, rect.y + 7, rect.w - 6, 3);
}
