import express from "express";
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

app.use(express.json({ limit: "1mb" }));

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

const distDir = path.resolve(process.cwd(), "webview-ui", "dist");
app.use(express.static(distDir));
app.get("*", (_request, response) => {
  response.sendFile(path.join(distDir, "index.html"));
});

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

const discovery = discoverAgents();
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
});

process.on("SIGINT", () => {
  watcher.dispose();
  wss.close();
  server.close(() => process.exit(0));
});
