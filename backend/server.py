#!/usr/bin/env python3
"""
Pixel Office Standalone Server

A simple FastAPI server that serves the Pixel Office frontend.
Run with: python server.py
Access at: http://localhost:8081
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import json
import asyncio
from datetime import datetime
from typing import Dict, List, Optional

app = FastAPI(title="Pixel Office", version="0.1.0")

# Path to frontend files
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

# Active WebSocket connections
active_connections: List[WebSocket] = []

# Agent state cache (updated by OpenClaw integration)
agent_states: Dict[str, dict] = {
    "cortex": {"state": "active", "task": "Chatting with EJ", "last_activity": datetime.utcnow().isoformat()},
    "scout": {"state": "offline", "task": None, "last_activity": None},
    "builder": {"state": "offline", "task": None, "last_activity": None},
    "architect": {"state": "offline", "task": None, "last_activity": None},
    "quick": {"state": "offline", "task": None, "last_activity": None},
    "analyst": {"state": "offline", "task": None, "last_activity": None},
}


@app.get("/", response_class=HTMLResponse)
async def get_pixel_office():
    """Serve the main pixel office HTML page."""
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path, media_type="text/html")
    return HTMLResponse(content=get_fallback_html(), status_code=200)


@app.get("/config")
async def get_office_config():
    """Return the office layout configuration."""
    config_path = Path(__file__).parent.parent / "config" / "office-layout.json"
    if config_path.exists():
        return json.loads(config_path.read_text())
    return {"error": "Config not found"}


@app.get("/agents/status")
async def get_agent_status():
    """Return current status of all agents."""
    return {"agents": agent_states, "timestamp": datetime.utcnow().isoformat()}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time agent status updates."""
    await websocket.accept()
    active_connections.append(websocket)
    
    try:
        # Send initial state
        await websocket.send_json({
            "type": "init",
            "agents": agent_states,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        while True:
            # Wait for client messages (could be used for interactivity)
            data = await websocket.receive_json()
            
            # Handle potential commands from client
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
            
    except WebSocketDisconnect:
        active_connections.remove(websocket)


async def broadcast_agent_update(agent_id: str, state: dict):
    """Broadcast agent state update to all connected clients."""
    message = {
        "type": "agent_update",
        "agent_id": agent_id,
        "state": state,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    for connection in active_connections:
        try:
            await connection.send_json(message)
        except Exception:
            pass


def update_agent_state(agent_id: str, state: str, task: Optional[str] = None):
    """Update an agent's state and broadcast to clients."""
    if agent_id in agent_states:
        agent_states[agent_id]["state"] = state
        agent_states[agent_id]["task"] = task
        agent_states[agent_id]["last_activity"] = datetime.utcnow().isoformat()
        asyncio.create_task(broadcast_agent_update(agent_id, agent_states[agent_id]))


def get_fallback_html() -> str:
    """Return a fallback HTML page if the frontend file is missing."""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <title>Pixel Office - Loading</title>
        <style>
            body { 
                background: #1a1a2e; 
                color: #eee; 
                font-family: 'Courier New', monospace;
                display: flex; 
                justify-content: center; 
                align-items: center; 
                height: 100vh; 
                margin: 0;
            }
            .container { text-align: center; }
            h1 { color: #0ff; }
            p { color: #888; }
            .pixel { font-size: 48px; }
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


# Mount static files for CSS and JS
if FRONTEND_DIR.exists():
    app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
    app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")


if __name__ == "__main__":
    import uvicorn
    print("🎮 Pixel Office starting at http://localhost:8082")
    uvicorn.run(app, host="0.0.0.0", port=8082)