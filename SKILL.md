---
name: pixel-office
description: >
  Set up and run Pixel Office, a standalone OpenClaw dashboard that shows
  agents in a live pixel-art office with room editing, saved rooms, and
  project-backed persistence at http://localhost:3456.
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

After startup, the browser UI provides:

- a live OpenClaw office view
- room editing tools
- saved room slots and active-room support
- runtime diagnostics if OpenClaw discovery or frontend build readiness need attention

## Steps

1. Check whether the repo already exists.
2. Clone it if missing, otherwise pull the latest changes.
3. Run `npm run install:all`.
4. If the app is not already listening on port `3456`, start it in the background with `npm start`.
5. Open `http://localhost:3456` in a browser.

## Commands

```bash
test -d ~/.openclaw/workspace/pixel-office || git clone https://github.com/lacedupairs-code/pixel-office.git ~/.openclaw/workspace/pixel-office
cd ~/.openclaw/workspace/pixel-office && git pull
cd ~/.openclaw/workspace/pixel-office && npm run install:all
if ! lsof -ti:3456 >/dev/null 2>&1; then
  cd ~/.openclaw/workspace/pixel-office && nohup npm start > ~/.openclaw/workspace/pixel-office/server.log 2>&1 &
fi
```

If the app opens with warnings, check the in-app `Runtime Diagnostics` panel first.
