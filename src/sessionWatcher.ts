import * as fs from "node:fs";
import * as readline from "node:readline";
import { IDLE_AFTER_MS, SLEEP_AFTER_MS } from "./constants";
import { AgentStatus, inferStatusFromLine } from "./jsonlParser";
import { OpenClawAgent, getActiveSessionPath } from "./openclawConfig";

export type StatusChangeCallback = (agentId: string, status: AgentStatus, sessionPath: string | null) => void;

export class SessionWatcher {
  private watchers = new Map<string, fs.FSWatcher>();
  private idleTimers = new Map<string, NodeJS.Timeout>();
  private sleepTimers = new Map<string, NodeJS.Timeout>();
  private sessionPaths = new Map<string, string | null>();

  constructor(private readonly onStatusChange: StatusChangeCallback) {}

  watch(agent: OpenClawAgent): void {
    const sessionPath = getActiveSessionPath(agent);
    this.sessionPaths.set(agent.id, sessionPath);

    if (!sessionPath || !fs.existsSync(sessionPath)) {
      this.onStatusChange(agent.id, "offline", null);
      return;
    }

    let lastSize = fs.statSync(sessionPath).size;
    this.onStatusChange(agent.id, "idle", sessionPath);
    this.resetIdleTimer(agent.id);

    const watcher = fs.watch(sessionPath, () => {
      const stat = safeStat(sessionPath);
      if (!stat || stat.size <= lastSize) {
        return;
      }

      const stream = fs.createReadStream(sessionPath, {
        start: lastSize,
        end: stat.size - 1,
        encoding: "utf8"
      });

      lastSize = stat.size;

      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
      rl.on("line", (line) => {
        const status = inferStatusFromLine(line);
        if (!status) {
          return;
        }

        this.resetIdleTimer(agent.id);
        this.onStatusChange(agent.id, status, sessionPath);
      });
    });

    this.watchers.set(agent.id, watcher);
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }

    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }

    for (const timer of this.sleepTimers.values()) {
      clearTimeout(timer);
    }
  }

  private resetIdleTimer(agentId: string): void {
    const sessionPath = this.sessionPaths.get(agentId) ?? null;

    clearTimeout(this.idleTimers.get(agentId));
    clearTimeout(this.sleepTimers.get(agentId));

    this.idleTimers.set(
      agentId,
      setTimeout(() => {
        this.onStatusChange(agentId, "idle", sessionPath);
        this.sleepTimers.set(
          agentId,
          setTimeout(() => {
            this.onStatusChange(agentId, "sleeping", sessionPath);
          }, SLEEP_AFTER_MS)
        );
      }, IDLE_AFTER_MS)
    );
  }
}

function safeStat(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

