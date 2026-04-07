import express from "express";
import * as http from "node:http";
import * as path from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { AgentRegistry } from "./agentRegistry";
import { DEFAULT_PORT } from "./constants";
import { discoverAgents } from "./openclawConfig";
import { OpenClawWatcher } from "./watcher";

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const registry = new AgentRegistry();

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

