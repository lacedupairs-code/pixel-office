import chokidar, { FSWatcher } from "chokidar";
import * as fs from "node:fs";
import { IDLE_AFTER_MS, SLEEP_AFTER_MS } from "./constants";
import { DiscoveredAgent, getActiveSessionPath } from "./openclawConfig";
import { AgentState, extractTaskHint, parseLineForState } from "./parser";

type StateCallback = (agentId: string, state: AgentState, sessionPath: string | null, taskHint?: string) => void;

export class OpenClawWatcher {
  private fileOffsets = new Map<string, number>();
  private fileRemainders = new Map<string, string>();
  private activeSessionPaths = new Map<string, string | null>();
  private directoryWatchers: FSWatcher[] = [];
  private fileWatchers = new Map<string, FSWatcher>();
  private idleTimers = new Map<string, NodeJS.Timeout>();
  private sleepTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly onStateChange: StateCallback) {}

  watchAgent(agent: DiscoveredAgent): void {
    const directoryWatcher = chokidar.watch(agent.sessionDir, {
      ignoreInitial: false,
      depth: 0
    });

    const refreshActiveSession = (filePath?: string) => {
      if (filePath && !filePath.endsWith(".jsonl")) {
        return;
      }

      const activePath = this.activeSessionPaths.get(agent.id);
      const latestPath = getActiveSessionPath(agent.sessionDir);
      if (latestPath !== activePath) {
        this.activateLatestSession(agent);
      }
    };

    directoryWatcher.on("add", refreshActiveSession);
    directoryWatcher.on("change", refreshActiveSession);
    directoryWatcher.on("unlink", refreshActiveSession);
    directoryWatcher.on("ready", () => this.activateLatestSession(agent));

    this.directoryWatchers.push(directoryWatcher);
    this.activateLatestSession(agent);
  }

  dispose(): void {
    for (const watcher of this.directoryWatchers) {
      void watcher.close();
    }

    for (const watcher of this.fileWatchers.values()) {
      void watcher.close();
    }

    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }

    for (const timer of this.sleepTimers.values()) {
      clearTimeout(timer);
    }
  }

  private activateLatestSession(agent: DiscoveredAgent): void {
    const sessionPath = getActiveSessionPath(agent.sessionDir);
    const previousPath = this.activeSessionPaths.get(agent.id);

    if (!sessionPath) {
      this.activeSessionPaths.set(agent.id, null);
      this.onStateChange(agent.id, "offline", null);
      return;
    }

    if (previousPath === sessionPath && this.fileWatchers.has(sessionPath)) {
      return;
    }

    if (previousPath) {
      const previousWatcher = this.fileWatchers.get(previousPath);
      if (previousWatcher) {
        void previousWatcher.close();
        this.fileWatchers.delete(previousPath);
      }

      this.fileRemainders.delete(previousPath);
    }

    this.activeSessionPaths.set(agent.id, sessionPath);
    this.fileOffsets.set(sessionPath, safeStat(sessionPath)?.size ?? 0);
    this.fileRemainders.set(sessionPath, "");
    const initialSnapshot = readInitialSessionSnapshot(sessionPath);
    this.onStateChange(agent.id, initialSnapshot.state, sessionPath, initialSnapshot.taskHint);
    this.resetTimers(agent.id, sessionPath, initialSnapshot.elapsedMs);

    const fileWatcher = chokidar.watch(sessionPath, { ignoreInitial: true });
    fileWatcher.on("change", () => {
      this.processAppendedContent(agent.id, sessionPath);
    });
    fileWatcher.on("unlink", () => {
      this.fileWatchers.delete(sessionPath);
      this.fileOffsets.delete(sessionPath);
      this.fileRemainders.delete(sessionPath);
      if (this.activeSessionPaths.get(agent.id) === sessionPath) {
        this.activeSessionPaths.set(agent.id, null);
        this.onStateChange(agent.id, "offline", null);
      }
    });

    this.fileWatchers.set(sessionPath, fileWatcher);
  }

  private processAppendedContent(agentId: string, sessionPath: string): void {
    const stat = safeStat(sessionPath);
    if (!stat) {
      return;
    }

    const currentOffset = this.fileOffsets.get(sessionPath) ?? 0;
    if (stat.size < currentOffset) {
      this.fileOffsets.set(sessionPath, 0);
      this.fileRemainders.set(sessionPath, "");
    }

    const nextOffset = this.fileOffsets.get(sessionPath) ?? 0;
    if (stat.size <= nextOffset) {
      return;
    }

    const stream = fs.createReadStream(sessionPath, {
      start: nextOffset,
      end: stat.size - 1,
      encoding: "utf8"
    });

    this.fileOffsets.set(sessionPath, stat.size);
    const chunks: string[] = [];
    stream.on("data", (chunk: string | Buffer) => {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });
    stream.on("end", () => {
      const previousRemainder = this.fileRemainders.get(sessionPath) ?? "";
      const combined = previousRemainder + chunks.join("");
      const endsWithNewline = combined.endsWith("\n") || combined.endsWith("\r");
      const lines = combined.split(/\r?\n/);
      const remainder = endsWithNewline ? "" : lines.pop() ?? "";

      this.fileRemainders.set(sessionPath, remainder);

      for (const line of lines) {
        const state = parseLineForState(line);
        if (!state) {
          continue;
        }

        this.resetTimers(agentId, sessionPath);
        this.onStateChange(agentId, state, sessionPath, extractTaskHint(line));
      }
    });
  }

  private resetTimers(agentId: string, sessionPath: string, elapsedMs = 0): void {
    clearTimeout(this.idleTimers.get(agentId));
    clearTimeout(this.sleepTimers.get(agentId));

    const remainingIdleMs = Math.max(0, IDLE_AFTER_MS - elapsedMs);
    const remainingSleepMs = Math.max(0, SLEEP_AFTER_MS - elapsedMs);

    if (elapsedMs >= SLEEP_AFTER_MS) {
      this.onStateChange(agentId, "sleeping", sessionPath);
      return;
    }

    if (elapsedMs >= IDLE_AFTER_MS) {
      this.onStateChange(agentId, "idle", sessionPath);
      this.sleepTimers.set(
        agentId,
        setTimeout(() => {
          this.onStateChange(agentId, "sleeping", sessionPath);
        }, remainingSleepMs)
      );
      return;
    }

    this.idleTimers.set(
      agentId,
      setTimeout(() => {
        this.onStateChange(agentId, "idle", sessionPath);
      }, remainingIdleMs)
    );

    this.sleepTimers.set(
      agentId,
      setTimeout(() => {
        this.onStateChange(agentId, "sleeping", sessionPath);
      }, remainingSleepMs)
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

function readInitialSessionSnapshot(sessionPath: string): {
  state: AgentState;
  taskHint?: string;
  elapsedMs: number;
} {
  const stat = safeStat(sessionPath);
  const elapsedMs = stat ? Math.max(0, Date.now() - stat.mtimeMs) : SLEEP_AFTER_MS;

  try {
    const content = fs.readFileSync(sessionPath, "utf8");
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-250);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line) {
        continue;
      }

      const state = parseLineForState(line);
      if (!state) {
        continue;
      }

      if (elapsedMs >= SLEEP_AFTER_MS) {
        return {
          state: "sleeping",
          taskHint: extractTaskHint(line),
          elapsedMs
        };
      }

      if (elapsedMs >= IDLE_AFTER_MS) {
        return {
          state: "idle",
          taskHint: extractTaskHint(line),
          elapsedMs
        };
      }

      return {
        state,
        taskHint: extractTaskHint(line),
        elapsedMs
      };
    }
  } catch {
    // Fall back to age-based defaults below.
  }

  if (elapsedMs >= SLEEP_AFTER_MS) {
    return { state: "sleeping", elapsedMs };
  }

  if (elapsedMs >= IDLE_AFTER_MS) {
    return { state: "idle", elapsedMs };
  }

  return { state: "idle", elapsedMs };
}
