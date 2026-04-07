import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { AgentSnapshot } from "./agentRegistry";

export interface WebviewInitPayload {
  agents: AgentSnapshot[];
  openClawBaseDir: string;
}

export class PixelOfficePanel {
  private panel: vscode.WebviewPanel | undefined;
  private lastPayload: WebviewInitPayload | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  show(payload: WebviewInitPayload): void {
    this.lastPayload = payload;

    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        "pixelOffice",
        "Pixel Office",
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });

      this.panel.webview.onDidReceiveMessage((message) => {
        if (message?.type === "webviewReady" && this.lastPayload) {
          void this.postInit(this.lastPayload);
        }
      });
    }

    this.panel.webview.html = getWebviewHtml(this.panel.webview, this.context);
    this.panel.reveal();
    void this.postInit(payload);
  }

  postAgentUpdate(agents: AgentSnapshot[]): Thenable<boolean> | undefined {
    return this.panel?.webview.postMessage({
      type: "agentUpdate",
      agents
    });
  }

  private postInit(payload: WebviewInitPayload): Thenable<boolean> | undefined {
    return this.panel?.webview.postMessage({
      type: "init",
      agents: payload.agents,
      openClawBaseDir: payload.openClawBaseDir
    });
  }
}

function getWebviewHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  const distDir = path.join(context.extensionPath, "webview-ui", "dist");
  const assetPath = resolveWebviewEntry(distDir);
  const scriptUri = fs.existsSync(assetPath)
    ? webview.asWebviewUri(vscode.Uri.file(assetPath))
    : undefined;

  const appMarkup = scriptUri
    ? `<script type="module" src="${scriptUri}"></script>`
    : `<script>document.getElementById("root").textContent = "Build the webview with npm run build:webview to load Pixel Office.";</script>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pixel Office</title>
  </head>
  <body>
    <div id="root"></div>
    ${appMarkup}
  </body>
</html>`;
}

function resolveWebviewEntry(distDir: string): string {
  const assetsDir = path.join(distDir, "assets");
  if (!fs.existsSync(assetsDir)) {
    return path.join(assetsDir, "index.js");
  }

  const entry = fs
    .readdirSync(assetsDir)
    .find((fileName) => fileName.startsWith("index-") && fileName.endsWith(".js"));

  return entry ? path.join(assetsDir, entry) : path.join(assetsDir, "index.js");
}
