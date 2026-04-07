import chokidar, { FSWatcher } from "chokidar";
import * as fs from "node:fs";
import * as readline from "node:readline";
import { IDLE_AFTER_MS, SLEEP_AFTER_MS } from "./constants";
import { DiscoveredAgent, getActiveSessionPath } from "./openclawConfig";
import { AgentState, extractTaskHint, parseLineForState } from "./parser";

type StateCallback = (agentId: string, state: AgentState, sessionPath: string | null, taskHint?: string) => void;

export class OpenClawWatcher {
  private fileOffsets = new Map<string, number>();
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

    directoryWatcher.on("add", (filePath) => {
      if (filePath.endsWith(".jsonl")) {
        this.activateLatestSession(agent);
      }
    });

    directoryWatcher.on("change", (filePath) => {
      if (filePath.endsWith(".jsonl")) {
        const activePath = this.activeSessionPaths.get(agent.id);
        const latestPath = getActiveSessionPath(agent.sessionDir);
        if (latestPath && latestPath !== activePath) {
          this.activateLatestSession(agent);
        }
      }
    });

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
    }

    this.activeSessionPaths.set(agent.id, sessionPath);
    this.fileOffsets.set(sessionPath, safeStat(sessionPath)?.size ?? 0);
    this.onStateChange(agent.id, "idle", sessionPath);
    this.resetTimers(agent.id, sessionPath);

    const fileWatcher = chokidar.watch(sessionPath, { ignoreInitial: true });
    fileWatcher.on("change", () => {
      this.processAppendedContent(agent.id, sessionPath);
    });

    this.fileWatchers.set(sessionPath, fileWatcher);
  }

  private processAppendedContent(agentId: string, sessionPath: string): void {
    const stat = safeStat(sessionPath);
    if (!stat) {
      return;
    }

    const currentOffset = this.fileOffsets.get(sessionPath) ?? 0;
    if (stat.size <= currentOffset) {
      return;
    }

    const stream = fs.createReadStream(sessionPath, {
      start: currentOffset,
      end: stat.size - 1,
      encoding: "utf8"
    });

    this.fileOffsets.set(sessionPath, stat.size);

    const rl = readline.createInterface({
      input: stream,
      crlfDelay: Infinity
    });

    rl.on("line", (line) => {
      const state = parseLineForState(line);
      if (!state) {
        return;
      }

      this.resetTimers(agentId, sessionPath);
      this.onStateChange(agentId, state, sessionPath, extractTaskHint(line));
    });
  }

  private resetTimers(agentId: string, sessionPath: string): void {
    clearTimeout(this.idleTimers.get(agentId));
    clearTimeout(this.sleepTimers.get(agentId));

    this.idleTimers.set(
      agentId,
      setTimeout(() => {
        this.onStateChange(agentId, "idle", sessionPath);
        this.sleepTimers.set(
          agentId,
          setTimeout(() => {
            this.onStateChange(agentId, "sleeping", sessionPath);
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

