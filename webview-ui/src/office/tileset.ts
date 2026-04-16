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
  ctx.fillStyle = "#9c6a33";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = "#b57a39";
  ctx.fillRect(rect.x, rect.y, rect.w, 1);
  ctx.fillRect(rect.x, rect.y + 8, rect.w, 1);
  ctx.fillStyle = "#7b4f26";
  ctx.fillRect(rect.x, rect.y + rect.h - 1, rect.w, 1);
  ctx.fillRect(rect.x + 3, rect.y, 1, rect.h);
  ctx.fillRect(rect.x + 8, rect.y, 1, rect.h);
  ctx.fillRect(rect.x + 13, rect.y, 1, rect.h);
  ctx.fillStyle = "rgba(70, 40, 18, 0.45)";
  ctx.fillRect(rect.x + 1, rect.y + 4, 1, 1);
  ctx.fillRect(rect.x + 6, rect.y + 11, 1, 1);
  ctx.fillRect(rect.x + 11, rect.y + 5, 1, 1);
  ctx.fillStyle = "rgba(242, 214, 164, 0.18)";
  ctx.fillRect(rect.x + 10, rect.y + 2, 2, 1);
}

function drawWallTile(ctx: CanvasRenderingContext2D, rect: TilesetRect) {
  ctx.fillStyle = "#1a2634";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = "#2c3d55";
  ctx.fillRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  ctx.fillStyle = "#0c1118";
  ctx.fillRect(rect.x, rect.y, rect.w, 1);
  ctx.fillRect(rect.x, rect.y, 1, rect.h);
  ctx.fillRect(rect.x + rect.w - 1, rect.y, 1, rect.h);
  ctx.fillRect(rect.x, rect.y + rect.h - 1, rect.w, 1);
  ctx.fillStyle = "#42556f";
  ctx.fillRect(rect.x + 2, rect.y + 3, rect.w - 4, 1);
  ctx.fillRect(rect.x + 2, rect.y + 8, rect.w - 4, 1);
  ctx.fillStyle = "#56708f";
  ctx.fillRect(rect.x + 4, rect.y + 12, rect.w - 8, 1);
}

function drawDeskTile(ctx: CanvasRenderingContext2D, rect: TilesetRect) {
  ctx.fillStyle = "#63370f";
  ctx.fillRect(rect.x + 2, rect.y + 4, rect.w - 4, rect.h - 5);
  ctx.fillStyle = "#a45c19";
  ctx.fillRect(rect.x + 2, rect.y + 4, rect.w - 4, 2);
  ctx.fillStyle = "#d38a30";
  ctx.fillRect(rect.x + 3, rect.y + 8, rect.w - 6, 1);
  ctx.fillRect(rect.x + 3, rect.y + 12, rect.w - 6, 1);
  ctx.fillStyle = "#1f2430";
  ctx.fillRect(rect.x + 4, rect.y + 5, 6, 4);
  ctx.fillStyle = "#94afc2";
  ctx.fillRect(rect.x + 5, rect.y + 6, 4, 2);
  ctx.fillStyle = "#ece5d8";
  ctx.fillRect(rect.x + 11, rect.y + 6, 2, 3);
  ctx.fillStyle = "#6d7887";
  ctx.fillRect(rect.x + 10, rect.y + 10, 3, 2);
  ctx.fillStyle = "#1d1208";
  ctx.fillRect(rect.x + 2, rect.y + rect.h - 3, 2, 3);
  ctx.fillRect(rect.x + rect.w - 4, rect.y + rect.h - 3, 2, 3);
}

function drawCoffeeTile(ctx: CanvasRenderingContext2D, rect: TilesetRect) {
  ctx.fillStyle = "#5c3e1d";
  ctx.fillRect(rect.x + 1, rect.y + 2, rect.w - 2, rect.h - 3);
  ctx.fillStyle = "#b8904d";
  ctx.fillRect(rect.x + 2, rect.y + 3, rect.w - 4, rect.h - 5);
  ctx.fillStyle = "#703615";
  ctx.fillRect(rect.x + 3, rect.y + 4, 3, 9);
  ctx.fillRect(rect.x + 7, rect.y + 4, 3, 9);
  ctx.fillRect(rect.x + 11, rect.y + 4, 2, 9);
  ctx.fillStyle = "#eee7d4";
  ctx.fillRect(rect.x + 3, rect.y + 5, 2, 2);
  ctx.fillRect(rect.x + 8, rect.y + 6, 1, 2);
  ctx.fillRect(rect.x + 11, rect.y + 5, 1, 3);
  ctx.fillStyle = "#355f3e";
  ctx.fillRect(rect.x + 5, rect.y + 10, 2, 3);
  ctx.fillRect(rect.x + 6, rect.y + 9, 2, 4);
}

function drawCouchTile(ctx: CanvasRenderingContext2D, rect: TilesetRect) {
  ctx.fillStyle = "#4a79a6";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = "#6e95bb";
  ctx.fillRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  ctx.fillStyle = "#9b5b7a";
  ctx.fillRect(rect.x + 2, rect.y + 3, 2, rect.h - 6);
  ctx.fillRect(rect.x + rect.w - 4, rect.y + 3, 2, rect.h - 6);
  ctx.fillStyle = "#b89b67";
  ctx.fillRect(rect.x + 5, rect.y + 6, rect.w - 10, rect.h - 8);
  ctx.fillStyle = "#d7c2a0";
  ctx.fillRect(rect.x + 6, rect.y + 7, rect.w - 12, rect.h - 10);
  ctx.fillStyle = "#f0ebe0";
  ctx.fillRect(rect.x + 10, rect.y + 4, 2, 2);
}
