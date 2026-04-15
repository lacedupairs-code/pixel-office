import express from "express";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { AgentRegistry } from "./agentRegistry";
import { DEFAULT_PORT } from "./constants";
import {
  isLayoutSaveRequest,
  isLayoutSlotSaveRequest,
  readLayoutFile,
  readLayoutSlotMetaFile,
  readLayoutSlotsFile,
  writeLayoutFile,
  writeLayoutSlotMetaFile,
  writeLayoutSlotsFile
} from "./layoutStore";
import { discoverAgents } from "./openclawConfig";
import { OpenClawWatcher } from "./watcher";

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const registry = new AgentRegistry();
const distDir = path.resolve(process.cwd(), "webview-ui", "dist");
const distIndexPath = path.join(distDir, "index.html");
const discovery = discoverAgents();
const runtimeStatus = {
  port,
  openClawDir: discovery.openClawDir,
  configPath: discovery.configPath,
  distReady: pathExists(distIndexPath),
  warnings: [...discovery.warnings]
};

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    port: runtimeStatus.port,
    distReady: runtimeStatus.distReady,
    agentCount: registry.getAll().length,
    warnings: runtimeStatus.warnings
  });
});

app.get("/api/runtime-status", (_request, response) => {
  response.json({
    ...runtimeStatus,
    agentCount: registry.getAll().length
  });
});

app.get("/api/layout", async (_request, response) => {
  try {
    const layout = await readLayoutFile();
    if (!layout) {
      response.status(404).json({ error: "No saved layout" });
      return;
    }

    response.json(layout);
  } catch (error) {
    console.error("Failed to read layout file", error);
    response.status(500).json({ error: "Unable to read layout" });
  }
});

app.put("/api/layout", async (request, response) => {
  if (!isLayoutSaveRequest(request.body)) {
    response.status(400).json({ error: "Invalid layout payload" });
    return;
  }

  try {
    const existing = await readLayoutFile();
    const expectedUpdatedAt = request.body.expectedUpdatedAt ?? null;
    const hasConflict =
      !request.body.force &&
      expectedUpdatedAt &&
      existing &&
      existing.updatedAt !== expectedUpdatedAt;

    if (hasConflict) {
      response.status(409).json({
        error: "Layout has changed on disk",
        updatedAt: existing.updatedAt,
        layout: existing.layout
      });
      return;
    }

    const saved = await writeLayoutFile(request.body.layout);
    response.json(saved);
  } catch (error) {
    console.error("Failed to write layout file", error);
    response.status(500).json({ error: "Unable to save layout" });
  }
});

app.get("/api/layout-slots", async (_request, response) => {
  try {
    response.json(await readLayoutSlotsFile());
  } catch (error) {
    console.error("Failed to read layout slots file", error);
    response.status(500).json({ error: "Unable to read layout slots" });
  }
});

app.get("/api/layout-slots/meta", async (_request, response) => {
  try {
    const [meta, slots] = await Promise.all([readLayoutSlotMetaFile(), readLayoutSlotsFile()]);
    const activeSlotId = meta.activeSlotId && slots[meta.activeSlotId] ? meta.activeSlotId : undefined;
    if (meta.activeSlotId && !activeSlotId) {
      await writeLayoutSlotMetaFile({});
    }

    response.json({ activeSlotId });
  } catch (error) {
    console.error("Failed to read layout slot meta file", error);
    response.status(500).json({ error: "Unable to read layout slot metadata" });
  }
});

app.put("/api/layout-slots/meta", async (request, response) => {
  if (request.body && typeof request.body !== "object") {
    response.status(400).json({ error: "Invalid layout slot metadata payload" });
    return;
  }

  const activeSlotId =
    typeof request.body?.activeSlotId === "string" ? (request.body.activeSlotId as string) : undefined;

  try {
    const slots = await readLayoutSlotsFile();
    if (activeSlotId && !slots[activeSlotId]) {
      response.status(404).json({ error: "Layout slot not found" });
      return;
    }

    response.json(await writeLayoutSlotMetaFile({ activeSlotId }));
  } catch (error) {
    console.error("Failed to write layout slot meta file", error);
    response.status(500).json({ error: "Unable to save layout slot metadata" });
  }
});

app.put("/api/layout-slots/:slotId", async (request, response) => {
  if (!isLayoutSlotSaveRequest(request.body)) {
    response.status(400).json({ error: "Invalid layout slot payload" });
    return;
  }

  try {
    const slots = await readLayoutSlotsFile();
    const existing = slots[request.params.slotId];
    const expectedUpdatedAt = request.body.expectedUpdatedAt ?? null;
    const hasConflict =
      !request.body.force &&
      expectedUpdatedAt &&
      existing &&
      existing.updatedAt !== expectedUpdatedAt;

    if (hasConflict) {
      response.status(409).json({
        error: "Layout slot has changed on disk",
        slotId: request.params.slotId,
        record: existing,
        slots
      });
      return;
    }

    slots[request.params.slotId] = request.body.record;
    response.json(await writeLayoutSlotsFile(slots));
  } catch (error) {
    console.error("Failed to write layout slot", error);
    response.status(500).json({ error: "Unable to save layout slot" });
  }
});

app.delete("/api/layout-slots/:slotId", async (request, response) => {
  try {
    const [slots, meta] = await Promise.all([readLayoutSlotsFile(), readLayoutSlotMetaFile()]);
    const existing = slots[request.params.slotId];
    const expectedUpdatedAt =
      typeof request.body?.expectedUpdatedAt === "string" ? (request.body.expectedUpdatedAt as string) : null;

    if (existing && expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
      response.status(409).json({
        error: "Layout slot has changed on disk",
        slotId: request.params.slotId,
        record: existing,
        slots
      });
      return;
    }

    delete slots[request.params.slotId];
    if (meta.activeSlotId === request.params.slotId) {
      await writeLayoutSlotMetaFile({});
    }

    response.json(await writeLayoutSlotsFile(slots));
  } catch (error) {
    console.error("Failed to delete layout slot", error);
    response.status(500).json({ error: "Unable to delete layout slot" });
  }
});

if (runtimeStatus.distReady) {
  app.use(express.static(distDir));
  app.get("*", (_request, response) => {
    response.sendFile(distIndexPath);
  });
} else {
  runtimeStatus.warnings.push(`Frontend build is missing at ${distIndexPath}. Run npm start or npm run build first.`);
  app.get("*", (_request, response) => {
    response
      .status(503)
      .type("html")
      .send(
        `<!doctype html><html><head><meta charset="utf-8"><title>Pixel Office</title><style>body{font-family:Segoe UI,sans-serif;background:#171311;color:#f3e7d2;padding:32px;line-height:1.5}code{background:#2a221c;padding:2px 6px;border-radius:6px}main{max-width:760px;margin:0 auto}h1{font-size:28px}pre{white-space:pre-wrap;background:#211b17;padding:16px;border-radius:14px;border:1px solid rgba(255,255,255,0.08)}</style></head><body><main><h1>Pixel Office needs a frontend build</h1><p>The server is running, but the browser bundle is missing.</p><p>Run <code>npm start</code> or <code>npm run build</code> from the project root, then reload this page.</p><pre>${runtimeStatus.warnings.join("\n")}</pre></main></body></html>`
      );
  });
}

function broadcast(payload: object): void {
  const serialized = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(serialized);
    }
  }
}

wss.on("connection", (socket) => {
  socket.send(
    JSON.stringify({
      type: "init",
      agents: registry.getAll()
    })
  );
});

for (const agent of discovery.agents) {
  registry.seed(agent.id, agent.isDefault);
}

const watcher = new OpenClawWatcher((agentId, state, sessionPath, taskHint) => {
  const existing = registry.get(agentId);
  const snapshot = registry.update(agentId, state, sessionPath, existing?.isDefault ?? false, taskHint);

  broadcast({
    type: "agentUpdate",
    agentId: snapshot.id,
    state: snapshot.state,
    taskHint: snapshot.taskHint,
    sessionPath: snapshot.sessionPath,
    isDefault: snapshot.isDefault
  });
});

for (const agent of discovery.agents) {
  watcher.watchAgent(agent);
}

server.listen(port, () => {
  console.log(`Pixel Office running at http://localhost:${port}`);
  for (const warning of runtimeStatus.warnings) {
    console.warn(`[startup] ${warning}`);
  }
});

process.on("SIGINT", () => {
  watcher.dispose();
  wss.close();
  server.close(() => process.exit(0));
});

function pathExists(targetPath: string) {
  try {
    fs.accessSync(targetPath);
    return true;
  } catch {
    return false;
  }
}
