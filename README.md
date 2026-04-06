# 🎮 Pixel Office

A cozy, pixel-art dashboard that visualizes AI agents working in a virtual office. Watch Cortex and subagents type at desks, take coffee breaks, or snooze on the couch — all in real-time.

![Pixel Office Preview](docs/preview.png)

## What is this?

Pixel Office is a real-time visualization of your OpenClaw agents as animated pixel characters in a top-down office scene. Instead of boring status tables, you get a living, breathing workspace where:

- 🟢 **Working agents** sit at desks, typing away with speech bubbles showing their current task
- 🟡 **Idle agents** wander around, grab coffee, or pace the office
- 🔴 **Sleeping agents** doze off — slumped over desks or crashed on the couch
- ⚫ **Offline agents** have left the building (empty chairs)

## Features

- **Real-time updates** via WebSocket — no refresh needed
- **6 agents by default:** Cortex (main), Scout, Builder, Architect, Quick, Analyst
- **Interactive:** Click an agent to see their last task or message
- **Ambient:** Day/night cycle, background office sounds (optional)
- **Customizable:** Rearrange furniture, swap sprites, add new rooms

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI (extends Mission Control) |
| WebSocket | FastAPI WebSocket |
| Frontend | HTML5 + Phaser.js |
| Sprites | Free pixel art (OpenGameArt, itch.io) |
| State Source | OpenClaw Gateway API |

## Quick Start

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/pixel-office.git
cd pixel-office

# Install backend dependencies (if extending Mission Control)
# (Already installed with OpenClaw)

# Run the server
# Access at http://localhost:8000/pixel-office
```

## Project Structure

```
pixel-office/
├── README.md
├── backend/
│   ├── routes/
│   │   └── pixel_office.py      # FastAPI route
│   └── websockets/
│       └── agent_status.py      # Real-time push
├── frontend/
│   ├── index.html
│   ├── css/
│   │   └── office.css
│   ├── js/
│   │   ├── phaser.min.js
│   │   └── office.js            # Scene, sprites, updates
│   └── assets/
│       └── sprites/              # Pixel characters, furniture
├── scripts/
│   └── generate_sprites.py      # Python sprite generator
└── config/
    └── office-layout.json       # Desk positions, rooms
```

## Agents

| Agent | Role | Desk Style |
|-------|------|------------|
| **Cortex** | Main assistant | Large desk, big monitor |
| **Scout** | Research agent | Desk with maps, magnifying glass |
| **Builder** | Code implementation | Workbench with blueprints |
| **Architect** | Agentic coding | Drafting table |
| **Quick** | Fast lookups | Small desk near coffee |
| **Analyst** | Data analysis | Spreadsheet station |

## Roadmap

- [ ] Phase 1: MVP — Single agent with 3 states
- [ ] Phase 2: Multi-agent office
- [ ] Phase 3: Click for task details
- [ ] Phase 4: Day/night cycle, ambient sounds
- [ ] Phase 5: Customizable layouts, themes

## Contributing

Pull requests welcome! Especially:
- New pixel art sprites
- Room themes (cyberpunk, forest, spaceship)
- Bug fixes and improvements

## License

MIT

---

Built with ❤️ by Cortex and EJ