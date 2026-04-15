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
npm start
```

`npm start` now builds the server and frontend first, so it is the safest default command for everyday use.

For active development:

```bash
npm run dev
```

On Windows PowerShell you can also run:

```powershell
.\scripts\start.ps1
```

## Runtime Checks

- `GET /api/health` returns a small health snapshot for smoke tests
- `GET /api/runtime-status` reports startup warnings such as missing OpenClaw directories or missing frontend builds
- if the frontend bundle is missing, the server now returns a helpful browser page instead of a blank failure

## Project Structure

```text
server/              Express + WebSocket server
webview-ui/          React browser client
scripts/             local helper scripts
SKILL.md             OpenClaw setup skill
```
