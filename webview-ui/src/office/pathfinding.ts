import type { OfficeLayout, Point } from "./types";

export interface TilePoint {
  x: number;
  y: number;
}

export function buildWalkableGrid(layout: OfficeLayout): boolean[][] {
  const grid = Array.from({ length: layout.rows }, () => Array.from({ length: layout.cols }, () => true));

  for (let y = 0; y < layout.rows; y += 1) {
    for (let x = 0; x < layout.cols; x += 1) {
      if (x === 0 || y === 0 || x === layout.cols - 1 || y === layout.rows - 1) {
        grid[y][x] = false;
      }
    }
  }

  for (const tile of layout.tiles) {
    if (tile.type === "desk" || tile.type === "coffee" || tile.type === "couch") {
      if (grid[tile.y]?.[tile.x] !== undefined) {
        grid[tile.y][tile.x] = false;
      }
    }
  }

  return grid;
}

export function findPath(grid: boolean[][], from: TilePoint, to: TilePoint): TilePoint[] {
  if (from.x === to.x && from.y === to.y) {
    return [from];
  }

  const queue: TilePoint[][] = [[from]];
  const seen = new Set([keyOf(from)]);

  while (queue.length > 0) {
    const path = queue.shift();
    if (!path) {
      continue;
    }

    const current = path[path.length - 1];
    if (!current) {
      continue;
    }

    for (const neighbor of neighbors(current)) {
      const row = grid[neighbor.y];
      if (!row || !row[neighbor.x]) {
        continue;
      }

      const neighborKey = keyOf(neighbor);
      if (seen.has(neighborKey)) {
        continue;
      }

      const nextPath = [...path, neighbor];
      if (neighbor.x === to.x && neighbor.y === to.y) {
        return nextPath;
      }

      seen.add(neighborKey);
      queue.push(nextPath);
    }
  }

  return [from];
}

export function toCanvasPoint(tile: TilePoint, tileSize: number): Point {
  return {
    x: tile.x * tileSize + tileSize / 2,
    y: tile.y * tileSize + tileSize / 2 + 8
  };
}

export function toTilePoint(point: Point, tileSize: number): TilePoint {
  return {
    x: Math.max(0, Math.floor(point.x / tileSize)),
    y: Math.max(0, Math.floor((point.y - 8) / tileSize))
  };
}

function neighbors(point: TilePoint): TilePoint[] {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 }
  ];
}

function keyOf(point: TilePoint): string {
  return `${point.x},${point.y}`;
}
