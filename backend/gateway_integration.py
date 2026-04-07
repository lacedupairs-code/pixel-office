#!/usr/bin/env python3
"""
Example: Integrating Pixel Office into the OpenClaw Gateway

This file shows how to integrate the Pixel Office router into the
main OpenClaw FastAPI gateway.

Add this to your gateway's main app file (e.g., app.py or main.py):
"""

from fastapi import FastAPI
from pathlib import Path
import sys

# Option 1: If pixel-office is installed in the workspace
# Add the workspace to path
WORKSPACE_DIR = Path("/home/distiller/.openclaw/workspace")
sys.path.insert(0, str(WORKSPACE_DIR))

# Option 2: If pixel-office is pip-installed (preferred)
# pip install -e /path/to/pixel-office

from pixel_office.backend.router import (
    create_pixel_office_router,
    mount_static_files,
    update_agent_state,  # Use this to update agent states
    FRONTEND_DIR,
)

# ... in your main FastAPI app setup:

def setup_pixel_office(app: FastAPI) -> None:
    """
    Add Pixel Office to the OpenClaw gateway.
    
    Usage in your gateway's main app:
        from pixel_office.backend.gateway_integration import setup_pixel_office
        setup_pixel_office(app)
    """
    # Create and mount the router at /pixel-office
    router = create_pixel_office_router()
    app.include_router(router, prefix="/pixel-office")
    
    # Mount static files (CSS, JS, assets)
    mount_static_files(app, "/pixel-office")
    
    print("✅ Pixel Office mounted at /pixel-office")


# Integration with OpenClaw Agent Hooks
def on_agent_start(agent_id: str, task: str = None):
    """Call this when an agent starts working."""
    update_agent_state(agent_id, "active", task)


def on_agent_idle(agent_id: str):
    """Call this when an agent goes idle."""
    update_agent_state(agent_id, "idle", None)


def on_agent_done(agent_id: str):
    """Call this when an agent completes work."""
    update_agent_state(agent_id, "idle", None)


def on_agent_thinking(agent_id: str, context: str = None):
    """Call this when an agent is processing/thinking."""
    update_agent_state(agent_id, "thinking", context)


def on_agent_offline(agent_id: str):
    """Call this when an agent goes offline."""
    update_agent_state(agent_id, "offline", None)


# Example: Complete FastAPI app with Pixel Office integrated
if __name__ == "__main__":
    """Test the gateway integration locally."""
    from fastapi import FastAPI
    import uvicorn
    
    app = FastAPI(title="OpenClaw Gateway + Pixel Office")
    
    # Mount Pixel Office
    setup_pixel_office(app)
    
    # Add some test endpoints
    @app.get("/")
    async def root():
        return {"message": "OpenClaw Gateway", "pixel_office": "/pixel-office"}
    
    @app.post("/api/agents/{agent_id}/start")
    async def agent_start(agent_id: str, task: str = None):
        on_agent_start(agent_id, task)
        return {"status": "ok", "agent": agent_id, "state": "active"}
    
    print("🚀 Gateway starting at http://localhost:18789")
    print("🎮 Pixel Office available at http://localhost:18789/pixel-office/")
    uvicorn.run(app, host="0.0.0.0", port=18789)