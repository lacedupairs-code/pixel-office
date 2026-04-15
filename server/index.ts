import express from "express";
import * as http from "node:http";
import * as path from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { AgentRegistry } from "./agentRegistry";
import { DEFAULT_PORT } from "./constants";
import { isLayoutSaveRequest, readLayoutFile, writeLayoutFile } from "./layoutStore";
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
