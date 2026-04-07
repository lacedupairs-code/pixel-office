---
name: pixel-office
description: >
  Set up and run the Pixel Office visualizer, a standalone web app that shows
  OpenClaw agents in a pixel-art office at http://localhost:3456.
triggers:
  - "start pixel office"
  - "open pixel office"
  - "launch the office"
  - "show me the office"
  - "pixel office setup"
---

# Pixel Office Setup

## What this does

Clones `pixel-office` into `~/.openclaw/workspace/pixel-office`, installs dependencies,
builds the app, and starts the local server at `http://localhost:3456`.

## Steps

1. Check whether the repo already exists.
2. Clone it if missing, otherwise pull the latest changes.
3. Run `npm run install:all`.
4. Run `npm run build`.
5. If the app is not already listening on port `3456`, start it in the background.

## Commands

```bash
test -d ~/.openclaw/workspace/pixel-office || git clone https://github.com/lacedupairs-code/pixel-office.git ~/.openclaw/workspace/pixel-office
cd ~/.openclaw/workspace/pixel-office && git pull
cd ~/.openclaw/workspace/pixel-office && npm run install:all
cd ~/.openclaw/workspace/pixel-office && npm run build
if ! lsof -ti:3456 >/dev/null 2>&1; then
  cd ~/.openclaw/workspace/pixel-office && nohup npm start > ~/.openclaw/workspace/pixel-office/server.log 2>&1 &
fi
```

Open `http://localhost:3456` in your browser after startup.
