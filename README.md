# Pixel Office

Pixel Office is a standalone web app that visualizes OpenClaw agents as animated pixel-art coworkers in a virtual office.

Open the app in a browser at `http://localhost:3456`.

## Current Scope

The app is being rebuilt around a Node.js server plus React frontend:

- `server/` watches `~/.openclaw/agents/*/sessions/*.jsonl`
- state changes are broadcast to browsers over WebSockets
- `webview-ui/` renders the browser UI that will become the full office canvas
- `SKILL.md` lets OpenClaw clone, build, and launch the app automatically

## Development

```bash
npm run install:all
npm run build
npm start
```

For active development:

```bash
npm run dev
```

## Project Structure

```text
server/              Express + WebSocket server
webview-ui/          React browser client
scripts/             local helper scripts
SKILL.md             OpenClaw setup skill
```
