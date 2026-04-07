# Pixel Office TODO

## Pending

- [ ] **Systemd Service:** Create systemd service file to keep Pixel Office server running persistently on port 8082
- [ ] **Gateway Integration:** Mount `/pixel-office` route into main OpenClaw gateway (port 18789) for unified access

## Completed

- [x] Generate placeholder sprites
- [x] Fix WebSocket URL path (`/ws` not `/pixel-office/ws`)
- [x] Run standalone server on port 8082
- [x] Verify WebSocket connection works
- [x] Push changes to GitHub