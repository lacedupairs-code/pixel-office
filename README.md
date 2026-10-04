# Pixel Office

## Detailed 3D office

The main office keeps the twelve existing rooms and live HQ/Jarvis/LacedupBot feed. Workers are animated POLYGON human characters, including new agents and bots. Hermes wears blue, OpenClaw orange, Cortex purple, and Agent Zero charcoal; Jarvis is a human receptionist. The Inspector renders a portrait from the selected worker's model.

The detailed interior adds workstation lamps and stationery, library books, lounge seating, reception accessories, a kitchenette, archive shelves and a cart. Room signs follow the 3D camera. Use **Overview** for the complete floor, **Desks** for the build workstations, or **Lounge** for the four agent desks. Selection follows and zooms in on a worker. Daylight is the default; the existing Night and quality controls remain available.

The lounge includes custom rounded leather seating, textile cushions, wood-grain desks, wall shelves, a notes board and floor lamps. Reception has a curved wood counter. Workstation screens show original editor graphics, and the security monitors render views of the actual office. High quality adds softened shadows, ambient occlusion, anti-aliasing and warm area lighting; low quality disables the extra camera renders and lighting for mobile performance. Open `/?demo=1&night=0&view=lounge` for the local lounge review with sample workers.

Every room has a tailored detail pass: server cable trays and ventilation, a library reading rug and lamp, conference folders and agenda art, studio acoustic panels and equipment storage, dispatch safety markings, build-floor shelving and drawers, lobby waiting-area finishes, break-room leather seating and coffee service, bot-wing shelving and a meeting table, vault lockboxes, and a finished security workstation. The exterior has three deliberately placed windows instead of a repeated window every two cells. Doors, existing agent seats and corridor routes are retained; added floor furniture is registered with pathfinding.

Synty assets stay in the ignored `private-assets/synty/{fbx,characters,textures}` directories, or the directory configured with `SYNTY_DIR`. They are licensed to the owner and must not be committed. The classic 2D office and its layout editor remain accessible at `/classic/`.

To verify the 3D scene, start the app with its private assets, then run `npm run test:office`. Set `OFFICE_TEST_URL` if it is not at `http://localhost:7012`, and `OFFICE_TEST_BROWSER` to choose a Playwright browser channel (default: `msedge`). Checks cover human rigs, portraits, all twelve rooms, filters, camera controls, mobile overflow, and fixture-based live unknown-agent/bot routing. They do not create real agent jobs.

Pixel Office is a standalone web app that visualizes OpenClaw agents as animated pixel-art coworkers in a virtual office.

Open the app in a browser at `http://localhost:3456`.

## What It Does
adding some text here
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

## Moving Around the 3D Office

- Drag with the mouse or one finger to move around the floor.
- Scroll or pinch to zoom toward the pointer; use the **+ / −** buttons for stepped zoom.
- Use the direction buttons, or click the scene and hold **WASD / arrow keys**, to move the view.
- Enable **Rotate** to rotate by dragging, or use right-drag with the mouse.
- Choose **Overview** or press **Home** while the scene is focused to reset the camera.
- Click an agent to follow them. Moving or zooming manually releases following while keeping that agent selected.

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
