import * as fs from "node:fs";
import * as path from "node:path";

type Manifest = {
  version: number;
  image: string;
  tileSize: number;
  tiles: Record<string, { x: number; y: number; w: number; h: number }>;
};

export function importTileset(sourcePath?: string): void {
  if (!sourcePath) {
    throw new Error("Usage: node dist/scripts/import-tileset.js <path-to-png>");
  }

  const resolvedSource = path.resolve(sourcePath);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Tileset source not found: ${resolvedSource}`);
  }

  const targetDir = path.resolve(process.cwd(), "webview-ui", "public", "assets");
  fs.mkdirSync(targetDir, { recursive: true });

  const targetImage = path.join(targetDir, "tileset.png");
  fs.copyFileSync(resolvedSource, targetImage);

  const manifest: Manifest = {
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

  const manifestPath = path.join(targetDir, "tileset-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`Imported tileset to ${targetImage}`);
  console.log(`Wrote manifest to ${manifestPath}`);
}

if (require.main === module) {
  importTileset(process.argv[2]);
}
