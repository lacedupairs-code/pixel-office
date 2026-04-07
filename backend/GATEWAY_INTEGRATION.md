# Pixel Office - Gateway Integration

This directory contains the FastAPI router and utilities for integrating
Pixel Office with the OpenClaw gateway.

## Files

| File | Description |
|------|-------------|
| `router.py` | FastAPI router with all endpoints and WebSocket support |
| `gateway_integration.py` | Helper functions for OpenClaw gateway integration |
| `__init__.py` | Package exports |
| `server.py` | Standalone server (legacy, use router.py for gateway) |

## Quick Start

### 1. Mount in Gateway

Add to your OpenClaw gateway's main app:

```python
from pixel_office.backend.router import create_pixel_office_router, mount_static_files

# Add router
app.include_router(create_pixel_office_router(), prefix="/pixel-office")

# Mount static files
mount_static_files(app, "/pixel-office")
```

### 2. Update Agent States

Use the public API to update agent states:

```python
from pixel_office.backend.router import update_agent_state

# When agent starts working
update_agent_state("builder", "active", "Building feature X")

# When agent goes idle
update_agent_state("cortex", "idle")

# When agent goes offline
update_agent_state("scout", "offline")
```

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /pixel-office/` | Main HTML page |
| `GET /pixel-office/config` | Office layout config |
| `GET /pixel-office/agents/status` | Current agent states |
| `WS /pixel-office/ws` | Real-time updates WebSocket |
| `GET /pixel-office/health` | Health check |
| `GET /pixel-office/css/*` | Static CSS files |
| `GET /pixel-office/js/*` | Static JS files |
| `GET /pixel-office/assets/*` | Static assets |

## Testing

Run the standalone test server:

```bash
cd /home/distiller/.openclaw/workspace/pixel-office/backend
python router.py
```

Then open http://localhost:8082/pixel-office/

## Agent States

- `active` - Agent is working (shown as bright, pulsing)
- `idle` - Agent is idle (dimmed)
- `thinking` - Agent is processing (pulse effect)
- `sleeping` - Agent is sleeping (very dim)
- `offline` - Agent is offline (faded)