#!/usr/bin/env python3
"""
Pixel Office FastAPI Router for OpenClaw Gateway Integration

This module provides a FastAPI router that can be mounted into the main
OpenClaw gateway at any path (e.g., /pixel-office).

Usage in gateway:
    from pixel_office.backend.router import create_pixel_office_router
    app.include_router(create_pixel_office_router(), prefix="/pixel-office")
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, APIRouter, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import json
import asyncio
from datetime import datetime
from typing import Dict, List, Optional

# Module path resolution - works when installed as package
MODULE_DIR = Path(__file__).parent.resolve()
BACKEND_DIR = MODULE_DIR
PROJECT_DIR = BACKEND_DIR.parent
FRONTEND_DIR = PROJECT_DIR / "frontend"
CONFIG_DIR = PROJECT_DIR / "config"

# Default agent states (updated via OpenClaw integration)
_default_agent_states: Dict[str, dict] = {
    "cortex": {"state": "active", "task": "Chatting with EJ", "last_activity": datetime.utcnow().isoformat()},
    "scout": {"state": "offline", "task": None, "last_activity": None},
    "builder": {"state": "offline", "task": None, "last_activity": None},
    "architect": {"state": "offline", "task": None, "last_activity": None},
    "quick": {"state": "offline", "task": None, "last_activity": None},
    "analyst": {"state": "offline", "task": None, "last_activity": None},
}


class PixelOfficeManager:
    """Manages the Pixel Office state and connections."""
    
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.agent_states: Dict[str, dict] = _default_agent_states.copy()
    
    async def broadcast_agent_update(self, agent_id: str, state: dict):
        """Broadcast agent state update to all connected clients."""
        message = {
            "type": "agent_update",
            "agent_id": agent_id,
            "state": state,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        
        # Clean up disconnected clients
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)
    
    def update_agent_state(self, agent_id: str, state: str, task: Optional[str] = None):
        """Update an agent's state and broadcast to clients."""
        if agent_id in self.agent_states:
            self.agent_states[agent_id]["state"] = state
            self.agent_states[agent_id]["task"] = task
            self.agent_states[agent_id]["last_activity"] = datetime.utcnow().isoformat()
            asyncio.create_task(
                self.broadcast_agent_update(agent_id, self.agent_states[agent_id])
            )


# Global manager instance (shared across requests)
office_manager = PixelOfficeManager()


def get_fallback_html(base_path: str = "/pixel-office") -> str:
    """Return a fallback HTML page if the frontend file is missing."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Pixel Office - Loading</title>
        <style>
            body {{ 
                background: #1a1a2e; 
                color: #eee; 
                font-family: 'Courier New', monospace;
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 100vh; 
                margin: 0;
            }}
            .container {{ text-align: center; }}
            h1 {{ color: #0ff; }}
            p {{ color: #888; }}
            .pixel {{ font-size: 48px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="pixel">🧠</div>
            <h1>Pixel Office</h1>
            <p>Setting up the workspace...</p>
            <p>Frontend not found. Run setup to generate sprites.</p>
        </div>
    </body>
    </html>
    """


def create_pixel_office_router() -> APIRouter:
    """
    Create and configure the Pixel Office API router.
    
    Returns a FastAPI router that can be mounted at any prefix.
    """
    router = APIRouter(tags=["pixel-office"])
    
    @router.get("/", response_class=HTMLResponse)
    async def get_pixel_office(request: Request):
        """Serve the main pixel office HTML page."""
        index_path = FRONTEND_DIR / "index.html"
        if index_path.exists():
            # Read and inject base path for WebSocket
            content = index_path.read_text()
            # Inject the mount path into a meta tag for JS to use
            mount_path = str(request.scope.get("root_path", "")) or "/pixel-office"
            content = content.replace(
                '<head>',
                f"""<head>\n    <meta name="pixel-office-base" content="{mount_path}">"""
            )
            return HTMLResponse(content=content)
        return HTMLResponse(content=get_fallback_html(), status_code=200)
    
    @router.get("/config")
    async def get_office_config():
        """Return the office layout configuration."""
        config_path = CONFIG_DIR / "office-layout.json"
        if config_path.exists():
            return json.loads(config_path.read_text())
        return {"error": "Config not found"}
    
    @router.get("/agents/status")
    async def get_agent_status():
        """Return current status of all agents."""
        return {
            "agents": office_manager.agent_states,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    @router.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        """WebSocket endpoint for real-time agent status updates."""
        await websocket.accept()
        office_manager.active_connections.append(websocket)
        
        try:
            # Send initial state
            await websocket.send_json({
                "type": "init",
                "agents": office_manager.agent_states,
                "timestamp": datetime.utcnow().isoformat()
            })
            
            while True:
                # Wait for client messages
                data = await websocket.receive_json()
                
                # Handle potential commands from client
                if data.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
                
        except WebSocketDisconnect:
            if websocket in office_manager.active_connections:
                office_manager.active_connections.remove(websocket)
    
    @router.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "ok", "service": "pixel-office"}
    
    return router


def mount_static_files(app: FastAPI, mount_prefix: str = "/pixel-office"):
    """
    Mount static file directories to the FastAPI app.
    
    This should be called on the main FastAPI app, not the router,
    since routers cannot mount static files.
    
    Args:
        app: The main FastAPI application
        mount_prefix: The prefix where the router is mounted
    """
    if FRONTEND_DIR.exists():
        static_mounts = {
            f"{mount_prefix}/css": FRONTEND_DIR / "css",
            f"{mount_prefix}/js": FRONTEND_DIR / "js",
            f"{mount_prefix}/assets": FRONTEND_DIR / "assets",
        }
        
        for mount_path, directory in static_mounts.items():
            if directory.exists():
                app.mount(mount_path, StaticFiles(directory=directory), name=f"pixel-office-{mount_path.split('/')[-1]}")


# Public API for external updates
def update_agent_state(agent_id: str, state: str, task: Optional[str] = None):
    """
    Update an agent's state from external code (e.g., OpenClaw gateway).
    
    This is the public API that the gateway can call to update agent states
    when agents start/stop working.
    """
    office_manager.update_agent_state(agent_id, state, task)


def get_agent_status() -> Dict:
    """Get current status of all agents."""
    return {
        "agents": office_manager.agent_states,
        "timestamp": datetime.utcnow().isoformat()
    }


# For standalone testing
if __name__ == "__main__":
    import uvicorn
    
    # Create standalone app for testing
    app = FastAPI(title="Pixel Office (Standalone)", version="0.1.0")
    app.include_router(create_pixel_office_router(), prefix="/pixel-office")
    mount_static_files(app, "/pixel-office")
    
    print("🎮 Pixel Office starting at http://localhost:8082")
    print("📍 Gateway integration available at /pixel-office")
    uvicorn.run(app, host="0.0.0.0", port=8082)