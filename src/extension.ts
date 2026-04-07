import * as vscode from "vscode";
import { AgentRegistry } from "./agentRegistry";
import { discoverAgents, getOpenClawDir } from "./openclawConfig";
import { SessionWatcher } from "./sessionWatcher";
import { PixelOfficePanel } from "./webviewPanel";

export function activate(context: vscode.ExtensionContext): void {
  const registry = new AgentRegistry();
  const panel = new PixelOfficePanel(context);
  const openClawBaseDir = getOpenClawDir();

  const config = discoverAgents();
  for (const agent of config.agents) {
    registry.register(agent, null);
  }

  const watcher = new SessionWatcher((agentId, status, sessionPath) => {
    registry.upsertStatus(agentId, status, sessionPath);
    void panel.postAgentUpdate(registry.getAll());
  });

  for (const agent of config.agents) {
    watcher.watch(agent);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("pixelOffice.openPanel", () => {
      panel.show({
        agents: registry.getAll(),
        openClawBaseDir
      });
    }),
    vscode.commands.registerCommand("pixelOffice.openLayout", async () => {
      await vscode.window.showInformationMessage("Layout editing will land in a later milestone.");
    }),
    {
      dispose: () => watcher.dispose()
    }
  );
}

export function deactivate(): void {}

