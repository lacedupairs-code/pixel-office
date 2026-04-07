# Pixel Office

Pixel Office is a VS Code extension that visualizes OpenClaw agents as animated pixel-art coworkers in a virtual office.

## Status

The project is currently being rebuilt from the original FastAPI prototype into a TypeScript extension plus React webview. The first milestone focuses on:

- activating a VS Code extension
- discovering OpenClaw agents from `~/.openclaw`
- inferring agent status from JSONL transcript lines
- opening a webview panel that can receive live agent updates

## Development

```bash
npm install
npm run build
```

During active development, run:

```bash
npm run watch
```

Then launch the extension in a VS Code Extension Development Host with `F5`.

## Project Structure

```text
src/                 VS Code extension host
webview-ui/          React webview application
scripts/             local asset import helpers
dist/                compiled extension bundle
```

