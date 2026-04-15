# Pixel Office

Pixel Office is a standalone web app that visualizes OpenClaw agents as animated pixel-art coworkers in a virtual office.

Open the app in a browser at `http://localhost:3456`.

## What It Does

Pixel Office now includes:

- `server/` watches `~/.openclaw/agents/*/sessions/*.jsonl`
- state changes are broadcast to browsers over WebSockets
- `webview-ui/` renders a live office canvas with animated agents, room status, and editing tools
- a layout editor with paint, fill, select, move, copy, and seat assignment workflows
- saved rooms, active-room defaults, and project-backed persistence
- conflict-aware sync for shared project layouts and room slots
- runtime diagnostics for OpenClaw discovery, frontend build readiness, and startup warnings
- `SKILL.md` lets OpenClaw clone, build, and launch the app automatically

## Features

- live OpenClaw agent feed over WebSockets
- office simulation with movement, pathing, routines, and status-driven behaviors
- pixel-art office rendering with generated tiles and stylized character sprites
- room editing with undo/redo, drag paint, fill, marquee selection, move, and copy-drag
- room slot management with names, descriptions, tags, thumbnails, active-room support, and project persistence
- project sync diagnostics, readiness checks, recommendations, highlights, and narrative summaries

## Using With OpenClaw

Pixel Office looks for OpenClaw data under:

```text
~/.openclaw/
```

It reads agent session files from:

```text
~/.openclaw/agents/<agent-id>/sessions/*.jsonl
```

If `~/.openclaw/openclaw.json` exists, Pixel Office will use it for agent discovery first and fall back to directory discovery if parsing fails or no configured agents are found.

## Development

```bash
npm run install:all
npm start
```

`npm start` builds the server and frontend first, then launches the standalone app. It is the safest default command for everyday local use.

For active development:

```bash
npm run dev
```

On Windows PowerShell you can also run:

```powershell
.\scripts\start.ps1
```

## Persistence

Project-backed room state is stored in:

```text
data/layout.json
data/layout-slots.json
data/layout-slots-meta.json
```

- `layout.json` stores the current project room
- `layout-slots.json` stores named room slots
- `layout-slots-meta.json` stores metadata such as the active room

The browser also keeps a local draft and local UI preferences so the app can recover gracefully if the project save is unavailable.

## Runtime Checks

- `GET /api/health` returns a small health snapshot for smoke tests
- `GET /api/runtime-status` reports startup warnings such as missing OpenClaw directories or missing frontend builds
- if the frontend bundle is missing, the server now returns a helpful browser page instead of a blank failure

The browser UI also exposes a `Runtime Diagnostics` panel so startup issues are visible without opening server logs.

## Troubleshooting

- If no agents appear, check whether `~/.openclaw` exists and contains `agents/<agent-id>/sessions/*.jsonl`.
- If the app starts but the browser shows warnings, open the `Runtime Diagnostics` panel first.
- If the frontend bundle is missing, run `npm start` or `npm run build` from the project root.
- If project saves conflict, use the in-app conflict handling to reload the project copy or keep your local copy intentionally.

## Project Structure

```text
server/              Express + WebSocket server
webview-ui/          React browser client
data/                project-backed saved layouts and room slots
scripts/             local helper scripts
SKILL.md             OpenClaw setup skill
```
